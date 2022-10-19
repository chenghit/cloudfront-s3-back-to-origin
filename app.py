#!/usr/bin/env python3

import aws_cdk as cdk
#from lib.back_to_origin_stack import BackToOrigin
from lib.pipeline_stack import BackToOriginPipelineStack


app = cdk.App()
#BackToOrigin(app, "back-to-origin")
BackToOriginPipelineStack(app, 'BackToOriginPipelineStack')

app.synth()
