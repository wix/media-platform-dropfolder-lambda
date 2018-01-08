"use strict";

const _ = require('lodash');
const AWS = require('aws-sdk');
const Invocation = require("media-platform-js-sdk/src/platform/management/metadata/invocation");
const MediaPlatform = require('media-platform-js-sdk').MediaPlatform;
const ImportFileRequest = require('media-platform-js-sdk/src/platform/management/requests/import-file-request');
const Destination = require("media-platform-js-sdk/src/platform/management/job/destination");
const FlowComponent = require("media-platform-js-sdk/src/platform/management/metadata/flow-component");
const TranscodeSpecification = require("media-platform-js-sdk/src/platform/management/job/transcode-specification");
const CreateFlowRequest = require("media-platform-js-sdk/src/platform/management/requests/create-flow-request");
const QualityRange = require("media-platform-js-sdk").QualityRange;

const TASK_QUEUE_URL = process.env.TASK_QUEUE_URL;
const AWS_REGION = process.env.AWS_REGION;

const {WIXMP_IMPORT_DESTINATION, WIXMP_TRANSCODE_DESTINATION, WIXMP_OVERRIDE_EXISTING, WIXMP_USE_TIMESTAMP_IN_PATH}  = process.env;

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
    mediaPlatform.fileManager.getFile(path, function(error, result) {
        if(error) {
            console.log("Error in getFile", error);
            callback(error);
        } else if(result) {
            callback(null, result);
        }
    });
}

function deleteFile(path, callback) {
    mediaPlatform.fileManager.deleteFileByPath(path, function(error, result) {
        if(error) {
            callback(error);
        } else {
            callback(null, result);
        }
    });
}

function startInvocation(fileUrl, importPath, transcodeDirectory, callback) {
    const invocation = new Invocation()
        .addEntryPoint("import");

    const importFileRequest = new ImportFileRequest()
        .setDestination(new Destination().setPath(importPath).setAcl("public"))
        .setSourceUrl(fileUrl);

    const importComponent = new FlowComponent()
        .setType('file.import')
        .setSpecification(importFileRequest)
        .addSuccessor('transcode');

    const transcodeSpecification = new TranscodeSpecification()
        .setDestination(new Destination()
            .setDirectory(transcodeDirectory)
            .setAcl("public")
        ).setQualityRange(new QualityRange({minimum: "240p", maximum: "1440p"} ));

    const transcodeComponent = new FlowComponent()
        .setType('av.transcode')
        .setSpecification(transcodeSpecification)
        .setSuccessors([]);

    const createFlowRequest = new CreateFlowRequest()
        .setInvocation(invocation)
        .addFlowComponent("import", importComponent)
        .addFlowComponent("transcode", transcodeComponent);

    mediaPlatform.flowManager.createFlow(createFlowRequest, function(err, data) {
        if(err) {
            callback("error in flow request: " + err, null);
        } else {
            console.log('success creating flow request', data);
            callback(null, _.get(data, ['id'], null));
        }
    });
}

function work(task, callback) {
    if(_.isString(task)) {
        try {
            task = JSON.parse(task);
        } catch (e) {
            task = null;
        }
    }

    const eventBody = _.get(task, ['Records', '0'], null);
    if(eventBody) {
        const s3 = new AWS.S3({region: AWS_REGION});

        const bucketName = _.get(eventBody, ['s3', 'bucket', 'name'], null);
        const timestamp = new Date().getTime();
        const objectKey = _.get(eventBody, ['s3', 'object', 'key'], null);
        if(bucketName && objectKey) {
            s3.getSignedUrl('getObject', {
                Bucket: bucketName,
                Key: objectKey,
                Expires: 60 * 30
            }, function(err, fileUrl) {
                const useTimestamp = WIXMP_USE_TIMESTAMP_IN_PATH === "true" && WIXMP_OVERRIDE_EXISTING === "false";

                const importPath = WIXMP_IMPORT_DESTINATION + ( useTimestamp ? '/' + timestamp : '' ) + "/" + objectKey;
                const transcodeDirectory = WIXMP_TRANSCODE_DESTINATION + ( useTimestamp ? '/' + timestamp : '' );


                if(WIXMP_OVERRIDE_EXISTING === "true") {
                    // lets delete the file if it exists
                    getFile(importPath, function(err, result) {
                        if(err) {
                            const errObj = JSON.parse(err.message);
                            if(errObj.code === 404) {
                                // 404 means file does not exist, we are good to go
                                startInvocation(fileUrl, importPath, transcodeDirectory, callback);
                            } else {
                                // this is another error, we need to fail
                                console.log("Error checking if file exists in wixmp", err);
                                callback(err);
                            }
                        } else if(result) {
                            // delete
                            deleteFile(importPath, function(err, result) {
                                if(err) {
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
    work(event.Body, function(err, flowId) {
        if(err) {
            callback(err);
        } else {
            if(!process.env.LAMBDA_LOCAL) {
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