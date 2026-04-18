# 📊 Monitoring and Logging Guide

Complete guide for monitoring your Manim MCP application in production.

## CloudWatch Logs

### ECS Container Logs

**Automatically configured** in the ECS task definition:

```json
"logConfiguration": {
  "logDriver": "awslogs",
  "options": {
    "awslogs-group": "/ecs/manim-mcp-server",
    "awslogs-region": "us-east-1",
    "awslogs-stream-prefix": "ecs",
    "awslogs-create-group": "true"
  }
}
```

### Viewing Logs

```bash
# Real-time log streaming
aws logs tail /ecs/manim-mcp-server --follow

# Filter for errors
aws logs filter-log-events \
    --log-group-name /ecs/manim-mcp-server \
    --filter-pattern "ERROR"

# Filter for specific tool calls
aws logs filter-log-events \
    --log-group-name /ecs/manim-mcp-server \
    --filter-pattern "plot_function"

# Time-based filtering (last 1 hour)
aws logs filter-log-events \
    --log-group-name /ecs/manim-mcp-server \
    --start-time $(date -d '1 hour ago' +%s)000
```

### Log Retention

Set retention to save costs:

```bash
# Set 30-day retention (reduce from default 'Never Expire')
aws logs put-retention-policy \
    --log-group-name /ecs/manim-mcp-server \
    --retention-in-days 30
```

## CloudWatch Metrics

### Built-in AWS Metrics

#### ECS Metrics
- **CPUUtilization**: Average CPU usage across tasks
- **MemoryUtilization**: Average memory usage
- **RunningTasksCount**: Number of healthy tasks

#### ALB Metrics
- **RequestCount**: Total requests
- **TargetResponseTime**: Response latency
- **HTTPCode_Target_4XX_Count**: Client errors
- **HTTPCode_Target_5XX_Count**: Server errors
- **HealthyHostCount**: Number of healthy targets
- **UnHealthyHostCount**: Number of unhealthy targets

#### RDS Metrics
- **CPUUtilization**: Database CPU usage
- **DatabaseConnections**: Active connections
- **FreeStorageSpace**: Available disk space
- **ReadLatency** / **WriteLatency**: Query performance

### Custom Application Metrics

Add to your FastAPI server:

```python
# server/core/metrics.py
import boto3
from datetime import datetime

cloudwatch = boto3.client('cloudwatch', region_name='us-east-1')

def log_metric(name: str, value: float, unit: str = 'Count'):
    """
    Log a custom metric to CloudWatch
    
    Args:
        name: Metric name (e.g., 'ToolCallDuration', 'VideoRenderTime')
        value: Metric value
        unit: CloudWatch unit (Count, Seconds, Bytes, etc.)
    """
    try:
        cloudwatch.put_metric_data(
            Namespace='ManimMCP',
            MetricData=[
                {
                    'MetricName': name,
                    'Value': value,
                    'Unit': unit,
                    'Timestamp': datetime.utcnow()
                }
            ]
        )
    except Exception as e:
        print(f"Failed to log metric: {e}")

# Usage in tools
import time
from core.metrics import log_metric

def plot_function(...):
    start_time = time.time()
    
    # ... render video ...
    
    duration = time.time() - start_time
    log_metric('VideoRenderTime', duration, 'Seconds')
    log_metric('ToolCallSuccess', 1)
```

**Useful Custom Metrics:**
- `VideoRenderTime`: Time to render each video (Seconds)
- `S3UploadTime`: Time to upload to S3 (Seconds)
- `ToolCallSuccess`: Successful tool calls (Count)
- `ToolCallFailure`: Failed tool calls (Count)
- `AuthenticationFailure`: Failed auth attempts (Count)
- `RateLimitHit`: Users hitting rate limits (Count)

## CloudWatch Alarms

### Critical Alarms (Page on-call)

#### High Error Rate
```bash
aws cloudwatch put-metric-alarm \
    --alarm-name manim-mcp-high-error-rate \
    --alarm-description "Alert when 5XX error rate > 5%" \
    --metric-name HTTPCode_Target_5XX_Count \
    --namespace AWS/ApplicationELB \
    --statistic Sum \
    --period 300 \
    --threshold 10 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 2 \
    --treat-missing-data notBreaching
```

#### No Healthy Targets
```bash
aws cloudwatch put-metric-alarm \
    --alarm-name manim-mcp-no-healthy-targets \
    --alarm-description "Alert when no ECS tasks are healthy" \
    --metric-name HealthyHostCount \
    --namespace AWS/ApplicationELB \
    --statistic Average \
    --period 60 \
    --threshold 1 \
    --comparison-operator LessThanThreshold \
    --evaluation-periods 2
```

