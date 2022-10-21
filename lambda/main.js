'use strict';

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, json } = format;

const logger = createLogger({
    level: 'error',
    format: combine(
        timestamp(),
        json()
    ),
    transports: [new transports.Console()]
});

const md5 = require("md5");
const AWS = require('aws-sdk');
AWS.config.region = process.env.REGION;
const ddb = new AWS.DynamoDB.DocumentClient({apiVersion:'2012-08-10'});
const sqs = new AWS.SQS({apiVersion: '2012-11-05'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});

const {Storage} = require('@google-cloud/storage');
const gcp = new Storage();

const srcBucket = process.env.GCP_BUCKET;
const dstBucket = process.env.S3_BUCKET;
const singleQueueUrl = process.env.SINGLE_QUEUE_URL;
const mpuQueueUrl = process.env.MPU_QUEUE_URL;
const singleResultTable = process.env.SINGLE_RESULT_TABLE;
const mpuResultTable = process.env.MPU_RESULT_TABLE;

const partSize5MB = 5 * 1024 * 1024;
const partSize10MB = 10 * 1024 * 1024;
const partSize16MB = 16 * 1024 * 1024;
const partSize32MB = 32 * 1024 * 1024;
const singleSize16MB = 16 * 1024 * 1024;
const singleSize64MB = 64 * 1024 * 1024;
const singleSize256MB = 256 * 1024 * 1024;
const singleSize512MB = 512 * 1024 * 1024;

/*  Suggestion:
 *  - Scenario 1: 
 *      Mainly small files (images, js, css, html, etc); max file size <= 256MB:
 *        partSize = partSize5MB; maxSize = singleSize16MB;
 *  - Scenario 2: 
 *      Mainly medium files (zip, audio, short video, etc); max file size <= 512MB:
 *        partSize = partSize10MB; maxSize = singleSize64MB;
 *  - Scenario 3: 
 *      Mainly large files (apk, zip, video, etc); max file size <= 1GB:
 *        partSize = partSize16MB; maxSize = singleSize256MB;
 *  - Scenario 4: 
 *      Mainly very large files (apk, zip, video, etc); max file size may be up to 30GB:
 *        partSize = partSize32MB; maxSize = singleSize512MB;
 */

const maxSize = singleSize256MB;
const partSize = partSize16MB;
const cloudfrontSizeLimit = 30 * 1024 * 1024 * 1024;

exports.handler = async (event) => {
    try {
        for (const { body } of event.Records) {
            logger.info('Received SQS message');
            logger.info(body);
            const jBody = JSON.parse(body);
            const key = jBody.uri.substring(1);
            let contentLength = Number(jBody.content_length);
            let contentType = jBody.content_type;
            
            // If status 304, read metadata from GCS
            if (contentLength === 0 || contentType === 'none') {
                
                let metadata;
    
                try {
                    [metadata] = await gcp.bucket(srcBucket).file(key).getMetadata();
                } catch (err) {
                    logger.error(`Cannot found ${key} in ${srcBucket}`);
                    logger.error(err);
                    return;
                }
                
                contentType = metadata.contentType;
                contentLength = Number(metadata.size);
            }
            
            // Start data transfer processing.
            await dataTransferMain(key, contentLength, contentType);
        }
    } catch (err) {
        logger.error('DataTransfer-Main failed');
        logger.error(err);
        return;
    }
};

