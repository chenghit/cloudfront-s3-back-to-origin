
# Welcome CloudFront-S3 Back To Origin project!

## Requirement

Clients <---> CloudFront <---> S3

If an object requested by clients is not present in S3 bucket, this solution will
fetch the object from the original Origin (the original storage).

## Solution architecture

![Solution architecture](/img/solution_architecture.png)

## Backend data tranfer architecture

Part of the code comes from [分布式 Lambda 从海外到中国自动同步S3文件](https://aws.amazon.com/cn/blogs/china/lambda-overseas-china-s3-file/)

![Backend data tranfer architecture](/img/backend_data_transfer_architecture.png)

## Deployment

This is a project demo for CDK development with Python.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

This project is set up like a standard Python project.  The initialization
process also creates a virtualenv within this project, stored under the `.venv`
directory.  To create the virtualenv it assumes that there is a `python3`
(or `python` for Windows) executable in your path with access to the `venv`
package. If for any reason the automatic creation of the virtualenv fails,
you can create the virtualenv manually.

To manually create a virtualenv on MacOS and Linux:

```
$ python3 -m venv .venv
```

After the init process completes and the virtualenv is created, you can use the following
step to activate your virtualenv.

```
$ source .venv/bin/activate
```

If you are a Windows platform, you would activate the virtualenv like this:

```
% .venv\Scripts\activate.bat
```

Once the virtualenv is activated, you can install the required dependencies.

```
$ pip install -r requirements.txt
```

This project was built using CDK version 2.46. Please make sure the AWS CDK CLI
version in your local environment is 2.46 or later. If it is not, upgrade it to
latest version.

```
$ npm uninstall -g aws-cdk
$ npm install -g aws-cdk
```

Since Lambda@Edge function must be deployed to `us-east-1` region and may be 
different from other resources, CDK will create two stacks automatically to deploy
L@E and other resources separately. As a result, you must explicitly determine
which region you are going to deploy the other resources into.

This solution will enable **Origin Shield**. Please make sure deploying it in one 
of the following regions and as close to the original Origin as possible.

```
us-east-1
us-east-2
us-west-2
ap-south-1
ap-northeast-2
ap-southeast-1
ap-southeast-2
ap-northeast-1
eu-central-1
eu-west-1
eu-west-2
sa-east-1
```

Then bootstrap the CDK project with your Account ID and region code.

```
$ cdk bootstrap ACCOUNT_ID/REGION
```

At this point you can now synthesize the CloudFormation template for this code.

```
$ cdk synth
```

As I mentioned earlier, CDK will create two stacks automatically. One is named
`BackToOrigin`, and the other one is named `edge-lambda-stack-xxxxxx`. You can
deploy them one by one, or deploy them all together using `--all` following 
`cdk deploy` command.

Also, you need to prepare a Google Cloud Storage (GCS) bucket as the original
Origin. GCS provides 3-month free trial without object-level ACLs enabled. So my
GCS bucket is public to internet and my code does not include GCS API authentication
logic. If your GCS bucket needs the authentication, add the necessary code after
the deployment, please.

```
$ cdk deploy --all --parameters BackToOrigin:gcsBucketName=YOUR_GCS_BUCKET_NAME
```

To add additional dependencies, for example other CDK libraries, just add
them to your `setup.py` file and rerun the `pip install -r requirements.txt`
command.

## Expected test results

![Before the test](/img/before_the_test.png)

![After the test](/img/after_the_test.png)

## Removement

```
$ cdk destroy --all
```

## Useful commands

 * `cdk ls`          list all stacks in the app
 * `cdk synth`       emits the synthesized CloudFormation template
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk docs`        open CDK documentation

Enjoy!