#### Database Connection Failure
```bash
aws cloudwatch put-metric-alarm \
    --alarm-name manim-mcp-db-connection-failure \
    --alarm-description "Alert when DB connections approach limit" \
    --metric-name DatabaseConnections \
    --namespace AWS/RDS \
    --statistic Average \
    --period 300 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 2
```

### Warning Alarms (Monitor, not page)

#### High CPU Usage
```bash
aws cloudwatch put-metric-alarm \
    --alarm-name manim-mcp-high-cpu \
    --alarm-description "Alert when ECS CPU > 80%" \
    --metric-name CPUUtilization \
    --namespace AWS/ECS \
    --statistic Average \
    --period 300 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 3
```

#### High Memory Usage
```bash
aws cloudwatch put-metric-alarm \
    --alarm-name manim-mcp-high-memory \
    --alarm-description "Alert when ECS memory > 85%" \
    --metric-name MemoryUtilization \
    --namespace AWS/ECS \
    --statistic Average \
    --period 300 \
    --threshold 85 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 3
```

#### Slow Response Time
```bash
aws cloudwatch put-metric-alarm \
    --alarm-name manim-mcp-slow-response \
    --alarm-description "Alert when response time > 10 seconds" \
    --metric-name TargetResponseTime \
    --namespace AWS/ApplicationELB \
    --statistic Average \
    --period 300 \
    --threshold 10 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 2
```

### SNS for Alarm Notifications

```bash
# Create SNS topic
aws sns create-topic --name manim-mcp-alarms

# Get topic ARN
TOPIC_ARN=$(aws sns list-topics \
    --query 'Topics[?ends_with(TopicArn, `manim-mcp-alarms`)].TopicArn' \
    --output text)

# Subscribe email
aws sns subscribe \
    --topic-arn $TOPIC_ARN \
    --protocol email \
    --notification-endpoint your-email@example.com

# Add to alarm
aws cloudwatch put-metric-alarm \
    --alarm-name manim-mcp-high-error-rate \
    --alarm-actions $TOPIC_ARN \
    # ... other alarm config
```

## CloudWatch Dashboard

### Create Dashboard

```bash
cat > dashboard-config.json << 'EOF'
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "title": "ECS CPU & Memory",
        "metrics": [
          ["AWS/ECS", "CPUUtilization", {"stat": "Average"}],
          [".", "MemoryUtilization", {"stat": "Average"}]
        ],
        "period": 300,
        "region": "us-east-1",
        "yAxis": {"left": {"min": 0, "max": 100}}
      }
    },
    {
      "type": "metric",
      "properties": {
        "title": "ALB Requests & Errors",
        "metrics": [
          ["AWS/ApplicationELB", "RequestCount", {"stat": "Sum"}],
          [".", "HTTPCode_Target_5XX_Count", {"stat": "Sum"}],
          [".", "HTTPCode_Target_4XX_Count", {"stat": "Sum"}]
        ],
        "period": 300,
        "region": "us-east-1"
      }
    },
    {
      "type": "metric",
      "properties": {
        "title": "Response Time",
        "metrics": [
          ["AWS/ApplicationELB", "TargetResponseTime", {"stat": "Average"}],
          ["...", {"stat": "p99"}]
        ],
        "period": 300,
        "region": "us-east-1"
      }
    },
    {
      "type": "metric",
      "properties": {
        "title": "RDS Connections & CPU",
        "metrics": [
          ["AWS/RDS", "DatabaseConnections", {"stat": "Average"}],
          [".", "CPUUtilization", {"stat": "Average"}]
        ],
        "period": 300,
        "region": "us-east-1"
      }
    }
  ]
}
EOF

aws cloudwatch put-dashboard \
    --dashboard-name ManimMCP \
    --dashboard-body file://dashboard-config.json
```

View dashboard: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=ManimMCP

## Structured Logging

Add to FastAPI server:

```python
# server/core/logging_config.py
import logging
import json
from datetime import datetime

class JSONFormatter(logging.Formatter):
    """Format logs as JSON for easy parsing in CloudWatch Insights"""
    
    def format(self, record):
        log_data = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': record.levelname,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno
        }
        
        # Add extra fields
        if hasattr(record, 'user_id'):
            log_data['user_id'] = record.user_id
        if hasattr(record, 'tool_name'):
            log_data['tool_name'] = record.tool_name
        if hasattr(record, 'duration'):
            log_data['duration'] = record.duration
        
        # Add exception info if present
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)
        
        return json.dumps(log_data)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)

# Apply JSON formatter
for handler in logging.root.handlers:
    handler.setFormatter(JSONFormatter())

# Usage in code
logger = logging.getLogger(__name__)

logger.info("Tool called", extra={
    'user_id': user_id,
    'tool_name': 'plot_function',
    'duration': 2.5
})
```

