"""
S3 Storage Manager for Manim Videos

This module handles uploading rendered Manim videos to S3 and generating URLs.
"""
import os
import boto3
from botocore.exceptions import ClientError
from typing import Optional
from pathlib import Path
import hashlib
from datetime import datetime, timedelta

# AWS Configuration
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET")
CLOUDFRONT_URL = os.getenv("CLOUDFRONT_URL")  # e.g., https://d1234567890.cloudfront.net

# Initialize S3 client
# If running on ECS with IAM role, credentials are automatic
# Otherwise, uses AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars
s3_client = boto3.client('s3', region_name=AWS_REGION)


class VideoStorageError(Exception):
    """Custom exception for video storage operations"""
    pass


def generate_s3_key(user_id: str, video_filename: str, tool_name: str = "manim") -> str:
    """
    Generate a unique S3 key for a video file
    
    Format: videos/{user_id}/{year}/{month}/{timestamp}_{hash}_{filename}
    
    Args:
        user_id: User's Auth0 ID or database ID
        video_filename: Original video filename
        tool_name: Name of the tool that generated the video
        
    Returns:
        str: S3 key (path) for the video
    """
    now = datetime.utcnow()
    
    # Create a short hash of user_id + filename + timestamp for uniqueness
    hash_input = f"{user_id}{video_filename}{now.isoformat()}"
    file_hash = hashlib.md5(hash_input.encode()).hexdigest()[:8]
    
    # Extract filename without path
    filename = Path(video_filename).name
    
    # Format: videos/user_abc123/2025/01/20250101_120000_a1b2c3d4_scene.mp4
    s3_key = (
        f"videos/{user_id}/"
        f"{now.year}/{now.month:02d}/"
        f"{now.strftime('%Y%m%d_%H%M%S')}_{file_hash}_{filename}"
    )
    
    return s3_key


def upload_video_to_s3(
    local_path: str,
    user_id: str,
    tool_name: str = "manim",
    metadata: Optional[dict] = None
) -> dict:
    """
    Upload a video file to S3
    
    Args:
        local_path: Path to the local video file
        user_id: User's ID (for organizing in S3)
        tool_name: Name of the tool that generated the video
        metadata: Optional metadata to store with the video
        
    Returns:
        dict: Upload information containing:
            - s3_key: S3 object key
            - s3_url: Direct S3 URL
            - cloudfront_url: CloudFront CDN URL (if configured)
            - bucket: S3 bucket name
            - file_size: File size in bytes
            
    Raises:
        VideoStorageError: If upload fails
    """
    if not AWS_S3_BUCKET:
        raise VideoStorageError("AWS_S3_BUCKET environment variable not set")
    
    if not os.path.exists(local_path):
        raise VideoStorageError(f"Video file not found: {local_path}")
    
    # Get file info
    file_size = os.path.getsize(local_path)
    filename = os.path.basename(local_path)
    
    # Generate S3 key
    s3_key = generate_s3_key(user_id, filename, tool_name)
    
    # Prepare metadata
    s3_metadata = {
        "user_id": user_id,
        "tool_name": tool_name,
        "original_filename": filename,
        "uploaded_at": datetime.utcnow().isoformat()
    }
    
    if metadata:
        s3_metadata.update(metadata)
    
    try:
        # Upload to S3
        with open(local_path, 'rb') as video_file:
            s3_client.upload_fileobj(
                video_file,
                AWS_S3_BUCKET,
                s3_key,
                ExtraArgs={
                    'ContentType': 'video/mp4',
                    'Metadata': s3_metadata,
                    # Cache for 1 year (videos don't change)
                    'CacheControl': 'public, max-age=31536000',
                    # Optional: Make public (if not using CloudFront signed URLs)
                    # 'ACL': 'public-read'
                }
            )
        
        # Generate URLs
        s3_url = f"https://{AWS_S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"
        
        # Use CloudFront URL if configured (faster, cheaper)
        if CLOUDFRONT_URL:
            cloudfront_url = f"{CLOUDFRONT_URL}/{s3_key}"
        else:
            cloudfront_url = s3_url
        
        return {
            "s3_key": s3_key,
            "s3_url": s3_url,
            "cloudfront_url": cloudfront_url,
            "bucket": AWS_S3_BUCKET,
            "file_size": file_size
        }
        
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        error_message = e.response.get('Error', {}).get('Message', str(e))
        raise VideoStorageError(
            f"Failed to upload video to S3: {error_code} - {error_message}"
        )
    except Exception as e:
        raise VideoStorageError(f"Unexpected error uploading video: {str(e)}")


