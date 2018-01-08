# Media Platform Dropfolder Lambda

[![Build Status][travis-image]][travis-url] 

This is a Dropfolder monitoring solution for Wix Media Platform using AWS S3 buckets. 

Running through the guide below, you will be able to easily deploy a CloudFormation stack with all the necessary resources, within your own Amazon AWS Account.

Your users will be able upload files to an S3 bucket, and these files will automatically be ingested and transcoded inside the [Wix Media Platform](https://www.wixmp.com).

The solution uses Amazon Cloudformation, Amazon S3, Amazon SQS, and Amazon Lambda

The components in a nutshell:
1. An amazon S3 bucket with S3:ObjectCreated notifications, which are sent as messages to our Task Queue (SQS). 
1. A master handler (`/consumer/index.js`) in AWS Lambda which will poll the Task Queue once a minute (triggered by Cloudwatch).
1. A worker handler (`/worker/index.js`) which will receive the event body from the master, and initiate the file import from S3 into WixMP.

## Instructions

### Prerequisites
Install and configure amazon aws CLI
https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-welcome.html

You need to have an S3 bucket for temporary deployment of source code for lambda functions. This is where AWS Lambda will load the code from.
Please Note: This is not the bucket to where you need to upload your Videos or other files you want imported to Wixmp.

To create the bucket please use the following command (*optional)
```
aws s3 mb s3://<YOUR-BUCKET-NAME-FOR-CODE-DEPLOYMENT>
```
Remember the bucket name, you will use it during the packaging stage.

### Deployment
Copy the `deploy.conf.dist` file to `deploy.conf`
```
cp deploy.conf.dist deploy.conf
```
 
Set your configuration options in the `deploy.conf` file ([more information about configuration options](#configuration-options))
```
WixmpDomain=<wixmp-domain>
WixmpAppId=<wixmp-appid>
WixmpSharedSecret=<wixmp-shared-secret>
WixmpImportDestination=/imports
WixmpTranscodeDestination=/transcodes
WixmpUseTimestampInPath=true
WixmpOverrideExisting=false
```

Package the code, and deploy to S3
```
npm run package -- --s3-bucket <YOUR-BUCKET-NAME-FOR-CODE-DEPLOYMENT>
```

Deploy the stack (specify a stack prefix name)
```
npm run deploy -- --stack-name <stack-prefix-name>
```

## Configuration options
Edit the deploy.conf file to setup your dropfolder environment
Valid options are:

### WixmpDomain
* required

Your WixMP domain
example: `wixmp-abcdefghijklmnop.appspot.com`

### WixmpAppId
* required

Your WixMP AppId
example: `abcdefghijklmnopqrstuvwxyz1234567890`

### WixmpSharedSecret
* required

Your WixMP AppId
example: `abcdefghijklmnopqrstuvwxyz1234567890`

### WixmpImportDestination
* optional
* default: `/imports`

The WixMP directory to where your files will be imported

example: `/myimportdestination`

### WixmpTranscodeDestination
* optional
* default: `/transcodes`

The WixMP directory to where the WixMP transcoder will save the transcoded files

example: `/mytranscodedfiles`


### WixmpUseTimestampInPath
* optional
* default: `false`

If set to `true`, the current timestamp will be appended to the `WixmpImportDestination` and `WixmpTranscodeDestination`.
Use this if you'd like to add a random seed to the file path.

### WixmpOverrideExisting
* optional
* default: `false`

If set to `true`, any existing files in WixMP with the same name will be deleted prior to importing. 

### DeployUsingExistingS3Bucket
* optional
* default: `false`

If set to `true`, together with the `DeployUsingS3BucketName` parameter, instructs CloudFormation to use an already existing bucket instead of creating a new bucket.
Important Note: Files that existed in the bucket prior to running CloudFormation will not be imported.  

### DeployUsingS3BucketName
* optional (required if DeployUsingExistingS3Bucket is true)
* type: string

Define this parameter if you wish to set a custom name for your bucket.
Important Note: Make sure the bucket name is not already taken. S3 bucket names are global for all Amazon customers.

To check if a bucket name is free:
```
aws s3 ls s3://<bucket-name>
```    
If the bucket does not exist, this command will return something like:
`An error occurred (NoSuchBucket) when calling the ListObjects operation: The specified bucket does not exist`

If the bucket exists, then you will either see a list of files in the result, or there will be an Access Denied error such as:
`An error occurred (AccessDenied) when calling the ListObjects operation: Access Denied`
or
`An error occurred (AllAccessDisabled) when calling the ListObjects operation: All access to this object has been disabled`


## References
https://github.com/wix/media-platform-js-sdk

https://github.com/widdix/sqs-lambda-example

https://cloudonaut.io/integrate-sqs-and-lambda-serverless-architecture-for-asynchronous-workloads/

[travis-image]: https://travis-ci.org/wix/media-platform-dropfolder-lambda.svg?branch=master
[travis-url]: https://travis-ci.org/wix/media-platform-dropfolder-lambda
