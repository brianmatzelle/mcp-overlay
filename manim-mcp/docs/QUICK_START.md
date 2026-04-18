# 🚀 Quick Start - Deploying to AWS

This guide will get your Manim MCP server deployed to AWS in ~8 hours.

## Prerequisites

- AWS Account with billing enabled
- AWS CLI configured (`aws configure`)
- Docker installed locally
- PostgreSQL client (`psql`) for database setup
- Auth0 account (free tier)
- Node.js 18+ for web client

## Phase 1: Database Setup (1-2 hours)

### 1. Create RDS PostgreSQL Instance

```bash
# Set variables
export DB_PASSWORD="YourSecurePassword123!"
export DB_NAME="manim_tutor"

# Create DB instance (free tier eligible)
aws rds create-db-instance \
    --db-instance-identifier manim-tutor-db \
    --db-instance-class db.t4g.micro \
    --engine postgres \
    --engine-version 15.4 \
    --master-username postgres \
    --master-user-password "$DB_PASSWORD" \
    --allocated-storage 20 \
    --backup-retention-period 7 \
    --multi-az

# Wait for creation (takes ~10 minutes)
aws rds wait db-instance-available --db-instance-identifier manim-tutor-db

# Get the endpoint
export DB_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier manim-tutor-db \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text)

echo "Database endpoint: $DB_ENDPOINT"
```

### 2. Run Database Schema

```bash
# Create database
psql -h $DB_ENDPOINT -U postgres -c "CREATE DATABASE $DB_NAME;"

# Run schema
psql -h $DB_ENDPOINT -U postgres -d $DB_NAME -f server/database_schema.sql

# Verify tables were created
psql -h $DB_ENDPOINT -U postgres -d $DB_NAME -c "\dt"
```

**✅ Checkpoint**: You should see 6 tables: `users`, `conversations`, `messages`, `tool_calls`, `videos`, `usage_tracking`

## Phase 2: Auth0 Setup (30 minutes)

### 1. Create Auth0 Application

