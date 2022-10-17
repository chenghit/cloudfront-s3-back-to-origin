import aws_cdk as core
import aws_cdk.assertions as assertions

from back_to_origin.back_to_origin_stack import BackToOriginStack

# example tests. To run these tests, uncomment this file along with the example
# resource in back_to_origin/back_to_origin_stack.py
def test_sqs_queue_created():
    app = core.App()
    stack = BackToOriginStack(app, "back-to-origin")
    template = assertions.Template.from_stack(stack)

#     template.has_resource_properties("AWS::SQS::Queue", {
#         "VisibilityTimeout": 300
#     })
