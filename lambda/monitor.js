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

const md5 = require('md5');
const AWS = require('aws-sdk');
AWS.config.region = process.env.REGION;
const ddb = new AWS.DynamoDB.DocumentClient({apiVersion:'2012-08-10'});
const sqs = new AWS.SQS({apiVersion: '2012-11-05'});

const singleTable = process.env.SINGLE_TABLE;
const singleQueueUrl = process.env.SINGLE_QUEUE_URL;
const mpuTable = process.env.MPU_TABLE;
const mpuResultTable = process.env.MPU_RESULT_TABLE;
const mpuQueueUrl = process.env.MPU_QUEUE_URL;

exports.handler = async (event) => {
    
/*
 *  Monitor multipart upload tasks.
 */
 
    const uploadIds = [];
    let params;
    
    // Scan mpu result table to collect 'upload_id' values of incompleted tasks
    params = {
        TableName: mpuResultTable,
        ProjectionExpression: 'upload_id',
        FilterExpression: 'complete = :complete',
        ExpressionAttributeValues: {
            ':complete': 'N',
        },
    };
    let incompletedTasks = await scanDdbTable(params).catch(logger.error);
    
    logger.info('Incompleted MPU tasks: ');
    logger.info(incompletedTasks);
    
    // Scan mpu table to collect timeout tasks
    let timeout = Date.now() - 300000;
    params = {
        TableName: mpuTable,
        FilterExpression: 'part_complete = :p AND start_time < :s',
        ExpressionAttributeValues: {
            ':p': 'N',
            ':s': timeout
        }
    };
    const incompletedParts = await scanDdbTable(params).catch(logger.error);
    
    logger.info('Incompleted MPU parts: ');
    logger.info(incompletedParts);
    
    // Push upload_id in a list
    for (const item of incompletedTasks) {
        uploadIds.push(item.upload_id);
    }
    
    logger.info(`Incompleted MPU upload IDs: ${uploadIds}`);
    
    for (const item of incompletedParts) {
        
        const uploadId = item.upload_id;
        const srcBucket = item.src_bucket;
        const key = item.key;
        const dstBucket = item.dst_bucket;
        const part = item.part;
        const startPosition = item.start_byte;
        const endPosition = item.end_byte;
        const contentType = item.content_type;
        
        // Re-invoke Lambda MPU by sending an SQS message if the task is fail or timeout
        if (uploadIds.includes(uploadId)) {
            
            params = {
                src_bucket: srcBucket,
                key: key,
                content_type: contentType,
                dst_bucket: dstBucket,
                upload_id: uploadId,
                part: part.toString(),
                start_byte: startPosition.toString(),
                end_byte: endPosition.toString()
            };
            const msg = JSON.stringify(params);
            const groupId = md5(msg, Date.now());
            const dupId = md5(msg);
            await sendSqsMsg(mpuQueueUrl, msg, groupId, dupId);
            
        } else {
            
            params = {
                TableName: mpuTable,
                Key: {
                    upload_id: uploadId,
                    part: part
                }
            };
            await ddb.delete(params).promise();
            logger.info(`Deleted upload ID ${uploadId} from DDB table ${mpuTable}`);
            
        }
    }
    
/*
 *  Monitor single streaming transfer tasks.
 */    
    timeout = Date.now() - 300000;
    
    // Scan single table to collect timeout tasks
    params = {
        TableName: singleTable,
        FilterExpression: 'complete = :c AND start_time < :s',
        ExpressionAttributeValues: {
            ':c': 'N',
            ':s': timeout
        }
    };
    incompletedTasks = await scanDdbTable(params).catch(logger.error);
    logger.info('Incompleted Single tasks:');
    logger.info(incompletedTasks);
    
    
    for (const item of incompletedTasks) {
        
        let message = item;
        message['content_length'] = item.content_length.toString();
        delete message['complete'];
        delete message['start_time'];
        
        // Re-invoke Lambda Single by sending an SQS message if the task is fail or timeout
        const msg = JSON.stringify(message);
        const groupId = md5(msg, Date.now());
        const dupId = md5(msg);
        await sendSqsMsg(singleQueueUrl, msg, groupId, dupId);
        
    }
};


// Helper function: scan DDB
async function scanDdbTable (params) {
    
    const scanResults = [];
    let items;
    do{
        items =  await ddb.scan(params).promise();
        items.Items.forEach((item) => scanResults.push(item));
        params.ExclusiveStartKey  = items.LastEvaluatedKey;
    }while(typeof items.LastEvaluatedKey !== "undefined");
    
    return scanResults;
    
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
        logger.error(err);
        return;
    }
}