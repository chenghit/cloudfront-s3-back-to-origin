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

const fs = require('fs');
const getUuid = require('uuid-by-string');

const AWS = require('aws-sdk');
AWS.config.region = process.env.REGION;
const ddb = new AWS.DynamoDB.DocumentClient({apiVersion:'2012-08-10'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});

const {Storage} = require('@google-cloud/storage');
const gcp = new Storage();

const mpuTable = process.env.MPU_TABLE;
const mpuResultTable = process.env.MPU_RESULT_TABLE;

exports.handler = async (event) => {
    try {
        for (const { body } of event.Records) {
            logger.info(`Received SQS message : ${body}`);
            const task = JSON.parse(body);
            const uploadId = task.upload_id;
            const key = task.key;
            const contentType = task.content_type;
            const srcBucket = task.src_bucket;
            const dstBucket = task.dst_bucket;
            const part = Number(task.part);
            const startPosition = Number(task.start_byte);
            const endPosition = Number(task.end_byte);
            const localFile = '/tmp/' + getUuid((key + Date.now().toString()), 3);  // 3 means MD5 algorithm
            let buffer;

            logger.info(`Copying part #${part} of ${key} from ${srcBucket} ...`);
            
            const taskParams = {
                TableName: mpuTable,
                Item: {
                    upload_id: uploadId,
                    part: part,
                    start_byte: startPosition,
                    end_byte: endPosition,
                    src_bucket: srcBucket,
                    dst_bucket: dstBucket,
                    key: key,
                    content_type: contentType,
                    part_complete: 'N',
                    start_time: Date.now()
                }
            };
            // Write task to mpu table
            await ddb.put(taskParams).promise();
            
            // Download object from GCS src_bucket by range
            const gcsParams = {
                bucket: srcBucket,
                key: key,
                options: {
                    destination: localFile,
                    start: startPosition,
                    end: endPosition
                }
            };
            await downloadPortionGCSFile(gcsParams);
            
            // Check if localFile exists
            let contentLength;
            if (fs.existsSync(localFile)) {
                const fileStat = fs.statSync(localFile);
                contentLength = fileStat.size;
                buffer = fs.readFileSync(localFile);
            } else {
                logger.error(`${localFile} does not exist in /tmp/.`);
                return;
            }
            logger.info(`Part download is complete. ${contentLength} bytes.`);
            
            // Upload the part to S3
            const uploadParams = {
                Key: key,
                Bucket: dstBucket,
                Body: buffer,
                PartNumber: part,
                UploadId: uploadId
            };
            
            let eTag = '';
            await s3.uploadPart(uploadParams).promise()
                    .then((result) => {
                        eTag = JSON.parse(result.ETag);
                        logger.info(`Data uploaded. Entity tag: ${eTag} Part: ${uploadParams.PartNumber}`);
                        });
            
            // Delete localFile
            fs.unlink(localFile, (err) => {
                if (err) { 
                    logger.error(err); 
                    return;
                }
            });
            
            logger.info(`Part upload ${dstBucket}/${key} is complete. Upload ID: ${uploadId}`);
            
            // Update mpu table
            const taskStatParams = {
                TableName: mpuTable,
                Key: {
                    upload_id: uploadId,
                    part: part
                },
                UpdateExpression: 'set part_complete = :complete, finish_time = :finish_time, etag = :etag',
                ExpressionAttributeValues: {
                    ':complete': 'Y',
                    ':finish_time': Date.now(),
                    ':etag': eTag
                },
                ReturnValues: 'UPDATED_NEW'
            };
            await ddb.update(taskStatParams).promise();
            
            // Calculate the count of completed S3 parts and update it to mpu result table.
            let queryParams = {
                TableName: mpuTable,
                KeyConditionExpression: 'upload_id = :id',
                ProjectionExpression: 'part',
                FilterExpression: 'part_complete = :part_complete',
                ExpressionAttributeValues: {
                    ':id': uploadId,
                    ':part_complete': 'Y'
                }
            };
            let response = await queryDdbItems(queryParams);
            let partCount = response.Count;
            
            let resultParams = {
                TableName: mpuResultTable,
                Key: { upload_id: uploadId },
                UpdateExpression: "set part_count = :count",
                ConditionExpression: 'complete = :c',
                ExpressionAttributeValues: {
                    ':count': partCount,
                    ':c': 'N'
                },
                ReturnValues: 'ALL_NEW'
            }; 
            response = await ddb.update(resultParams).promise();

            let partQty = response.Attributes.part_qty;
            
            // If count = parts quantity, complete S3 multipart upload.
            if (partCount === partQty) {
                let multipartMap = { Parts: [] };
                response = await ddb.query({
                    TableName: mpuTable,
                    KeyConditionExpression: 'upload_id = :id',
                    ExpressionAttributeValues: {
                        ':id': uploadId
                    }}).promise();

                let items = response.Items;
                for ( const i of items) {
                    multipartMap.Parts.push({
                        PartNumber: i.part, 
                        ETag: i.etag
                    });
                }
                
                logger.info('All parts have been uploaded.');
                logger.info(multipartMap);
                try {
                    const mpuResultParams = {
                        Bucket: dstBucket,
                        Key: key,
                        MultipartUpload: multipartMap,
                        UploadId: uploadId,
                    };
                    const result = await s3.completeMultipartUpload(mpuResultParams).promise();
                    logger.info(`Upload multipart completed. Location: ${result.Location} ETag: ${result.ETag}`);
                } catch (err) {
                    logger.error(`Error completing S3 multipart. ${err.message}`);
                    return;
                }
                
                // Record task result
                resultParams = {
                    TableName: mpuResultTable,
                    Key: { upload_id: uploadId },
                    UpdateExpression: 'set complete = :complete, complete_time = :ctime',
                    ExpressionAttributeValues: {
                        ':complete': 'Y',
                        ':ctime': Date.now()
                    },
                    ReturnValues: 'UPDATED_NEW'
                };
                await ddb.update(resultParams).promise();
                
                // Delete temp task from ddb
                let k = 1;
                while (k <= partQty) {
                    await ddb.delete({
                        TableName: mpuTable,
                        Key: {
                            upload_id: uploadId,
                            part: k
                        }
                    }).promise();
                    k++;
                }
                
                logger.info(`Multipart upload entire ${dstBucket}/${key} is complete.`);
            }
        } 
        
    } catch (err) {
        logger.error(`Error part uploading. ${err.message}`);
        return;
    }
};


//  Download a portion of file from GCS to local. Google Cloud Storage does not
//  support portion streaming transfer.
async function downloadPortionGCSFile(params) {
    try {
        await gcp.bucket(params.bucket).file(params.key).download(params.options);
        logger.info(`Downloaded ${params.key} bytes=${params.options.start}-${params.options.end}.`);
    } catch (err) {
        logger.error(`Download ${params.key} bytes=${params.options.start}-${params.options.end} failed`);
        logger.error(err);
    }
}

// Helper function: query ddb item
async function queryDdbItems (params) {
    return new Promise((resolve, reject) => {
        ddb.query(params, (err, data) => {
            if (err) return reject(err);
            resolve(data);
        });
    });
}