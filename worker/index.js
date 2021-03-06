"use strict";


const mime = require('mime-types');
const _ = require('lodash');
const AWS = require('aws-sdk');
const MediaPlatform = require('media-platform-js-sdk').MediaPlatform;
const CreateFlowRequest = require("media-platform-js-sdk/src/platform/management/requests/create-flow-request");

const fs = require("fs");
const path = require('path');

const TASK_QUEUE_URL = process.env.TASK_QUEUE_URL;
const AWS_REGION = process.env.AWS_REGION;

const {WIXMP_IMPORT_DESTINATION, WIXMP_TRANSCODE_DESTINATION, WIXMP_OVERRIDE_EXISTING, WIXMP_USE_TIMESTAMP_IN_PATH, WIXMP_FLOW_USE_JSON_FILE} = process.env;

// init wixMP
const mediaPlatform = new MediaPlatform({
    domain: process.env.WIXMP_DOMAIN,
    appId: process.env.WIXMP_APPID,
    sharedSecret: process.env.WIXMP_SHARED_SECRET,
});


function deleteMessage(receiptHandle, cb) {
    const sqs = new AWS.SQS({region: AWS_REGION});
    sqs.deleteMessage({
        ReceiptHandle: receiptHandle,
        QueueUrl: TASK_QUEUE_URL
    }, cb);
}

function getFile(path, callback) {
    mediaPlatform.fileManager.getFile(path, function (error, result) {
        if (error) {
            console.log("Error in getFile", error);
            callback(error);
        } else if (result) {
            callback(null, result);
        }
    });
}

function deleteFile(path, callback) {
    mediaPlatform.fileManager.deleteFileByPath(path, function (error, result) {
        if (error) {
            callback(error);
        } else {
            callback(null, result);
        }
    });
}

function startInvocation(fileUrl, importPath, transcodeDirectory, callback) {
    let createFlowJsonObject = {};

    try {
        let createFlowJson = fs.readFileSync(path.join(__dirname, process.env.WIXMP_FLOW_USE_JSON_FILE)).toString();

        createFlowJson = createFlowJson.replace("{importUrl}", fileUrl)
            .replace("{importDestination}", importPath)
            .replace("{transcodeDestination}", transcodeDirectory);

        createFlowJsonObject = JSON.parse(createFlowJson);
    } catch (e) {
        console.log("error in parsing json ", e);
        callback("error in parsing json " + JSON.stringify(e));
    }

    const createFlowRequest = new CreateFlowRequest(createFlowJsonObject);

    mediaPlatform.flowManager.createFlow(createFlowRequest, function (err, data) {
        if (err) {
            callback("error in flow request: " + err, null);
        } else {
            console.log('success creating flow request', data);
            callback(null, _.get(data, ['id'], null));
        }
    });
}

function work(task, callback) {
    if (_.isString(task)) {
        try {
            task = JSON.parse(task);
        } catch (e) {
            task = null;
        }
    }

    const eventBody = _.get(task, ['Records', '0'], null);
    if (eventBody) {
        const s3 = new AWS.S3({region: AWS_REGION});

        const bucketName = _.get(eventBody, ['s3', 'bucket', 'name'], null);
        const timestamp = new Date().getTime();
        const objectKey = decodeURIComponent(_.get(eventBody, ['s3', 'object', 'key'], null));
        if (bucketName && objectKey) {
            // figure out if this is a video file
            const mimeType = mime.lookup(objectKey);
            if (mimeType.startsWith("video/")) {
                s3.getSignedUrl('getObject', {
                    Bucket: bucketName,
                    Key: objectKey,
                    Expires: 60 * 30
                }, function (err, fileUrl) {
                    const useTimestamp = WIXMP_USE_TIMESTAMP_IN_PATH === "true" && WIXMP_OVERRIDE_EXISTING === "false";

                    const importPath = WIXMP_IMPORT_DESTINATION + (useTimestamp ? '/' + timestamp : '') + "/" + objectKey;
                    const transcodeDirectory = WIXMP_TRANSCODE_DESTINATION + (useTimestamp ? '/' + timestamp : '');

                    console.log("Import Path", importPath);
                    console.log("Signed URL", fileUrl);


                    if (WIXMP_OVERRIDE_EXISTING === "true") {
                        // lets delete the file if it exists
                        getFile(importPath, function (err, result) {
                            if (err) {
                                const errObj = JSON.parse(err.message);
                                if (errObj.code === 404) {
                                    // 404 means file does not exist, we are good to go
                                    startInvocation(fileUrl, importPath, transcodeDirectory, callback);
                                } else {
                                    // this is another error, we need to fail
                                    console.log("Error checking if file exists in wixmp", err);
                                    callback(err);
                                }
                            } else if (result) {
                                // delete
                                deleteFile(importPath, function (err, result) {
                                    if (err) {
                                        console.log("Error deleting file from wixmp", err);
                                        callback(err);
                                    } else {
                                        startInvocation(fileUrl, importPath, transcodeDirectory, callback);
                                    }
                                });
                            }
                        });
                    } else {
                        startInvocation(fileUrl, importPath, transcodeDirectory, callback);
                    }
                });
            } else {
                callback("File is not a video, skipping " + JSON.stringify(task), null);
            }
        } else {
            // error
            callback("bucketName or objectKey are not set in the event data " + JSON.stringify(task), null);
        }
    } else {
        // no event data error
        callback("No event data received: " + JSON.stringify(task), null);
    }
}


exports.handler = (event, context, callback) => {
    console.log("Event", event);
    work(event.Body, function (err, flowId) {
        if (err) {
            callback(err);
        } else {
            if (!process.env.LAMBDA_LOCAL) {
                deleteMessage(event.ReceiptHandle, function (err, result) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, flowId);
                    }
                });
            } else {
                callback(null, flowId);
            }
        }
    });
};