def delete_video_from_s3(s3_key: str) -> bool:
    """
    Delete a video from S3
    
    Args:
        s3_key: S3 object key to delete
        
    Returns:
        bool: True if deleted successfully
        
    Raises:
        VideoStorageError: If deletion fails
    """
    if not AWS_S3_BUCKET:
        raise VideoStorageError("AWS_S3_BUCKET environment variable not set")
    
    try:
        s3_client.delete_object(Bucket=AWS_S3_BUCKET, Key=s3_key)
        return True
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        error_message = e.response.get('Error', {}).get('Message', str(e))
        raise VideoStorageError(
            f"Failed to delete video from S3: {error_code} - {error_message}"
        )


def generate_presigned_url(s3_key: str, expiration: int = 3600) -> str:
    """
    Generate a presigned URL for temporary access to a video
    
    Use this if your S3 bucket is private and you want to give
    temporary access without making files public.
    
    Args:
        s3_key: S3 object key
        expiration: URL expiration time in seconds (default: 1 hour)
        
    Returns:
        str: Presigned URL
        
    Raises:
        VideoStorageError: If URL generation fails
    """
    if not AWS_S3_BUCKET:
        raise VideoStorageError("AWS_S3_BUCKET environment variable not set")
    
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': AWS_S3_BUCKET, 'Key': s3_key},
            ExpiresIn=expiration
        )
        return url
    except ClientError as e:
        raise VideoStorageError(f"Failed to generate presigned URL: {str(e)}")


def get_user_storage_usage(user_id: str) -> dict:
    """
    Get total storage usage for a user
    
    Args:
        user_id: User's ID
        
    Returns:
        dict: Storage statistics:
            - total_videos: Number of videos
            - total_bytes: Total storage in bytes
            - total_mb: Total storage in MB
    """
    if not AWS_S3_BUCKET:
        raise VideoStorageError("AWS_S3_BUCKET environment variable not set")
    
    prefix = f"videos/{user_id}/"
    
    try:
        total_bytes = 0
        video_count = 0
        
        # List all objects with the user's prefix
        paginator = s3_client.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=AWS_S3_BUCKET, Prefix=prefix):
            if 'Contents' in page:
                for obj in page['Contents']:
                    total_bytes += obj['Size']
                    video_count += 1
        
        return {
            "total_videos": video_count,
            "total_bytes": total_bytes,
            "total_mb": round(total_bytes / 1024 / 1024, 2)
        }
        
    except ClientError as e:
        raise VideoStorageError(f"Failed to get storage usage: {str(e)}")


def cleanup_old_videos(days_old: int = 90) -> int:
    """
    Delete videos older than specified days
    
    Note: This should be run as a periodic job (e.g., Lambda function)
    or via S3 lifecycle policies (recommended).
    
    Args:
        days_old: Delete videos older than this many days
        
    Returns:
        int: Number of videos deleted
    """
    if not AWS_S3_BUCKET:
        raise VideoStorageError("AWS_S3_BUCKET environment variable not set")
    
    cutoff_date = datetime.utcnow() - timedelta(days=days_old)
    deleted_count = 0
    
    try:
        paginator = s3_client.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=AWS_S3_BUCKET, Prefix="videos/"):
            if 'Contents' in page:
                for obj in page['Contents']:
                    if obj['LastModified'].replace(tzinfo=None) < cutoff_date:
                        s3_client.delete_object(Bucket=AWS_S3_BUCKET, Key=obj['Key'])
                        deleted_count += 1
        
        return deleted_count
        
    except ClientError as e:
        raise VideoStorageError(f"Failed to cleanup old videos: {str(e)}")


# Example usage in renderer.py:
"""
from core.s3_storage import upload_video_to_s3, VideoStorageError

def _render_manim_code(scene_code: str, user_id: str) -> str:
    # ... existing manim rendering code ...
    
    # After successful render
    local_video_path = "/path/to/rendered/video.mp4"
    
    try:
        # Upload to S3
        upload_result = upload_video_to_s3(
            local_path=local_video_path,
            user_id=user_id,
            tool_name="plot_function",
            metadata={
                "resolution": "720p",
                "duration": "5s"
            }
        )
        
        # Return CloudFront URL instead of local path
        video_url = upload_result["cloudfront_url"]
        
        # Clean up local file
        os.remove(local_video_path)
        
        return f"✅ Video uploaded successfully!\\n\\nVideo URL: {video_url}\\n\\n📹 Use show_video tool with URL '{video_url}' to display it."
        
    except VideoStorageError as e:
        return f"❌ Failed to upload video: {str(e)}"
"""

