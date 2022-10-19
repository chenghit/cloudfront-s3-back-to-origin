'use-strict';

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

const AWS = require('aws-sdk');
AWS.config.region = 'ap-southeast-1';
const ddb = new AWS.DynamoDB.DocumentClient({apiVersion:'2012-08-10'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});

const {Storage} = require('@google-cloud/storage');
const gcp = new Storage();

const singleTable = process.env.SINGLE_TABLE;
const singleResultTable = process.env.SINGLE_RESULT_TABLE;

exports.handler = async (event) => {
    try {
        for (const { body } of event.Records) {
            logger.info(`Received SQS message : ${body}`);
            const task = JSON.parse(body);
            const id = task.id;
            const key = task.key;
            const contentLength = Number(task.content_length);
            const contentType = task.content_type;
            const srcBucket = task.src_bucket;
            const dstBucket = task.dst_bucket;

            logger.info(`Copying ${srcBucket}/${key} to ${dstBucket} ...`);
            
            const taskParams = {
                TableName: singleTable,
                Item: {
                    id: id,
                    src_bucket: srcBucket,
                    dst_bucket: dstBucket,
                    key: key,
                    content_length: contentLength,
                    content_type: contentType,
                    complete: 'N',
                    start_time: Date.now()
                }
            };
            // Write task to single table
            await putDdbItem(taskParams);
            
            // Streaming download and upload file simultaneously
            await streamingTransfer(srcBucket, key, dstBucket, contentType);
        
            // Update task result on singleResultTable
            const resultParams = {
                TableName: singleResultTable,
                Key: {id: id},
                UpdateExpression: 'set complete = :c, complete_time = :ctime',
                ExpressionAttributeValues: {
                    ':c': 'Y',
                    ':ctime': Date.now()
                },
                ReturnValues: 'UPDATED_NEW'
            };
            await ddb.update(resultParams).promise();
            
            // Delete task from singleTable
            await ddb.delete({
                TableName: singleTable,
                Key: {id: id}
                }).promise();
            
            logger.info(`DataTransfer-Single execution completed successfully.`);
            
        }
    } catch (err) {
        logger.error('DataTransfer-Single failed');
        logger.error(err);
        return;
    }
};

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

// Streaming download from GCS and upload to S3 simultaneously
async function streamingTransfer (srcBucket, key, dstBucket, contentType) {

    logger.info(`Start streaming transfer ${key}.`);
    let pass = await gcp
        .bucket(srcBucket)
        .file(key)
        .createReadStream();
    
    let params = {
        Key: key,
        Bucket: dstBucket,
        Body: pass,
        ContentType: contentType
    };

    await s3.upload(params).promise();
    logger.info(`Streaming transfer ${key} is completed.`);
    
}