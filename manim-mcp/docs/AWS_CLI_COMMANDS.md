# AWS CLI Commands Reference

Quick reference for deploying Manim MCP to AWS.

## Prerequisites

```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS credentials
aws configure
# Enter: Access Key ID, Secret Access Key, Region (us-east-1), Output format (json)

# Verify configuration
aws sts get-caller-identity
```

## 1. RDS PostgreSQL Database

### Create Database Instance
```bash
# Create DB subnet group (if not exists)
aws rds create-db-subnet-group \
    --db-subnet-group-name manim-tutor-db-subnet \
    --db-subnet-group-description "Subnet group for Manim Tutor RDS" \
    --subnet-ids subnet-xxxxx subnet-yyyyy

# Create RDS instance
aws rds create-db-instance \
    --db-instance-identifier manim-tutor-db \
    --db-instance-class db.t4g.micro \
    --engine postgres \
    --engine-version 15.4 \
    --master-username postgres \
    --master-user-password YOUR_SECURE_PASSWORD \
    --allocated-storage 20 \
    --storage-type gp3 \
    --vpc-security-group-ids sg-xxxxx \
    --db-subnet-group-name manim-tutor-db-subnet \
    --backup-retention-period 7 \
    --multi-az \
    --publicly-accessible false \
    --enable-cloudwatch-logs-exports '["postgresql"]'

# Wait for instance to be available
aws rds wait db-instance-available --db-instance-identifier manim-tutor-db

# Get endpoint
aws rds describe-db-instances \
    --db-instance-identifier manim-tutor-db \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text
```

### Run Database Schema
```bash
# From your local machine (if RDS is accessible)
psql -h your-rds-endpoint.rds.amazonaws.com -U postgres -d postgres -f server/database_schema.sql

# Or create database first, then run schema
psql -h your-rds-endpoint.rds.amazonaws.com -U postgres -d postgres -c "CREATE DATABASE manim_tutor;"
psql -h your-rds-endpoint.rds.amazonaws.com -U postgres -d manim_tutor -f server/database_schema.sql
```

## 2. S3 Bucket for Video Storage

### Create Bucket
```bash
# Create bucket
aws s3 mb s3://manim-tutor-videos-$(date +%s)

# Set bucket name as variable
BUCKET_NAME=manim-tutor-videos-1234567890

# Enable versioning (optional)
aws s3api put-bucket-versioning \
    --bucket $BUCKET_NAME \
    --versioning-configuration Status=Enabled

# Set lifecycle policy (delete videos after 90 days)
cat > lifecycle-policy.json << 'EOF'
{
  "Rules": [
    {
      "Id": "DeleteOldVideos",
      "Status": "Enabled",
      "Prefix": "",
      "Expiration": {
        "Days": 90
      }
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
    --bucket $BUCKET_NAME \
    --lifecycle-configuration file://lifecycle-policy.json

# Set CORS policy
cat > cors-policy.json << 'EOF'
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://your-app.vercel.app"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
}
EOF

aws s3api put-bucket-cors \
    --bucket $BUCKET_NAME \
    --cors-configuration file://cors-policy.json
```

## 3. CloudFront Distribution

### Create Distribution
```bash
# Create CloudFront origin access identity
aws cloudfront create-cloud-front-origin-access-identity \
    --cloud-front-origin-access-identity-config \
    CallerReference=$(date +%s),Comment="Manim Tutor Videos"

# Get the OAI ID from the response, then create distribution
cat > cloudfront-config.json << 'EOF'
{
  "CallerReference": "manim-tutor-videos",
  "Comment": "CDN for Manim tutorial videos",
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-manim-tutor-videos",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": {
        "Quantity": 2,
        "Items": ["GET", "HEAD"]
      }
    },
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {
        "Forward": "none"
      }
    },
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000
  },
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "S3-manim-tutor-videos",
        "DomainName": "manim-tutor-videos-1234567890.s3.amazonaws.com",
        "S3OriginConfig": {
          "OriginAccessIdentity": "origin-access-identity/cloudfront/YOUR_OAI_ID"
        }
      }
    ]
  },
  "Enabled": true
}
EOF

aws cloudfront create-distribution --distribution-config file://cloudfront-config.json
```

