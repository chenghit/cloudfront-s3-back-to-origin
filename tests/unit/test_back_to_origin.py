from aws_cdk import (
        Stack,
        aws_lambda as _lambda,
        assertions
    )
from lib.back_to_origin_stack import BackToOriginStack
import pytest

def test_dynamodb():
    pass

#def test_sqs_queue_created():
#    app = core.App()
#    stack = BackToOriginStack(app, "back-to-origin")
#    template = assertions.Template.from_stack(stack)
#
#     template.has_resource_properties("AWS::SQS::Queue", {
#         "VisibilityTimeout": 300
#     })