1. Go to [auth0.com](https://auth0.com) and sign up (free)
2. Create a new **Single Page Application**
3. Note down:
   - Domain: `your-tenant.auth0.com`
   - Client ID
   - Client Secret

### 2. Configure Auth0 Application

**Allowed Callback URLs:**
```
http://localhost:3000/api/auth/callback,
https://your-app.vercel.app/api/auth/callback
```

**Allowed Logout URLs:**
```
http://localhost:3000,
https://your-app.vercel.app
```

**Allowed Web Origins:**
```
http://localhost:3000,
https://your-app.vercel.app
```

### 3. Create Auth0 API

1. Go to **Applications → APIs** in Auth0 dashboard
2. Create API:
   - Name: `Manim Tutor API`
   - Identifier: `https://api.manim-tutor.com` (can be any URL format)
   - Signing Algorithm: `RS256`

**✅ Checkpoint**: Save your Auth0 credentials - you'll need them in Phase 5

## Phase 3: AWS Infrastructure (2-3 hours)

### 1. Create S3 Bucket

```bash
# Create unique bucket name
export BUCKET_NAME="manim-tutor-videos-$(date +%s)"

# Create bucket
aws s3 mb s3://$BUCKET_NAME

# Set lifecycle policy (delete after 90 days)
cat > lifecycle.json << EOF
{
  "Rules": [{
    "Id": "DeleteOldVideos",
    "Status": "Enabled",
    "Expiration": { "Days": 90 }
  }]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
    --bucket $BUCKET_NAME \
    --lifecycle-configuration file://lifecycle.json

echo "S3 Bucket: $BUCKET_NAME"
```

### 2. Create VPC and Networking

```bash
# Create VPC (or use default)
export VPC_ID=$(aws ec2 describe-vpcs \
    --filters "Name=isDefault,Values=true" \
    --query 'Vpcs[0].VpcId' \
    --output text)

# Get public subnets
export SUBNET_1=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'Subnets[0].SubnetId' \
    --output text)

export SUBNET_2=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'Subnets[1].SubnetId' \
    --output text)

echo "VPC: $VPC_ID"
echo "Subnets: $SUBNET_1, $SUBNET_2"
```

### 3. Create Security Groups

```bash
# ALB security group (allow HTTPS from internet)
export ALB_SG=$(aws ec2 create-security-group \
    --group-name manim-alb-sg \
    --description "Security group for Manim ALB" \
    --vpc-id $VPC_ID \
    --query 'GroupId' \
    --output text)

aws ec2 authorize-security-group-ingress \
    --group-id $ALB_SG \
    --protocol tcp \
    --port 443 \
    --cidr 0.0.0.0/0

# ECS security group (allow traffic from ALB only)
export ECS_SG=$(aws ec2 create-security-group \
    --group-name manim-ecs-sg \
    --description "Security group for Manim ECS tasks" \
    --vpc-id $VPC_ID \
    --query 'GroupId' \
    --output text)

aws ec2 authorize-security-group-ingress \
    --group-id $ECS_SG \
    --protocol tcp \
    --port 8000 \
    --source-group $ALB_SG

echo "Security Groups created: ALB=$ALB_SG, ECS=$ECS_SG"
```

### 4. Create Application Load Balancer

```bash
# Create ALB
export ALB_ARN=$(aws elbv2 create-load-balancer \
    --name manim-mcp-alb \
    --subnets $SUBNET_1 $SUBNET_2 \
    --security-groups $ALB_SG \
    --scheme internet-facing \
    --query 'LoadBalancers[0].LoadBalancerArn' \
    --output text)

# Create target group
export TG_ARN=$(aws elbv2 create-target-group \
    --name manim-mcp-targets \
    --protocol HTTP \
    --port 8000 \
    --vpc-id $VPC_ID \
    --target-type ip \
    --health-check-path /health \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)

# Create HTTP listener (will redirect to HTTPS later)
aws elbv2 create-listener \
    --load-balancer-arn $ALB_ARN \
    --protocol HTTP \
    --port 80 \
    --default-actions Type=forward,TargetGroupArn=$TG_ARN

# Get ALB DNS name
export ALB_DNS=$(aws elbv2 describe-load-balancers \
    --load-balancer-arns $ALB_ARN \
    --query 'LoadBalancers[0].DNSName' \
    --output text)

echo "ALB DNS: http://$ALB_DNS"
```

**✅ Checkpoint**: Visit `http://$ALB_DNS/health` - should get 503 (no targets yet)

## Phase 4: Deploy FastAPI Server (2-3 hours)

### 1. Create ECR Repository

```bash
# Create repository
aws ecr create-repository \
    --repository-name manim-mcp-server \
    --image-scanning-configuration scanOnPush=true

# Get repository URI
export REPO_URI=$(aws ecr describe-repositories \
    --repository-names manim-mcp-server \
    --query 'repositories[0].repositoryUri' \
    --output text)

echo "ECR Repository: $REPO_URI"
```

### 2. Build and Push Docker Image

```bash
cd server

# Build image
docker build -t manim-mcp-server .

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin $REPO_URI

# Tag and push
docker tag manim-mcp-server:latest $REPO_URI:latest
docker push $REPO_URI:latest

cd ..
```

### 3. Create ECS Cluster

```bash
# Create cluster
aws ecs create-cluster \
    --cluster-name manim-mcp-cluster \
    --capacity-providers FARGATE

echo "ECS Cluster created"
```

### 4. Create IAM Roles

```bash
# Task execution role (for ECS to pull image, write logs)
aws iam create-role \
    --role-name ecsTaskExecutionRole \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "ecs-tasks.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }'

# Attach policies
aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Task role (for app to access S3)
aws iam create-role \
    --role-name ecsTaskRole \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "ecs-tasks.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }'

# S3 access for videos
aws iam attach-role-policy \
    --role-name ecsTaskRole \
    --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
```

### 5. Store Secrets

```bash
# Database URL
aws secretsmanager create-secret \
    --name manim-tutor/database-url \
    --secret-string "postgresql://postgres:$DB_PASSWORD@$DB_ENDPOINT:5432/$DB_NAME"

# Get account ID
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "Secrets stored"
```

### 6. Create ECS Task Definition

```bash
cat > task-definition.json << EOF
{
  "family": "manim-mcp-server",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "3072",
  "executionRoleArn": "arn:aws:iam::$ACCOUNT_ID:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::$ACCOUNT_ID:role/ecsTaskRole",
  "containerDefinitions": [{
    "name": "manim-mcp-server",
    "image": "$REPO_URI:latest",
    "portMappings": [{
      "containerPort": 8000,
      "protocol": "tcp"
    }],
    "essential": true,
    "environment": [
      {"name": "PORT", "value": "8000"},
      {"name": "AWS_REGION", "value": "us-east-1"},
      {"name": "AWS_S3_BUCKET", "value": "$BUCKET_NAME"}
    ],
    "secrets": [{
      "name": "DATABASE_URL",
      "valueFrom": "arn:aws:secretsmanager:us-east-1:$ACCOUNT_ID:secret:manim-tutor/database-url"
    }],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/manim-mcp-server",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "ecs",
        "awslogs-create-group": "true"
      }
    }
  }]
}
EOF

# Register task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

### 7. Create ECS Service

```bash
aws ecs create-service \
    --cluster manim-mcp-cluster \
    --service-name manim-mcp-service \
    --task-definition manim-mcp-server:1 \
    --desired-count 2 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={
        subnets=[$SUBNET_1,$SUBNET_2],
        securityGroups=[$ECS_SG],
        assignPublicIp=ENABLED
    }" \
    --load-balancers "targetGroupArn=$TG_ARN,containerName=manim-mcp-server,containerPort=8000"

echo "ECS Service created - waiting for tasks to start..."
sleep 60
```

**✅ Checkpoint**: Visit `http://$ALB_DNS/health` - should get `{"status":"healthy"}`

## Phase 5: Configure Web Client (30 minutes)

### 1. Update Vercel Environment Variables

Go to your Vercel project settings → Environment Variables:

```bash
# Generate Auth0 secret
openssl rand -hex 32

# Add these variables:
AUTH0_SECRET=<generated-secret>
AUTH0_BASE_URL=https://your-app.vercel.app
AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com
AUTH0_CLIENT_ID=<from-auth0>
AUTH0_CLIENT_SECRET=<from-auth0>
AUTH0_AUDIENCE=https://api.manim-tutor.com
NEXT_PUBLIC_MANIM_TUTOR_MCP_URL=http://$ALB_DNS
ANTHROPIC_API_KEY=<your-key>
```

### 2. Install Auth0 SDK

```bash
cd web-client
npm install @auth0/nextjs-auth0
```

### 3. Deploy to Vercel

```bash
# Commit changes
git add .
git commit -m "Add Auth0 and AWS configuration"
git push

# Vercel will auto-deploy
```

**✅ Checkpoint**: Visit your Vercel URL - app should load (auth not working yet)

## Phase 6: Testing (30 minutes)

### 1. Test Health Endpoint

```bash
curl http://$ALB_DNS/health
# Expected: {"status":"healthy","service":"Manim MCP Server","version":"1.0.0"}
```

### 2. Test MCP Endpoint (without auth for now)

```bash
# List tools
curl http://$ALB_DNS/mcp -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### 3. Check ECS Logs

```bash
# View logs
aws logs tail /ecs/manim-mcp-server --follow
```

## Cost Summary

With this basic setup:
- **RDS db.t4g.micro**: Free tier (first 12 months)
- **ECS Fargate (2 tasks)**: ~$35/month
- **ALB**: ~$16/month
- **S3 + Data transfer**: ~$5/month
- **Auth0**: Free tier

**Total: ~$55/month** (or ~$15/month after first year when RDS free tier ends but switching to spot instances)

## Next Steps

1. **Add HTTPS**: Request SSL certificate from AWS ACM, add HTTPS listener to ALB
2. **Implement Auth**: Add JWT verification to FastAPI server
3. **Add Database Integration**: Store users, conversations, tool calls
4. **Setup Auto-scaling**: Configure ECS service auto-scaling based on CPU
5. **Add Monitoring**: CloudWatch dashboards, alarms
6. **Domain Setup**: Register domain, configure Route 53

## Troubleshooting

### ECS tasks won't start
```bash
# Check service events
aws ecs describe-services \
    --cluster manim-mcp-cluster \
    --services manim-mcp-service \
    --query 'services[0].events[0:5]'

# Check task logs
aws logs tail /ecs/manim-mcp-server --follow
```

### ALB health checks failing
- Verify security group allows traffic from ALB to ECS
- Check `/health` endpoint returns 200 status
- Ensure ECS tasks have public IP (for now)

### Database connection fails
- Check RDS security group allows connections from ECS tasks
- Verify DATABASE_URL secret is correct
- Test connection from ECS task: `psql $DATABASE_URL`

### S3 upload fails
- Verify IAM task role has S3 write permissions
- Check bucket name in environment variables
- Ensure bucket exists and is accessible

## Helpful Commands

```bash
# View all environment variables
echo "DB_ENDPOINT: $DB_ENDPOINT"
echo "BUCKET_NAME: $BUCKET_NAME"
echo "ALB_DNS: $ALB_DNS"
echo "REPO_URI: $REPO_URI"

# Save for later
cat > deployment-info.txt << EOF
Database Endpoint: $DB_ENDPOINT
S3 Bucket: $BUCKET_NAME
ALB DNS: http://$ALB_DNS
ECR Repository: $REPO_URI
Account ID: $ACCOUNT_ID
EOF

# Force new deployment (after code changes)
aws ecs update-service \
    --cluster manim-mcp-cluster \
    --service manim-mcp-service \
    --force-new-deployment
```

---

**Questions?** Check the full [AWS Deployment Plan](./AWS_DEPLOYMENT_PLAN.md) for detailed architecture and Phase 6-7 implementation.