## 4. ECR (Elastic Container Registry)

### Create Repository and Push Image
```bash
# Create ECR repository
aws ecr create-repository \
    --repository-name manim-mcp-server \
    --image-scanning-configuration scanOnPush=true \
    --region us-east-1

# Get repository URI
REPO_URI=$(aws ecr describe-repositories \
    --repository-names manim-mcp-server \
    --query 'repositories[0].repositoryUri' \
    --output text)

echo "Repository URI: $REPO_URI"

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin $REPO_URI

# Build Docker image
cd server
docker build -t manim-mcp-server .

# Tag image
docker tag manim-mcp-server:latest $REPO_URI:latest

# Push to ECR
docker push $REPO_URI:latest
```

## 5. ECS Cluster and Service

### Create ECS Cluster
```bash
# Create cluster
aws ecs create-cluster \
    --cluster-name manim-mcp-cluster \
    --capacity-providers FARGATE FARGATE_SPOT \
    --default-capacity-provider-strategy \
        capacityProvider=FARGATE,weight=1,base=1 \
        capacityProvider=FARGATE_SPOT,weight=4
```

### Create Task Execution Role
```bash
# Create role
aws iam create-role \
    --role-name ecsTaskExecutionRole \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Principal": {
            "Service": "ecs-tasks.amazonaws.com"
          },
          "Action": "sts:AssumeRole"
        }
      ]
    }'

# Attach policies
aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
```

### Create Task Definition
```bash
cat > task-definition.json << 'EOF'
{
  "family": "manim-mcp-server",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "3072",
  "executionRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "manim-mcp-server",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/manim-mcp-server:latest",
      "portMappings": [
        {
          "containerPort": 8000,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "environment": [
        {
          "name": "PORT",
          "value": "8000"
        },
        {
          "name": "AWS_REGION",
          "value": "us-east-1"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:manim-tutor/database-url"
        },
        {
          "name": "AUTH0_DOMAIN",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:manim-tutor/auth0-domain"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/manim-mcp-server",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
EOF

# Create log group first
aws logs create-log-group --log-group-name /ecs/manim-mcp-server

# Register task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

### Create Application Load Balancer
```bash
# Create ALB
aws elbv2 create-load-balancer \
    --name manim-mcp-alb \
    --subnets subnet-xxxxx subnet-yyyyy \
    --security-groups sg-xxxxx \
    --scheme internet-facing \
    --type application

# Create target group
aws elbv2 create-target-group \
    --name manim-mcp-targets \
    --protocol HTTP \
    --port 8000 \
    --vpc-id vpc-xxxxx \
    --target-type ip \
    --health-check-path /health \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 5 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3

# Create listener (HTTPS - requires SSL certificate)
aws elbv2 create-listener \
    --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:xxx:loadbalancer/app/manim-mcp-alb/xxx \
    --protocol HTTPS \
    --port 443 \
    --certificates CertificateArn=arn:aws:acm:us-east-1:xxx:certificate/xxx \
    --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:us-east-1:xxx:targetgroup/manim-mcp-targets/xxx
```

### Create ECS Service
```bash
aws ecs create-service \
    --cluster manim-mcp-cluster \
    --service-name manim-mcp-service \
    --task-definition manim-mcp-server:1 \
    --desired-count 2 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={
        subnets=[subnet-xxxxx,subnet-yyyyy],
        securityGroups=[sg-xxxxx],
        assignPublicIp=DISABLED
    }" \
    --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=manim-mcp-server,containerPort=8000"
```

## 6. AWS Secrets Manager

### Store Secrets
```bash
# Database URL
aws secretsmanager create-secret \
    --name manim-tutor/database-url \
    --secret-string "postgresql://postgres:password@your-rds-endpoint:5432/manim_tutor"

