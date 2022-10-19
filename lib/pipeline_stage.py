from constructs import Construct
from aws_cdk import (
    Stage
)
from .back_to_origin_stack import BackToOriginStack

class BackToOriginPipelineStage(Stage):
    
    def __init__(self, scope: Construct, id: str, **kwargs):
        super().__init__(scope, id, **kwargs)
        
        service = BackToOriginStack(self, 'BackToOriginService')