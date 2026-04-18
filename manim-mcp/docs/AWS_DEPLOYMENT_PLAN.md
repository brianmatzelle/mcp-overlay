# 🚀 AWS Deployment Plan for Manim MCP

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         USERS                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                          │
┌─────────▼─────────┐      ┌────────▼──────────┐
│  Vercel (Next.js) │      │  Auth0            │
│  - Web Client     │      │  - Authentication │
│  - Chat Interface │◄─────┤  - User Management│
│  - MCP HTTP Client│      └───────────────────┘
└─────────┬─────────┘
          │ HTTPS
          │ /mcp endpoint
┌─────────▼──────────────────────────────────────┐
│            AWS Deployment                      │
│                                                │
│  ┌──────────────────────────────────────┐    │
│  │  Application Load Balancer (ALB)     │    │
│  │  - HTTPS termination                 │    │
│  │  - Health checks                     │    │
│  └───────────────┬──────────────────────┘    │
│                  │                             │
│  ┌───────────────▼──────────────────────┐    │
│  │  ECS Fargate Cluster                 │    │
│  │  ┌────────────────────────────────┐  │    │
│  │  │ FastAPI/FastMCP Server         │  │    │
│  │  │ - Manim rendering              │  │    │
│  │  │ - MCP tools                    │  │    │
│  │  │ - Auth middleware              │  │    │
│  │  └──┬──────────────────────┬──────┘  │    │
│  │     │                      │          │    │
│  │  Auto-scaling (2-10 tasks)│          │    │
│  └─────┼──────────────────────┼──────────┘    │
│        │                      │                │
│  ┌─────▼──────┐    ┌─────────▼─────────┐     │
│  │ RDS        │    │ S3 Bucket         │     │
│  │ PostgreSQL │    │ - Generated videos│     │
│  │ - Users    │    │ - Public read     │     │
│  │ - Chats    │    │ - Lifecycle rules │     │
│  │ - Videos   │    └─────────┬─────────┘     │
│  └────────────┘              │                │
│                    ┌──────────▼─────────┐     │
│                    │ CloudFront CDN     │     │
│                    │ - Fast delivery    │     │
│                    │ - HTTPS            │     │
│                    └────────────────────┘     │
│                                                │
│  ┌──────────────────────────────────────┐    │
│  │ AWS Secrets Manager                  │    │
│  │ - API keys                           │    │
│  │ - DB credentials                     │    │
│  └──────────────────────────────────────┘    │
└────────────────────────────────────────────────┘
```

## 🎯 Implementation Order (Recommended)

### Phase 1: Database First (Days 1-2)
**Why First?** Auth and app functionality depend on it. Set up schema early.

1. **RDS PostgreSQL Setup**
   - Multi-AZ for high availability
   - db.t4g.micro (free tier eligible) → scale later
   - Automated backups enabled

2. **Database Schema**
   ```sql
   -- Users table (synced with Auth0)
   CREATE TABLE users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     auth0_id VARCHAR(255) UNIQUE NOT NULL,
     email VARCHAR(255) UNIQUE NOT NULL,
     name VARCHAR(255),
     subscription_tier VARCHAR(50) DEFAULT 'free',
     max_tool_calls INTEGER DEFAULT 100,
     created_at TIMESTAMP DEFAULT NOW(),
     updated_at TIMESTAMP DEFAULT NOW()
   );

   -- Conversations
   CREATE TABLE conversations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES users(id) ON DELETE CASCADE,
     title VARCHAR(255),
     created_at TIMESTAMP DEFAULT NOW(),
     updated_at TIMESTAMP DEFAULT NOW()
   );

   -- Messages
   CREATE TABLE messages (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
     role VARCHAR(20) NOT NULL, -- 'user' or 'assistant'
     content TEXT NOT NULL,
     created_at TIMESTAMP DEFAULT NOW()
   );

   -- Tool calls (for analytics & debugging)
   CREATE TABLE tool_calls (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
     tool_name VARCHAR(100) NOT NULL,
     tool_input JSONB,
     tool_output JSONB,
     video_path VARCHAR(500),
     execution_time_ms INTEGER,
     created_at TIMESTAMP DEFAULT NOW()
   );

   -- Video metadata (for S3 management)
   CREATE TABLE videos (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES users(id) ON DELETE CASCADE,
     s3_key VARCHAR(500) NOT NULL,
     s3_url VARCHAR(1000) NOT NULL,
     cloudfront_url VARCHAR(1000),
     file_size_bytes BIGINT,
     tool_call_id UUID REFERENCES tool_calls(id),
     created_at TIMESTAMP DEFAULT NOW(),
     expires_at TIMESTAMP -- for cleanup
   );

   -- Indexes
   CREATE INDEX idx_conversations_user ON conversations(user_id);
   CREATE INDEX idx_messages_conversation ON messages(conversation_id);
   CREATE INDEX idx_tool_calls_message ON tool_calls(message_id);
   CREATE INDEX idx_videos_user ON videos(user_id);
   CREATE INDEX idx_videos_expires ON videos(expires_at);
   ```

### Phase 2: Auth0 Integration (Days 2-3)
**Why Second?** Need DB ready to store user info. Auth blocks app usage.

1. **Auth0 Setup**
   - Create Auth0 tenant (free: 7,000 active users)
   - Configure application (Next.js SPA)
   - Set up API (FastAPI backend)
   - Configure social logins (Google, GitHub)

2. **Next.js Client** (`web-client/`)
   ```bash
   npm install @auth0/nextjs-auth0
   ```
   
   Add routes:
   - `/api/auth/[auth0]` - Auth0 handler
   - Wrap app with `<UserProvider>`
   - Add auth state to ChatInterface
   - Send JWT in MCP requests

3. **FastAPI Server** (`server/`)
   ```python
   # Add to pyproject.toml dependencies
   dependencies = [
       "fastmcp>=2.12.4",
       "jinja2>=3.1.6",
       "manim>=0.19.0",
       "python-jose[cryptography]>=3.3.0",  # JWT verification
       "sqlalchemy>=2.0.0",                 # Database ORM
       "asyncpg>=0.29.0",                   # PostgreSQL async driver
       "python-multipart>=0.0.9",           # Form data
   ]
   ```

   Add middleware:
   - JWT verification
   - User lookup/creation in DB
   - Rate limiting by subscription tier

### Phase 3: AWS Infrastructure (Days 3-5)
**Why Third?** Need auth + DB ready before deploying app.

1. **S3 Bucket** (Video Storage)
   ```bash
   # Bucket name: manim-tutor-videos-[random]
   # Configuration:
   - Block all public access: OFF (CloudFront will access)
   - Versioning: Disabled
   - Lifecycle rules:
     * Delete videos older than 90 days
     * Transition to S3 Glacier after 30 days (optional)
   - CORS: Allow Vercel domain
   ```

2. **CloudFront Distribution**
   - Origin: S3 bucket
   - Viewer protocol: Redirect HTTP to HTTPS
   - Cache behavior: Cache based on path
   - TTL: 1 year (videos don't change)

3. **VPC & Networking**
   - VPC with 2 public + 2 private subnets
   - NAT Gateway (for ECS to reach internet)
   - Security groups:
     * ALB: 443 from internet
     * ECS: 8000 from ALB only
     * RDS: 5432 from ECS only

4. **Application Load Balancer**
   - Internet-facing
   - Target group: ECS tasks on port 8000
   - Health check: `/health` endpoint
   - SSL certificate from ACM

### Phase 4: Containerize & Deploy FastAPI (Days 5-7)
**Why Fourth?** Infrastructure must exist first.

1. **Create Dockerfile** (`server/Dockerfile`)
   ```dockerfile
   FROM python:3.12-slim

   # Install system dependencies (Manim needs LaTeX, ffmpeg, etc.)
   RUN apt-get update && apt-get install -y \
       texlive-latex-base \
       texlive-fonts-recommended \
       texlive-fonts-extra \
       texlive-latex-extra \
       ffmpeg \
       libcairo2-dev \
       libpango1.0-dev \
       && rm -rf /var/lib/apt/lists/*

   WORKDIR /app

   # Install uv for fast package management
   COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

   # Copy dependency files
   COPY pyproject.toml uv.lock ./

   # Install dependencies
   RUN uv sync --frozen

   # Copy application code
   COPY . .

   # Expose port
   EXPOSE 8000

   # Health check
   HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
     CMD curl -f http://localhost:8000/health || exit 1

   # Run server
   CMD ["uv", "run", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
   ```

2. **ECS Task Definition**
   - Fargate platform version: LATEST
   - CPU: 1 vCPU (rendering needs compute)
   - Memory: 3 GB (Manim + LaTeX)
   - Environment variables:
     * `DATABASE_URL` (from Secrets Manager)
     * `AUTH0_DOMAIN`
     * `AUTH0_API_AUDIENCE`
     * `AWS_S3_BUCKET`
     * `CLOUDFRONT_URL`

3. **ECS Service**
   - Desired count: 2 (high availability)
   - Auto-scaling: 2-10 tasks based on CPU (>70%)
   - Load balancer: ALB target group

4. **Update Video Storage Logic**
   - Modify `_render_manim_code()` to upload to S3
   - Return CloudFront URL instead of local path
   - Update `show_video` tool to use S3 URLs

### Phase 5: Update Web Client (Days 7-8)
**Why Last?** Backend must be ready to receive authenticated requests.

1. **Environment Variables** (Vercel)
   ```env
   # Auth0
   AUTH0_SECRET=<random-32-char-string>
   AUTH0_BASE_URL=https://your-app.vercel.app
   AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com
   AUTH0_CLIENT_ID=<from-auth0>
   AUTH0_CLIENT_SECRET=<from-auth0>
   AUTH0_AUDIENCE=<your-api-identifier>

   # MCP Server
   NEXT_PUBLIC_MANIM_TUTOR_MCP_URL=https://your-alb-domain.amazonaws.com

   # Anthropic
   ANTHROPIC_API_KEY=<your-key>
   ```

2. **Update API Routes**
   - `/api/chat/route.ts`: Add auth check, send JWT to MCP server
   - `/api/video/route.ts`: Update to proxy CloudFront URLs (or remove if using direct S3 URLs)

3. **Update MCP Client**
   - Add `Authorization` header with JWT
   - Handle 401 errors (redirect to login)

## 💰 Cost Estimation (Monthly)

### Free Tier / Minimal Usage (First 12 months)
- **RDS db.t4g.micro**: $0 (750 hours/month free)
- **ECS Fargate**: ~$25-40 (1 vCPU, 3GB RAM, 2 tasks)
- **ALB**: $16.20 (720 hours)
- **S3**: $1-5 (depending on videos generated)
- **CloudFront**: $1-10 (data transfer)
- **NAT Gateway**: $32.40 (720 hours)
- **Secrets Manager**: $0.40 (1 secret)
- **Auth0**: $0 (7,000 active users free)

**Total: ~$75-105/month**

### After Free Tier / Higher Traffic
- **RDS db.t4g.small**: $25
- **ECS Auto-scaling (avg 4 tasks)**: $80-160
- **S3 + CloudFront**: $20-50
- **NAT Gateway**: $32.40
- **ALB**: $16.20
- **Data transfer**: $10-30

**Total: ~$180-315/month**

### Cost Optimization Tips
1. **Reserved Capacity**: Save 30-50% on RDS/ECS with 1-year commitment
2. **S3 Lifecycle**: Auto-delete old videos (90 days)
3. **Spot Instances**: Use Fargate Spot for non-critical tasks (70% savings)
4. **CloudFront**: Free tier covers 1TB/month data transfer
5. **VPC Endpoints**: Skip NAT Gateway (~$32/month) if using S3/Secrets Manager endpoints

## 🔒 Auth0 Integration Details

### Why Auth0?
- ✅ **Easy Integration**: Official Next.js SDK
- ✅ **JWT-based**: Works perfectly with FastAPI
- ✅ **Social Logins**: Google, GitHub, etc. built-in
- ✅ **Free Tier**: 7,000 active users
- ✅ **Enterprise Ready**: MFA, SSO, user management

### Implementation Steps

1. **Create Auth0 Application**
   - Type: Single Page Application
   - Allowed Callback URLs: `https://your-app.vercel.app/api/auth/callback`
   - Allowed Logout URLs: `https://your-app.vercel.app`

2. **Create Auth0 API**
   - Name: "Manim Tutor API"
   - Identifier: `https://api.manim-tutor.com` (your choice)
   - Signing Algorithm: RS256

3. **Next.js Integration**
   ```typescript
   // app/api/auth/[auth0]/route.ts
   import { handleAuth } from '@auth0/nextjs-auth0';
   export const GET = handleAuth();

   // app/layout.tsx
   import { UserProvider } from '@auth0/nextjs-auth0/client';
   export default function RootLayout({ children }) {
     return (
       <html>
         <body>
           <UserProvider>{children}</UserProvider>
         </body>
       </html>
     );
   }

   // components/ChatInterface.tsx
   import { useUser } from '@auth0/nextjs-auth0/client';
   export function ChatInterface() {
     const { user, isLoading } = useUser();
     if (!user) return <LoginPrompt />;
     // ... rest of component
   }
   ```

4. **FastAPI Integration**
   ```python
   # server/auth.py
   from jose import jwt, JWTError
   from fastapi import HTTPException, Security
   from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
   import httpx

   security = HTTPBearer()

   async def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
       token = credentials.credentials
       
       # Get Auth0 public key
       jwks_url = f'https://{AUTH0_DOMAIN}/.well-known/jwks.json'
       jwks = httpx.get(jwks_url).json()
       
       try:
           # Verify JWT
           payload = jwt.decode(
               token,
               jwks,
               algorithms=['RS256'],
               audience=AUTH0_AUDIENCE,
               issuer=f'https://{AUTH0_DOMAIN}/'
           )
           return payload
       except JWTError:
           raise HTTPException(status_code=401, detail='Invalid token')

   # server/server.py
   from auth import verify_token
   from fastapi import Depends

   @app.post("/mcp")
   async def mcp_endpoint(request: Request, user = Depends(verify_token)):
       # user['sub'] is the Auth0 user ID
       # Look up or create user in database
       db_user = await get_or_create_user(user['sub'], user.get('email'))
       
       # Check subscription limits
       if db_user.tool_calls_this_month > db_user.max_tool_calls:
           raise HTTPException(429, "Tool call limit reached")
       
       # Process MCP request
       # ...
   ```

## 🔐 Security Checklist

- [ ] RDS in private subnet (no public access)
- [ ] ECS tasks in private subnet (behind ALB)
- [ ] Security groups: principle of least privilege
- [ ] Secrets in AWS Secrets Manager (not env vars)
- [ ] S3 bucket: block public access, CloudFront only
- [ ] HTTPS only (HTTP → HTTPS redirect)
- [ ] Auth0 JWT verification on every request
- [ ] Rate limiting by user subscription tier
- [ ] Input validation on all tool parameters
- [ ] SQL injection prevention (use ORM)
- [ ] CORS: whitelist Vercel domain only
- [ ] CloudWatch logs: monitor for suspicious activity

## 📊 Monitoring & Operations

### CloudWatch Dashboards
1. **ECS Metrics**
   - CPU/Memory utilization
   - Task count
   - Auto-scaling events

2. **ALB Metrics**
   - Request count
   - Error rates (4xx, 5xx)
   - Target health

3. **RDS Metrics**
   - Connections
   - CPU/Memory
   - Storage

4. **Application Metrics**
   - Tool call latency
   - Video generation time
   - Failed renders

### Alarms
- ECS CPU > 80% (scale up)
- ALB 5xx errors > 5% (alert)
- RDS connections > 80% (alert)
- S3 storage > threshold (alert)

### Logging
- ECS logs → CloudWatch Logs
- Structured logging (JSON)
- Log retention: 30 days
- Error tracking: Sentry/DataDog (optional)

## 🚀 Deployment Commands

### Build & Push Docker Image
```bash
cd server

# Build image
docker build -t manim-mcp-server .

# Tag for ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker tag manim-mcp-server:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/manim-mcp-server:latest

# Push to ECR
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/manim-mcp-server:latest
```

### Deploy ECS Service
```bash
# Update service with new image
aws ecs update-service \
  --cluster manim-mcp-cluster \
  --service manim-mcp-service \
  --force-new-deployment
```

### Database Migrations
```bash
# Using Alembic or similar
uv run alembic upgrade head
```

## 📝 Next Steps

1. **Choose AWS Region**: `us-east-1` (cheapest) or closest to users
2. **Register Domain**: Route 53 or external
3. **Request SSL Certificate**: AWS ACM (free)
4. **Set up Terraform/CDK**: Infrastructure as Code (recommended)
5. **CI/CD Pipeline**: GitHub Actions → ECR → ECS

## 🤔 Alternative Hosting Options (If Considering)

### AWS Lambda + API Gateway (Serverless)
- ❌ **Not Recommended** for this use case
- Manim rendering takes 10-30 seconds (Lambda timeout: 15 min but cold starts)
- Large container image (>1GB with LaTeX)
- Better for stateless, short-duration tasks

### AWS Lightsail (Simple VPS)
- ✅ **Could Work** for MVP/small scale
- $10-40/month (fixed cost)
- ❌ Limited scaling (manual)
- ❌ No auto-scaling, load balancing

### AWS App Runner (Simplest)
- ✅ **Good Alternative** to ECS
- Fully managed container deployment
- Auto-scaling built-in
- ~$25-50/month base cost
- ⚠️ Less control than ECS

**Recommendation**: Start with **ECS Fargate** for production-ready, scalable solution.

## 🎓 Learning Resources

- [AWS ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/intro.html)
- [Auth0 Next.js Quickstart](https://auth0.com/docs/quickstart/webapp/nextjs)
- [FastAPI with JWT](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/)
- [AWS CDK for Infrastructure](https://docs.aws.amazon.com/cdk/v2/guide/home.html)

---

**Questions?** Review this plan and let me know which phase you'd like to start with!