async function dataTransferMain (key, contentLength, contentType) {
    const ddbTable = process.env.DDB_TABLE;
    const keyParams = {
        TableName: ddbTable,
        Item: {
            uri: key,
            content_length: contentLength,
            content_type: contentType
        },
        ConditionExpression: 'attribute_not_exists(uri)'
    };
    
    try {
        /*  
            Conditional put item. Success put means the URI has not been transferred
            before and the further processing is needed. Otherwise, stop the Lambda
            Function.
            Don't use putDdbItem() function! We expect an error if contional put failed.
        */
        await ddb.put(keyParams).promise();
        logger.info('Writing the key in ddb success. Preparing the data transfer job.');
        
        // Further processing: if content length <= maxSize, transfer it directly
        if (contentLength > cloudfrontSizeLimit) {
            
            // Since CloudFront cannot cache files larger than 30GB, if contentLength
            // > 30GB, push an SNS nodification and stop the Lambda function.
            logger.error(`Content length ${contentLength} > 30GB, stop transfer job.`);
            return;
            
        } else if (contentLength <= maxSize) {
            const hash_id = md5(key, Date.now());
            const singleParams = {
                TableName: singleResultTable,
                Item: {
                    id: hash_id,
                    key: key,
                    content_length: contentLength,
                    content_type: contentType,
                    src_bucket: srcBucket,
                    dst_bucket: dstBucket,
                    complete: 'N'
                }
            };
            await putDdbItem(singleParams);
            
            // Distribute task to Lambda "Single" via a SQS FIFO queue.
            let message = singleParams.Item;
            message['content_length'] = contentLength.toString();
            delete message['complete'];
            const msg = JSON.stringify(message);
            const groupId = md5(msg, Date.now());
            const dupId = md5(msg);
            await sendSqsMsg(singleQueueUrl, msg, groupId, dupId);
            
        } else {
        
            // If content length > partSize, transfer it by range with S3 multipart upload.
            logger.info(`Split the object ${key} into parts by ${partSize} bytes.`);
            const multipartParams = {
                Bucket: dstBucket,
                Key: key,
                ContentType: contentType
            };
            const multipartUpload = await s3.createMultipartUpload(multipartParams). promise();
            const uploadId = multipartUpload.UploadId;
            logger.info(`Created upload ID: ${uploadId}`);
            let position = 0;
            const partQty = Math.ceil(contentLength / partSize);
            let i = 1;
            
            const mpuParams = {
                TableName: mpuResultTable,
                Item: {
                    upload_id: uploadId,
                    source_bucket: srcBucket,
                    destination_bucket: dstBucket,
                    key: key,
                    content_type: contentType,
                    part_qty: partQty,
                    part_count: 0,
                    complete: 'N'
                }
            };
            await putDdbItem(mpuParams);
            
            // Distribute tasks to Lambda "MPU" via a SQS FIFO queue.
            while (position < contentLength) {
                const startPosition = position.toString();
                const endPosition = (position + partSize - 1).toString();
                const message = {
                    src_bucket: srcBucket,
                    key: key,
                    content_type: contentType,
                    dst_bucket: dstBucket,
                    upload_id: uploadId,
                    part: i.toString(),
                    start_byte: startPosition,
                    end_byte: endPosition
                };
                const msg = JSON.stringify(message);
                const groupId = md5(msg, Date.now());
                const dupId = md5(msg);
                await sendSqsMsg(mpuQueueUrl, msg, groupId, dupId);
                position += partSize;
                i += 1;
            }
        }
    } catch (err) {
        logger.error(`${key} exists in URI table.`);
        logger.error(err);
        return;
    }
}

// Write item to DynamoDB table.
async function putDdbItem (params) {
    try {
        await ddb.put(params).promise();
        logger.info('Successfully written the object to DynamoDB');
        logger.info(params);
    } catch (err) {
        logger.error('Failed to write the object to DynamoDB');
        logger.error(params);
        return;
    }
}

// Send message to SQS queue.
async function sendSqsMsg (queueUrl, msg, groupId, dupId) {
    const params = {
        QueueUrl: queueUrl,
        MessageBody: msg,
        MessageGroupId: groupId,
        MessageDeduplicationId: dupId
    };
    try {
        await sqs.sendMessage(params).promise();
        logger.info(`SendMessage Success : ${msg}`);
    } catch (err) {
        logger.error(`SendMessage Error : ${msg}`);
        logger.error(err);
        return;
    }
}