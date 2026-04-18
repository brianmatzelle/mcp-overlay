# MVP TODO - AWS Deployment

See `docs/AWS_DEPLOYMENT_PLAN.md` for full architecture and implementation guide.

## Recommended Order

### Phase 1: Database Setup (Days 1-2) ✅ Start Here
- [ ] Create RDS PostgreSQL instance (db.t4g.micro, Multi-AZ)
- [ ] Run schema migration (see deployment plan for SQL)
- [ ] Test connection from local environment
- [ ] Set up automated backups

### Phase 2: Auth0 Integration (Days 2-3)
- [ ] Create Auth0 tenant and configure application
- [ ] Install `@auth0/nextjs-auth0` in web client
- [ ] Add auth routes to Next.js (`/api/auth/[auth0]`)
- [ ] Update FastAPI server with JWT verification
- [ ] Add database ORM (SQLAlchemy) to server
- [ ] Implement user sync (Auth0 → PostgreSQL)

### Phase 3: AWS Infrastructure (Days 3-5)
- [ ] Create S3 bucket for video storage + lifecycle rules
- [ ] Set up CloudFront distribution for S3
- [ ] Create VPC with public/private subnets
- [ ] Set up Application Load Balancer
- [ ] Configure security groups and networking
- [ ] Create ECR repository for Docker images

### Phase 4: Containerize & Deploy (Days 5-7)
- [ ] Create Dockerfile for FastAPI server (with Manim deps)
- [ ] Build and test Docker image locally
- [ ] Push image to ECR
- [ ] Create ECS cluster and task definition
- [ ] Deploy ECS service with auto-scaling
- [ ] Update video rendering to upload to S3
- [ ] Test MCP server on AWS

### Phase 5: Update Web Client (Days 7-8)
- [ ] Add Auth0 environment variables to Vercel
- [ ] Update MCP client to send JWT tokens
- [ ] Point client to AWS ALB endpoint
- [ ] Test authentication flow end-to-end
- [ ] Update video serving (CloudFront URLs)
- [ ] Deploy to Vercel production

## Quick Start Commands

### Local Database Testing
```bash
# Install PostgreSQL client
sudo apt install postgresql-client

# Connect to RDS
psql -h your-rds-endpoint.rds.amazonaws.com -U postgres -d manim_tutor
```

### Docker Build & Test
```bash
cd server
docker build -t manim-mcp-server .
docker run -p 8000:8000 manim-mcp-server
```

### AWS Deployment
```bash
# Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
docker tag manim-mcp-server:latest <account>.dkr.ecr.us-east-1.amazonaws.com/manim-mcp-server:latest
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/manim-mcp-server:latest
```

## Cost: ~$75-105/month (with free tier)

See deployment plan for detailed breakdown and optimization tips.