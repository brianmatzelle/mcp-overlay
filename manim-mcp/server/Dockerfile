# Dockerfile for Manim MCP Server
# Optimized for AWS ECS Fargate deployment

FROM python:3.12-slim

# Install system dependencies required by Manim
# - LaTeX for mathematical rendering
# - ffmpeg for video encoding
# - Cairo and Pango for graphics
# - Build tools for compiling Python packages
RUN apt-get update && apt-get install -y \
    texlive-latex-base \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    texlive-latex-extra \
    ffmpeg \
    libcairo2-dev \
    libpango1.0-dev \
    curl \
    build-essential \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv for fast Python package management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install Python dependencies
# --frozen: Use exact versions from lockfile
# --no-cache: Don't cache packages (smaller image)
RUN uv sync --frozen --no-cache

# Copy application code
COPY . .

# Create directory for temporary Manim output
# (In production, videos will be uploaded to S3)
RUN mkdir -p /tmp/manim_output

# Expose port 8000 for FastAPI
EXPOSE 8000

# Health check endpoint
# ECS will use this to determine if container is healthy
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Run the FastAPI server
# --host 0.0.0.0: Listen on all interfaces (required in containers)
# --port 8000: Default port
CMD ["uv", "run", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]