# Auth0 credentials
aws secretsmanager create-secret \
    --name manim-tutor/auth0-domain \
    --secret-string "your-tenant.auth0.com"

aws secretsmanager create-secret \
    --name manim-tutor/auth0-api-audience \
    --secret-string "https://api.manim-tutor.com"

# List secrets
aws secretsmanager list-secrets
```

## 7. Auto Scaling

### Configure ECS Service Auto Scaling
```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
    --service-namespace ecs \
    --resource-id service/manim-mcp-cluster/manim-mcp-service \
    --scalable-dimension ecs:service:DesiredCount \
    --min-capacity 2 \
    --max-capacity 10

# Create scaling policy (CPU-based)
aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --resource-id service/manim-mcp-cluster/manim-mcp-service \
    --scalable-dimension ecs:service:DesiredCount \
    --policy-name cpu-scaling-policy \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration '{
      "TargetValue": 70.0,
      "PredefinedMetricSpecification": {
        "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
      },
      "ScaleInCooldown": 300,
      "ScaleOutCooldown": 60
    }'
```

## 8. Monitoring and Logs

### View ECS Logs
```bash
# View logs
aws logs tail /ecs/manim-mcp-server --follow

# Filter logs
aws logs filter-log-events \
    --log-group-name /ecs/manim-mcp-server \
    --filter-pattern "ERROR"
```

### CloudWatch Alarms
```bash
# High CPU alarm
aws cloudwatch put-metric-alarm \
    --alarm-name manim-mcp-high-cpu \
    --alarm-description "Alert when ECS CPU exceeds 80%" \
    --metric-name CPUUtilization \
    --namespace AWS/ECS \
    --statistic Average \
    --period 300 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 2
```

## 9. Deployment Updates

### Update Service with New Image
```bash
# Build and push new image
cd server
docker build -t manim-mcp-server .
docker tag manim-mcp-server:latest $REPO_URI:latest
docker push $REPO_URI:latest

# Force new deployment
aws ecs update-service \
    --cluster manim-mcp-cluster \
    --service manim-mcp-service \
    --force-new-deployment

# Watch deployment
aws ecs describe-services \
    --cluster manim-mcp-cluster \
    --services manim-mcp-service \
    --query 'services[0].deployments'
```

## 10. Cleanup (When Needed)

```bash
# Delete ECS service
aws ecs delete-service \
    --cluster manim-mcp-cluster \
    --service manim-mcp-service \
    --force

# Delete cluster
aws ecs delete-cluster --cluster manim-mcp-cluster

# Delete RDS instance
aws rds delete-db-instance \
    --db-instance-identifier manim-tutor-db \
    --skip-final-snapshot

# Empty and delete S3 bucket
aws s3 rm s3://$BUCKET_NAME --recursive
aws s3 rb s3://$BUCKET_NAME

# Delete CloudFront distribution (must disable first)
aws cloudfront delete-distribution --id YOUR_DISTRIBUTION_ID

# Delete load balancer
aws elbv2 delete-load-balancer --load-balancer-arn YOUR_ALB_ARN
```

## Useful Commands

### Check Service Health
```bash
# Get service status
aws ecs describe-services \
    --cluster manim-mcp-cluster \
    --services manim-mcp-service

# Get task status
aws ecs list-tasks --cluster manim-mcp-cluster --service-name manim-mcp-service

# Get ALB target health
aws elbv2 describe-target-health \
    --target-group-arn YOUR_TARGET_GROUP_ARN
```

### Cost Monitoring
```bash
# Get cost and usage (last 30 days)
aws ce get-cost-and-usage \
    --time-period Start=$(date -d '30 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
    --granularity MONTHLY \
    --metrics UnblendedCost \
    --group-by Type=SERVICE
```

---

**Note**: Replace placeholder values (subnet IDs, security group IDs, account IDs, etc.) with your actual AWS resource IDs.

