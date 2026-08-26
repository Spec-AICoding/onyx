"""MinIO / S3 兼容对象存储只读访问。

仅提供 GetObject 能力（读取同步批次文件与下载），不包含任何写操作。
凭证从环境变量读取，默认值匹配本地开发环境（与 backend/.env 一致）。
"""

import os

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

S3_ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL", "http://81.70.98.107:9008")
S3_FILE_STORE_BUCKET_NAME = os.environ.get(
    "S3_FILE_STORE_BUCKET_NAME", "onyx-file-store-bucket"
)
S3_AWS_ACCESS_KEY_ID = os.environ.get("S3_AWS_ACCESS_KEY_ID", "minioadmin")
S3_AWS_SECRET_ACCESS_KEY = os.environ.get("S3_AWS_SECRET_ACCESS_KEY", "minioadmin")


class ObjectNotFoundError(RuntimeError):
    """S3 对象不存在（或 key 无权限访问）。"""


_client = None


def _get_s3_client():
    global _client
    if _client is None:
        _client = boto3.client(
            service_name="s3",
            endpoint_url=S3_ENDPOINT_URL,
            aws_access_key_id=S3_AWS_ACCESS_KEY_ID,
            aws_secret_access_key=S3_AWS_SECRET_ACCESS_KEY,
            region_name="us-east-2",
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},  # Required for MinIO
            ),
        )
    return _client


def get_object_bytes(bucket_name: str, object_key: str) -> bytes:
    """读取对象内容；对象缺失或不可达时抛 ObjectNotFoundError。"""
    try:
        response = _get_s3_client().get_object(Bucket=bucket_name, Key=object_key)
        return response["Body"].read()
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code in ("404", "NoSuchKey", "NoSuchBucket", "403"):
            raise ObjectNotFoundError(
                f"S3 object not accessible: bucket={bucket_name} key={object_key}"
            ) from e
        raise
