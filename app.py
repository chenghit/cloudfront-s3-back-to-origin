#!/usr/bin/env python3

import aws_cdk as cdk
#from lib.back_to_origin_stack import BackToOriginStack
from lib.pipeline_stack import BackToOriginPipelineStack

app = cdk.App()
#BackToOriginStack(app, "back-to-origin",
#    env=cdk.Environment(region="us-east-1"))

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
BackToOriginPipelineStack(app, 'BackToOriginPipelineStack',
    env=cdk.Environment(region="us-east-1"))
    
app.synth()