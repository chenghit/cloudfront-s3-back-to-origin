from constructs import Construct
from aws_cdk import (
    Stack,
    aws_iam as iam,
    aws_codecommit as codecommit,
    pipelines as pipelines,
)
from .pipeline_stage import BackToOriginPipelineStage

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
        
        pipeline.add_to_resource_policy(iam.PolicyStatement(
            effect=iam.Effect.ALLOW,
            actions=['iam:*'],
            resources=['*'],
            ))
        
        deploy = BackToOriginPipelineStage(self, 'Deploy')
        deploy_stage = pipeline.add_stage(deploy)