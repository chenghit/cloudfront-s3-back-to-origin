#!/usr/bin/env python3

import aws_cdk as cdk
#from lib.back_to_origin_stack import BackToOriginStack
from lib.pipeline_stack import BackToOriginPipelineStack

app = cdk.App()
#BackToOriginStack(app, "back-to-origin")
BackToOriginPipelineStack(app, 'BackToOriginPipelineStack')
    
app.synth()