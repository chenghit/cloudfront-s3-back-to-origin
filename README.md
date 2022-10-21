
# Welcome to your CDK Python project!

This is a blank project for CDK development with Python.

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
$ npm install -g aws-cdk
$ cdk --version
2.47.0 (build 3528e3d)
$ pip install -r requirements.txt
```

At this point you can now synthesize the CloudFormation template for this code.

```
$ cdk bootstrap 636696231660/ap-southeast-1
$ cdk synth
$ cdk deploy

Since this app includes more than a single stack, specify which stacks to use (wildcards are supported) or specify `--all`
Stacks: edge-lambda-stack-c8364b560aac02a72c6241ee2b260dbcc0b27714d6 · BackToOrigin

$ cdk deploy --all --parameters BackToOrigin:gcsBucketName=my_gcp_bucket_9527
```

To add additional dependencies, for example other CDK libraries, just add
them to your `setup.py` file and rerun the `pip install -r requirements.txt`
command.

## Useful commands

 * `cdk ls`          list all stacks in the app
 * `cdk synth`       emits the synthesized CloudFormation template
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk docs`        open CDK documentation

Enjoy!


```
$ cdk destroy --all
Are you sure you want to delete: BackToOrigin, edge-lambda-stack-c8364b560aac02a72c6241ee2b260dbcc0b27714d6 (y/n)? 
```
