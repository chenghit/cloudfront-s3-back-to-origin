#!/usr/bin/env python3

import aws_cdk as cdk
#from lib.back_to_origin_stack import BackToOriginStack
from lib.pipeline_stack import BackToOriginPipelineStack

allowed_region = [
    'us-east-1',
    'us-east-2',
    'us-west-2',
    'ap-south-1',
    'ap-northeast-2',
    'ap-southeast-1',
    'ap-southeast-2',
    'ap-northeast-1',
    'eu-central-1',
    'eu-west-1',
    'eu-west-2',
    'sa-east-1',   
]

if cdk.Aws.REGION in allowed_region:

    app = cdk.App()
    #BackToOriginStack(app, "back-to-origin")
    BackToOriginPipelineStack(app, 'BackToOriginPipelineStack')
    
    app.synth()

else:
    
    print('This solution can only be deployed in following regions:', allowed_region)
