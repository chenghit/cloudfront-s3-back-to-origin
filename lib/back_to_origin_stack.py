import json
import sys
from constructs import Construct
from aws_cdk import (
    Duration, Stack,
    Aws, RemovalPolicy,
    CfnParameter, PhysicalName,
    aws_iam as iam,
    aws_lambda as _lambda,
    aws_cloudfront as cf,
    aws_cloudfront_origins as origins,
    aws_dynamodb as ddb,
    aws_sqs as sqs,
    aws_events as events,
    aws_events_targets as event_targets,
    aws_s3 as s3,
)
from aws_cdk.aws_lambda_event_sources import SqsEventSource

class BackToOriginStack(Stack):
    
    @property
    def handler(self):
        return self._handler

    def __init__(self, scope: Construct, id: str, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)
        
        gcs_bucket_name = CfnParameter(self, 'gcsBucketName', type='String',
            description='The name of the Google Cloud Storage bucket.')
        
        gcs_domain_name = 'storage.googleapis.com'
        #gcs_bucket_name = 'my_gcp_bucket_9527'
        solution_region = Aws.REGION
        
        s3_bucket = s3.Bucket(
            self, "DestinationBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )
        
        uri_list_queue = sqs.Queue(
            self, "UriListQueue",
            queue_name=PhysicalName.GENERATE_IF_NEEDED,
            retention_period=Duration.days(1),
            visibility_timeout=Duration.minutes(15),
        )
        
        single_task_queue = sqs.Queue(
            self, "SingleTasks",
            #queue_name=PhysicalName.GENERATE_IF_NEEDED,
            content_based_deduplication=True,
            fifo=True,
            retention_period=Duration.days(1),
            visibility_timeout=Duration.minutes(15),
        )
        
        mpu_task_queue = sqs.Queue(
            self, "MpuTasks",
            #queue_name=PhysicalName.GENERATE_IF_NEEDED,
            content_based_deduplication=True,
            fifo=True,
            retention_period=Duration.days(1),
            visibility_timeout=Duration.minutes(15),
        )
        
        uri_list_table = ddb.Table(
            self, 'UriList',
            removal_policy=RemovalPolicy.DESTROY,
            partition_key={'name': 'uri', 'type': ddb.AttributeType.STRING},
            sort_key={'name': 'content_length', 'type': ddb.AttributeType.NUMBER},
        )
        
        single_table = ddb.Table(
            self, 'S3Single',
            removal_policy=RemovalPolicy.DESTROY,
            partition_key={'name': 'id', 'type': ddb.AttributeType.STRING},
        )
        
        single_result_table = ddb.Table(
            self, 'S3SingleResult',
            removal_policy=RemovalPolicy.DESTROY,
            partition_key={'name': 'id', 'type': ddb.AttributeType.STRING},
        )
        
        mpu_table = ddb.Table(
            self, 'S3MPU',
            removal_policy=RemovalPolicy.DESTROY,
            partition_key={'name': 'upload_id', 'type': ddb.AttributeType.STRING},
            sort_key={'name': 'part', 'type': ddb.AttributeType.NUMBER},
        )
        
        mpu_result_table = ddb.Table(
            self, 'S3MPUResult',
            removal_policy=RemovalPolicy.DESTROY,
            partition_key={'name': 'upload_id', 'type': ddb.AttributeType.STRING},
        )
        
        lambda_layer = _lambda.LayerVersion(self, 'BackToOriginLayer',
            removal_policy=RemovalPolicy.RETAIN,
            code=_lambda.Code.from_asset('lambda'),
            compatible_architectures=[_lambda.Architecture.X86_64, _lambda.Architecture.ARM_64],
            compatible_runtimes=[_lambda.Runtime.NODEJS_14_X, _lambda.Runtime.NODEJS_16_X]
        )

        lambda_main = _lambda.Function(
            self, 'Main',
            runtime=_lambda.Runtime.NODEJS_16_X,
            memory_size=256,
            timeout=Duration.minutes(15),
            code=_lambda.Code.from_asset('lambda'),
            handler = 'main.handler',
            architecture = _lambda.Architecture.ARM_64,
            layers = [lambda_layer],
            environment = {
                'GCP_BUCKET': gcs_bucket_name.value_as_string,
                'S3_BUCKET': s3_bucket.bucket_name,
                'SINGLE_QUEUE_URL': single_task_queue.queue_url,
                'MPU_QUEUE_URL': mpu_task_queue.queue_url,
                'SINGLE_RESULT_TABLE': single_result_table.table_name,
                'MPU_RESULT_TABLE': mpu_result_table.table_name,
                'DDB_TABLE': uri_list_table.table_name,
                'REGION': solution_region,
            }
        )
        
        lambda_single = _lambda.Function(
            self, 'Single',
            runtime = _lambda.Runtime.NODEJS_16_X,
            memory_size = 384,
            timeout = Duration.minutes(15),
            code = _lambda.Code.from_asset('lambda'),
            handler = 'single.handler',
            architecture = _lambda.Architecture.ARM_64,
            layers = [lambda_layer],
            environment = {
                'SINGLE_TABLE': single_table.table_name,
                'SINGLE_RESULT_TABLE': single_result_table.table_name,
                'REGION': solution_region,
            }
        )
        
        lambda_mpu = _lambda.Function(
            self, 'MPU',
            runtime = _lambda.Runtime.NODEJS_16_X,
            memory_size = 384,
            timeout = Duration.minutes(15),
            code = _lambda.Code.from_asset('lambda'),
            handler = 'mpu.handler',
            architecture = _lambda.Architecture.ARM_64,
            layers = [lambda_layer],
            environment = {
                'MPU_TABLE': mpu_table.table_name,
                'MPU_RESULT_TABLE': mpu_result_table.table_name,
                'REGION': solution_region,
            }
        )
        
        lambda_monitor = _lambda.Function(
            self, 'Monitor',
            runtime = _lambda.Runtime.NODEJS_16_X,
            memory_size = 256,
            timeout = Duration.minutes(15),
            code = _lambda.Code.from_asset('lambda'),
            handler = 'monitor.handler',
            architecture = _lambda.Architecture.ARM_64,
            layers = [lambda_layer],
            environment = {
                'SINGLE_QUEUE_URL': single_task_queue.queue_url,
                'MPU_QUEUE_URL': mpu_task_queue.queue_url,
                'SINGLE_TABLE': single_table.table_name,
                'MPU_TABLE': mpu_table.table_name,
                'MPU_RESULT_TABLE': mpu_result_table.table_name,
                'REGION': solution_region,
            }
        )

        
        uri_list_queue.grant_consume_messages(lambda_main)
        single_task_queue.grant_consume_messages(lambda_single)
        mpu_task_queue.grant_consume_messages(lambda_mpu)
        
        single_task_queue.grant_send_messages(lambda_main)
        single_task_queue.grant_send_messages(lambda_monitor)
        mpu_task_queue.grant_send_messages(lambda_main)
        mpu_task_queue.grant_send_messages(lambda_monitor)
        
        uri_list_table.grant_read_write_data(lambda_main)
        single_result_table.grant_read_write_data(lambda_main)
        mpu_result_table.grant_read_write_data(lambda_main)
        
        single_table.grant_read_write_data(lambda_single)
        single_result_table.grant_read_write_data(lambda_single)
        
        mpu_table.grant_read_write_data(lambda_mpu)
        mpu_result_table.grant_read_write_data(lambda_mpu)
        
        single_table.grant_read_write_data(lambda_monitor)
        mpu_table.grant_read_write_data(lambda_monitor)
        mpu_result_table.grant_read_write_data(lambda_monitor)
        
        s3_bucket.grant_read_write(lambda_main)
        s3_bucket.grant_read_write(lambda_single)
        s3_bucket.grant_read_write(lambda_mpu)
        
        sqs_event_source_uri_list = SqsEventSource(uri_list_queue)
        sqs_event_source_single_tasks = SqsEventSource(
            single_task_queue,
            batch_size=1,
        )
        sqs_event_source_mpu_tasks = SqsEventSource(
            mpu_task_queue,
            batch_size=1,
        )
        
        lambda_main.add_event_source(sqs_event_source_uri_list)
        lambda_single.add_event_source(sqs_event_source_single_tasks)
        lambda_mpu.add_event_source(sqs_event_source_mpu_tasks)

        
        fifteen_minutes_rule = events.Rule(
            self, 'fifteen_minutes_rule',
            schedule=events.Schedule.rate(Duration.minutes(15)),
        )
        
        fifteen_minutes_rule.add_target(event_targets.LambdaFunction(lambda_monitor))


        lambda_edge_origin_response = cf.experimental.EdgeFunction(
            self, 'OriginResponse',
            runtime = _lambda.Runtime.NODEJS_16_X,
            memory_size = 128,
            timeout = Duration.seconds(30),
            code = _lambda.Code.from_asset('lambda_edge'),
            handler = 'origin_response.handler',
        )
        
        uri_list_queue.grant_send_messages(lambda_edge_origin_response)

        cf_distribution = cf.Distribution(
            self, 'cf_distribution',
            comment='Back-to-Origin Demo',
            default_root_object='index.html',
            default_behavior=cf.BehaviorOptions(
                origin=origins.OriginGroup(
                    primary_origin=origins.S3Origin(
                        s3_bucket,
                        origin_shield_region=solution_region,
                    ),
                    fallback_origin=origins.HttpOrigin(
                        gcs_domain_name,
                        origin_path='/'+gcs_bucket_name.value_as_string,
                        custom_headers={
                            'x-back-to-origin': json.dumps({
                                'region': solution_region,
                                'queue_url': uri_list_queue.queue_url
                            })
                        },
                        origin_shield_region=solution_region,
                    ),
                    fallback_status_codes=[403, 404]
                ),
                cache_policy=cf.CachePolicy(self, 'BackToOriginCachePolicy',
                    cache_policy_name='BackToOriginCachePolicy',
                    default_ttl=Duration.seconds(30),
                    max_ttl=Duration.seconds(60),
                    min_ttl=Duration.seconds(0),
                    enable_accept_encoding_brotli=True,
                    enable_accept_encoding_gzip=True,
                ),
                edge_lambdas=[
                    cf.EdgeLambda(
                        event_type=cf.LambdaEdgeEventType.ORIGIN_RESPONSE,
                        function_version=lambda_edge_origin_response.current_version,
                    )
                ]
            )
        )
        

        
        
