# Environment Variables Configuration

## Server (FastAPI/FastMCP)

Create a `.env` file in the `server/` directory:

```bash
# Database Configuration
DATABASE_URL=postgresql://username:password@hostname:5432/database_name
# For AWS RDS:
# DATABASE_URL=postgresql://postgres:yourpassword@your-rds-instance.region.rds.amazonaws.com:5432/manim_tutor

# Auth0 Configuration
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_API_AUDIENCE=https://api.manim-tutor.com
AUTH0_ISSUER=https://your-tenant.auth0.com/

# AWS Configuration (for S3 video storage)
AWS_REGION=us-east-1
AWS_S3_BUCKET=manim-tutor-videos
CLOUDFRONT_URL=https://d1234567890.cloudfront.net

# Optional: AWS credentials (if not using IAM role)
# AWS_ACCESS_KEY_ID=your-access-key
# AWS_SECRET_ACCESS_KEY=your-secret-key

# Server Configuration
PORT=8000
HOST=0.0.0.0
LOG_LEVEL=INFO

# Manim Configuration
MANIM_QUALITY=low  # low, medium, high, production_quality
MANIM_OUTPUT_DIR=/tmp/manim_output

# Rate Limiting (per subscription tier)
RATE_LIMIT_FREE_TIER=100
RATE_LIMIT_PRO_TIER=1000
RATE_LIMIT_ENTERPRISE_TIER=10000

# Feature Flags
ENABLE_VIDEO_UPLOAD_TO_S3=true
ENABLE_ANALYTICS=true
ENABLE_RATE_LIMITING=true

# Development
DEBUG=false
```

## Web Client (Next.js)

Create a `.env.local` file in the `web-client/` directory:

```bash
# Auth0 Configuration
# Generate secret with: openssl rand -hex 32
AUTH0_SECRET=use-openssl-rand-hex-32-to-generate-a-32-byte-secret
AUTH0_BASE_URL=http://localhost:3000
# For production: https://your-app.vercel.app

AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id-from-auth0
AUTH0_CLIENT_SECRET=your-client-secret-from-auth0
AUTH0_AUDIENCE=https://api.manim-tutor.com

# MCP Server Configuration
# For local development
NEXT_PUBLIC_MANIM_TUTOR_MCP_URL=http://localhost:8000

# For production (AWS ECS)
# NEXT_PUBLIC_MANIM_TUTOR_MCP_URL=https://your-alb-domain.us-east-1.elb.amazonaws.com

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# Optional: Analytics
# NEXT_PUBLIC_GA_TRACKING_ID=G-XXXXXXXXXX
# NEXT_PUBLIC_POSTHOG_KEY=your-posthog-key

# Optional: Error Tracking
# NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn

# Development
NODE_ENV=development
# NODE_ENV=production
```

## Vercel Deployment

Set these environment variables in your Vercel project settings:

### Production Environment Variables
```
AUTH0_SECRET=<generate-with-openssl-rand-hex-32>
AUTH0_BASE_URL=https://your-app.vercel.app
AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com
AUTH0_CLIENT_ID=<from-auth0-dashboard>
AUTH0_CLIENT_SECRET=<from-auth0-dashboard>
AUTH0_AUDIENCE=https://api.manim-tutor.com
NEXT_PUBLIC_MANIM_TUTOR_MCP_URL=https://your-alb-domain.amazonaws.com
ANTHROPIC_API_KEY=sk-ant-your-key
NODE_ENV=production
```

### Preview Environment Variables (Optional)
Same as production but with different URLs:
```
AUTH0_BASE_URL=https://your-app-preview.vercel.app
# ... other variables same as production
```

## AWS Secrets Manager (Recommended for Production)

Instead of environment variables, store sensitive values in AWS Secrets Manager:

### Create Secrets
```bash
# Database credentials
aws secretsmanager create-secret \
    --name manim-tutor/database-url \
    --secret-string "postgresql://..."

# Auth0 credentials
aws secretsmanager create-secret \
    --name manim-tutor/auth0 \
    --secret-string '{
      "domain": "your-tenant.auth0.com",
      "api_audience": "https://api.manim-tutor.com"
    }'
```

### Update ECS Task Definition
Reference secrets in your task definition:
```json
"secrets": [
  {
    "name": "DATABASE_URL",
    "valueFrom": "arn:aws:secretsmanager:us-east-1:xxx:secret:manim-tutor/database-url"
  },
  {
    "name": "AUTH0_DOMAIN",
    "valueFrom": "arn:aws:secretsmanager:us-east-1:xxx:secret:manim-tutor/auth0:domain::"
  }
]
```

## Environment-Specific Configuration

### Local Development
- Use `localhost` for all services
- Disable S3 upload (save videos locally)
- Use lower Manim quality for faster rendering
- Enable DEBUG mode

### Staging/Preview
- Use separate Auth0 application
- Use separate database (or schema)
- Point to staging S3 bucket
- Enable detailed logging

### Production
- Use production Auth0 application
- Use production RDS instance
- Enable all security features
- Disable DEBUG mode
- Use Secrets Manager for sensitive data

## Security Best Practices

1. **Never commit .env files to git**
   - Add `.env`, `.env.local`, `.env.*.local` to `.gitignore`

2. **Use Secrets Manager in production**
   - Rotate secrets regularly
   - Use least-privilege IAM roles

3. **Separate credentials by environment**
   - Dev, staging, and prod should use different credentials

4. **Encrypt sensitive data at rest**
   - Use AWS KMS for encryption keys
   - Enable RDS encryption

5. **Use environment-specific Auth0 tenants**
   - Prevent accidental production access during development

## Troubleshooting

### "Database connection failed"
- Check `DATABASE_URL` format
- Verify RDS security group allows connections
- Ensure RDS is in correct VPC/subnet

### "Auth0 JWT verification failed"
- Check `AUTH0_DOMAIN` matches Auth0 tenant
- Verify `AUTH0_AUDIENCE` matches API identifier
- Ensure JWT is being sent in Authorization header

### "S3 upload failed"
- Check `AWS_S3_BUCKET` exists and is accessible
- Verify IAM role has S3 write permissions
- Check bucket region matches `AWS_REGION`

### "CORS error when calling MCP server"
- Verify `NEXT_PUBLIC_MANIM_TUTOR_MCP_URL` is correct
- Check ALB security group allows traffic from Vercel
- Ensure CORS headers are set on FastAPI server

