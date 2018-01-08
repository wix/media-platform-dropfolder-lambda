"use strict";

const lambdaLocal = require('lambda-local');
const fs = require('fs');
const expect = require('expect.js');

const path = require('path');
const MediaPlatform = require('media-platform-js-sdk').MediaPlatform;

const WIXMP_DOMAIN = "wixmp-410a67650b2f46baa5d003c6.appspot.com";
const WIXMP_APPID = "48fa9aa3e9d342a3a33e66af08cd7fe3";
const WIXMP_SHARED_SECRET = "fad475d88786ab720b04f059ac674b0e";

let WIXMP_IMPORT_DESTINATION = "/teste2e/imports";
let WIXMP_TRANSCODE_DESTINATION = "/teste2e/transcodes";
let WIXMP_OVERRIDE_EXISTING = "false";
let WIXMP_USE_TIMESTAMP_IN_PATH = "false";

const mediaPlatform = new MediaPlatform({
    domain: WIXMP_DOMAIN,
    appId: WIXMP_APPID,
    sharedSecret: WIXMP_SHARED_SECRET,
});


describe('dropfolder e2e tests', function() {
    this.timeout(15 * 60 * 1000); // 15 min timeout
    it("S3 End To End Flow Control Success", function(done) {
        const jsonPayload = JSON.parse(fs.readFileSync(path.join(__dirname, 'examples/s3put.json')));

        WIXMP_USE_TIMESTAMP_IN_PATH = "true";

        executeLambda(jsonPayload, function (err, data) {
            if (err) {
                console.log(err);
                done();
            } else {
                console.log(data);
                // loop around to get the flow
                setTimeout(() => {
                    getFlow(data, function(err, result) {
                        expect(err).to.be(null);
                        expect(result).to.be(true);
                        done();
                    });
                }, 5000);
            }
        });
    });

    it("S3 End to End with overwrite success", function(done) {
        const jsonPayload = JSON.parse(fs.readFileSync(path.join(__dirname, 'examples/s3put.json')));

        WIXMP_OVERRIDE_EXISTING = "true";

        executeLambda(jsonPayload, function (err, data) {
            if (err) {
                console.log(err);
                done();
            } else {
                console.log(data);
                // loop around to get the flow
                setTimeout(() => {
                    getFlow(data, function(err, result) {
                        expect(err).to.be(null);
                        expect(result).to.be(true);
                        done();
                    });
                }, 5000);
            }
        });
    });

    it("Existing file is not overwritten", function(done) {
        const jsonPayload = JSON.parse(fs.readFileSync(path.join(__dirname, 'examples/s3put.json')));

        WIXMP_USE_TIMESTAMP_IN_PATH = "false";

        executeLambda(jsonPayload, function (err, data) {
            if (err) {
                console.log(err);
                done();
            } else {
                console.log(data);
                // loop around to get the flow
                setTimeout(() => {
                    getFlow(data, function (err, result) {
                        expect(err).to.be(null);
                        expect(result).to.be(false);
                        done();
                    });
                }, 5000);
            }
        });
    });
});


function executeLambda(payload, callback) {
    lambdaLocal.execute({
        event: payload,
        lambdaPath: path.join(__dirname, '../index.js'),
        lambdaHandler: "handler",
        profilePath: '~/.aws/credentials',
        region: 'us-east-1',
        environment: {
            "WIXMP_DOMAIN": WIXMP_DOMAIN,
            "WIXMP_APPID": WIXMP_APPID,
            "WIXMP_SHARED_SECRET": WIXMP_SHARED_SECRET,
            "WIXMP_IMPORT_DESTINATION": WIXMP_IMPORT_DESTINATION,
            "WIXMP_TRANSCODE_DESTINATION": WIXMP_TRANSCODE_DESTINATION,
            "WIXMP_OVERRIDE_EXISTING": WIXMP_OVERRIDE_EXISTING,
            "WIXMP_USE_TIMESTAMP_IN_PATH": WIXMP_USE_TIMESTAMP_IN_PATH,
            "LAMBDA_LOCAL": true,
            "AWS_REGION": "us-east-1",
            "TASK_QUEUE_URL": null
        },
        profileName: 'default',
        timeoutMs: 5 * 60 * 1000, // 5 minutes
        callback: callback
    });
}

function getFlow(id, callback) {
    mediaPlatform.flowManager.getFlow(id, function(err, response) {
        if(err) {
            console.error(err);
        } else {
            let t = setTimeout(() => {
                getFlow(id, callback);
            }, 5000);

            let success = true;
            let failed = false;
            for(let i in response.flow) {
                if(response.flow[i]) {
                    // if at least one job has status error, we break
                    if (response.flow[i].status === "error") {
                        failed = true;
                        break;
                    }
                    // if at least one job has status pending, we break
                    if (response.flow[i].status !== "success") {
                        success = false;
                        break;
                    }
                }
            }

            console.log("Response: ", response);

            if (failed) {
                console.error("failed");
                clearTimeout(t);
                callback(null, false);
            } else if(success) {
                console.log("success!");
                clearTimeout(t);
                callback(null, true);
            }
        }
    });

}