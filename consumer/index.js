'use strict';

const AWS = require('aws-sdk');
const async = require('async');

const TASK_QUEUE_URL = process.env.TASK_QUEUE_URL;
const WORKER_LAMBDA_NAME = process.env.WORKER_LAMBDA_NAME;
const AWS_REGION = process.env.AWS_REGION;

const sqs = new AWS.SQS({region: AWS_REGION});
const lambda = new AWS.Lambda({region: AWS_REGION});

function receiveMessages(callback) {
    const params = {
        QueueUrl: TASK_QUEUE_URL,
        MaxNumberOfMessages: 10
    };
    sqs.receiveMessage(params, function(err, data) {
        if (err) {
            console.error(err, err.stack);
            callback(err);
        } else {
            callback(null, data.Messages);
        }
    });
}

function invokeWorkerLambda(task, callback) {
    const params = {
        FunctionName: WORKER_LAMBDA_NAME,
        InvocationType: 'Event',
        Payload: JSON.stringify(task)
    };
    lambda.invoke(params, function(err, data) {
        if (err) {
            console.error(err, err.stack);
            callback(err);
        } else {
            callback(null, data);
        }
    });
}

function handleSQSMessages(context, callback) {
    receiveMessages(function(err, messages) {
        if (messages && messages.length > 0) {
            const invocations = [];
            messages.forEach(function(message) {
                invocations.push(function(callback) {
                    invokeWorkerLambda(message, callback);
                });
            });
            async.parallel(invocations, function(err) {
                if (err) {
                    console.error(err, err.stack);
                    callback(err);
                } else {
                    if (context.getRemainingTimeInMillis() > 20000) {
                        handleSQSMessages(context, callback);
                    } else {
                        callback(null, 'PAUSE');
                    }
                }
            });
        } else {
            callback(null, 'DONE');
        }
    });
}

exports.handler = function(event, context, callback) {
    handleSQSMessages(context, callback);
};