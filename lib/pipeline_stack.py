from constructs import Construct
from aws_cdk import (
    Stack,
    aws_codecommit as codecommit,
    pipelines as pipelines,
)

class BackToOriginPipelineStack(Stack):
    
    def __init__(self, scope: Construct, id: str, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)
        
        repo = codecommit.Repository(
            self, 'BackToOriginRepo',
            repository_name='BackToOriginPipeRepo'
        )
        
        pipeline = pipelines.CodePipeline(
            self, 'Pipeline',
            synth=pipelines.ShellStep(
                'Synth',
                input=pipelines.CodePipelineSource.code_commit(repo, 'master'),
                commands=[
                    'npm install -g aws-cdk',
                    'pip install -r requirements.txt',
                    'cdk synth',
                ]
            )
        )