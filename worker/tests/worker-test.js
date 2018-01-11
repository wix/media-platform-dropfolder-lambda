"use strict";

const lambdaLocal = require('lambda-local');
const fs = require('fs');
const expect = require('expect.js');
const AWSMock = require('aws-sdk-mock');

const path = require('path');

const WIXMP_DOMAIN = "wixmp-410a67650b2f46baa5d003c6.appspot.com";
const WIXMP_APPID = "48fa9aa3e9d342a3a33e66af08cd7fe3";
const WIXMP_SHARED_SECRET = "fad475d88786ab720b04f059ac674b0e";

let WIXMP_IMPORT_DESTINATION = "/test/imports";
let WIXMP_TRANSCODE_DESTINATION = "/test/transcodes";
let WIXMP_OVERRIDE_EXISTING = "false";
let WIXMP_USE_TIMESTAMP_IN_PATH = "false";
let WIXMP_FLOW_USE_JSON_FILE = "json/default-flow.json";

describe('dropfolder integration tests', function() {
    this.timeout(30 * 1000); // 15 sec timeout

    beforeEach(function() {
        AWSMock.mock("SQS", "deleteMessage", function(params, callback) {
            callback(null, "successfully deleted message");
        });

        AWSMock.mock('S3', 'getSignedUrl', function (operation, params, callback) {
            callback(null, "http://www.example.com/signedUrl");
        });
    });

    afterEach(function() {
        AWSMock.restore("SQS", "deleteMessage");
        AWSMock.restore("S3", "getSignedUrl");
    });

    it("S3 SQS Event invokes Flow Control", function (done) {
        const jsonPayload = JSON.parse(fs.readFileSync(path.join(__dirname, 'examples/s3put.json')));

        WIXMP_USE_TIMESTAMP_IN_PATH = "true";

        executeLambda(jsonPayload, function (err, data) {
            expect(err).to.be(null);
            expect(data).to.be.a('string');
            done();
        });
    });

    it("Empty event body fails to parse", function (done) {
        const jsonPayload = JSON.parse(fs.readFileSync(path.join(__dirname, 'examples/badevent.json')));

        executeLambda(jsonPayload, function (err, data) {
            expect(err).to.contain("No event data received");
            expect(data).to.be(undefined);
            done();
        });
    });

    it("S3 SQS Event Overwrites file", function (done) {
        const jsonPayload = JSON.parse(fs.readFileSync(path.join(__dirname, 'examples/s3put.json')));

        WIXMP_OVERRIDE_EXISTING = "true";

        executeLambda(jsonPayload, function (err, data) {
            expect(err).to.be(null);
            expect(data).to.be.a('string');
            done();
        });
    });
});


function executeLambda(payload, callback) {
    lambdaLocal.execute({
        event: payload,
        lambdaPath: path.join(__dirname, '../index.js'),
        lambdaHandler: "handler",
        region: 'us-east-1',
        environment: {
            "WIXMP_DOMAIN": WIXMP_DOMAIN,
            "WIXMP_APPID": WIXMP_APPID,
            "WIXMP_SHARED_SECRET": WIXMP_SHARED_SECRET,
            "WIXMP_IMPORT_DESTINATION": WIXMP_IMPORT_DESTINATION,
            "WIXMP_TRANSCODE_DESTINATION": WIXMP_TRANSCODE_DESTINATION,
            "WIXMP_OVERRIDE_EXISTING": WIXMP_OVERRIDE_EXISTING,
            "WIXMP_USE_TIMESTAMP_IN_PATH": WIXMP_USE_TIMESTAMP_IN_PATH,
            "WIXMP_FLOW_USE_JSON_FILE": WIXMP_FLOW_USE_JSON_FILE,
            "LAMBDA_LOCAL": true,
            "AWS_REGION": "us-east-1",
            "TASK_QUEUE_URL": null
        },
        profileName: 'default',
        timeoutMs: 5 * 60 * 1000, // 5 minutes
        callback: callback
    });
}