## CloudWatch Insights Queries

Run queries on your logs:

### Find Slow Tool Calls
```sql
fields @timestamp, tool_name, duration
| filter duration > 10
| sort duration desc
| limit 20
```

### Error Analysis
```sql
fields @timestamp, level, message, exception
| filter level = "ERROR"
| stats count() by message
| sort count desc
```

### User Activity
```sql
fields @timestamp, user_id, tool_name
| stats count() as call_count by user_id, tool_name
| sort call_count desc
```

### Response Time Percentiles
```sql
fields duration
| stats avg(duration), pct(duration, 50), pct(duration, 90), pct(duration, 99)
```

## Third-Party Monitoring (Optional)

### Sentry (Error Tracking)

```bash
pip install sentry-sdk[fastapi]
```

```python
# server/server.py
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

sentry_sdk.init(
    dsn="YOUR_SENTRY_DSN",
    integrations=[FastApiIntegration()],
    traces_sample_rate=0.1,  # 10% of requests
    environment="production"
)
```

### DataDog (APM & Infrastructure)

```bash
# Install DataDog agent in ECS
# Add to task definition
```

### New Relic (Full-stack observability)

```bash
pip install newrelic
```

```python
# Add to server startup
import newrelic.agent
newrelic.agent.initialize('newrelic.ini')
```

## Health Checks

### Application Health

```python
# server/server.py
@app.get("/health")
async def health_check():
    """Basic health check"""
    return {
        "status": "healthy",
        "service": "Manim MCP Server",
        "version": "1.0.0"
    }

@app.get("/health/detailed")
async def detailed_health_check():
    """Detailed health check with dependencies"""
    checks = {
        "service": "healthy",
        "database": check_database_connection(),
        "s3": check_s3_access(),
        "auth0": check_auth0_connectivity()
    }
    
    # Return 503 if any check fails
    all_healthy = all(v == "healthy" for v in checks.values())
    status_code = 200 if all_healthy else 503
    
    return JSONResponse(content=checks, status_code=status_code)
```

### ECS Health Check Configuration

Already in task definition:
```json
"healthCheck": {
  "command": ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"],
  "interval": 30,
  "timeout": 5,
  "retries": 3,
  "startPeriod": 60
}
```

## Cost Monitoring

### Set Billing Alerts

```bash
# Create budget
aws budgets create-budget \
    --account-id $(aws sts get-caller-identity --query Account --output text) \
    --budget '{
      "BudgetName": "ManimMCP-Monthly",
      "BudgetLimit": {
        "Amount": "100",
        "Unit": "USD"
      },
      "TimeUnit": "MONTHLY",
      "BudgetType": "COST"
    }' \
    --notifications-with-subscribers '[
      {
        "Notification": {
          "NotificationType": "ACTUAL",
          "ComparisonOperator": "GREATER_THAN",
          "Threshold": 80,
          "ThresholdType": "PERCENTAGE"
        },
        "Subscribers": [{
          "SubscriptionType": "EMAIL",
          "Address": "your-email@example.com"
        }]
      }
    ]'
```

### Cost Tracking by Service

```bash
# View costs by service (last 30 days)
aws ce get-cost-and-usage \
    --time-period Start=$(date -d '30 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
    --granularity MONTHLY \
    --metrics UnblendedCost \
    --group-by Type=SERVICE
```

## Monitoring Checklist

- [ ] CloudWatch Logs configured for ECS tasks
- [ ] Log retention set (30 days recommended)
- [ ] Critical alarms created (5XX errors, no healthy targets)
- [ ] Warning alarms created (high CPU, memory, latency)
- [ ] SNS topic configured for alarm notifications
- [ ] CloudWatch Dashboard created
- [ ] Structured logging implemented (JSON format)
- [ ] Custom metrics for tool calls and render time
- [ ] Billing alerts configured
- [ ] Health check endpoints implemented
- [ ] (Optional) Third-party monitoring integrated

## Useful Links

- CloudWatch Console: https://console.aws.amazon.com/cloudwatch
- CloudWatch Insights: https://console.aws.amazon.com/cloudwatch/home#logsV2:logs-insights
- ECS Console: https://console.aws.amazon.com/ecs/v2
- RDS Console: https://console.aws.amazon.com/rds
- Billing Dashboard: https://console.aws.amazon.com/billing/home

---

**Pro Tip**: Set up monitoring BEFORE you have issues. It's much easier to debug with good logs and metrics!

