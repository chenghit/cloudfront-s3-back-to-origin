'use strict';

const AWS = require('aws-sdk');

exports.handler = async (event, context) => {
    
    //console.log(JSON.stringify(event));
    
    const request = event.Records[0].cf.request;
    const response = event.Records[0].cf.response;
    const serverHeader = response.headers.server[0].value;
    const statusCode = response['status'];
    

    // Follow Secondary Origin 200, 206, or 
    if (serverHeader === 'UploadServer') {
        
        const myHeader = request.origin.custom.customHeaders['x-back-to-origin'][0].value;
        const myVariables = JSON.parse(myHeader);
        
        const sqs = new AWS.SQS({
            region: myVariables.region,
            apiVersion: '2012-11-05'
        });
        const queueUrl = myVariables.queue_url;

        
        let contentLength = '0';
        let contentType = 'none';

        switch(statusCode) {
            case '200':
                contentLength = response.headers['content-length'][0].value;
                contentType = response.headers['content-type'][0].value;
                break;
            case '206':
                contentLength = response.headers['content-range'][0].value;
                contentLength = contentLength.split('/');
                contentLength = contentLength.pop();
                contentType = response.headers['content-type'][0].value;
                break;
            case '304':
                console.info(response);
                break;
            default:
                console.info(response);
                return response;
        }
        
        const requestUri = request.uri;
        
        
        const message = {
                uri: requestUri,
                content_length: contentLength,
                content_type: contentType
        };
        let params = {
            MessageBody: JSON.stringify(message),
            QueueUrl: queueUrl
        };

        try {
            await sqs.sendMessage(params).promise();
            console.info(`SendMessage Success : ${params.MessageBody}`);
        } catch (err) {
            console.error('SendMessage Error :', err);
        }
      
    }    
    
    return response;
};
