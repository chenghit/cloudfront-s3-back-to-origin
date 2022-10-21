#!/usr/bin/env python3

import os
import aws_cdk as cdk
from lib.back_to_origin_stack import BackToOriginStack

app = cdk.App()
BackToOriginStack(
    app, "BackToOrigin", 
    env=cdk.Environment(
        account=os.environ["CDK_DEFAULT_ACCOUNT"],
        region=os.environ["CDK_DEFAULT_REGION"]
    ))

'''
This solution will enable Origin Shield. Please make sure deploy it in one of
the following regions:
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
'''
    
app.synth()