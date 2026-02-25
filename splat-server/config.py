"""Splat server configuration — loaded from environment variables."""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Inference backend: "mock" (default, always works) or "lgm" (requires GPU + model setup)
INFERENCE_BACKEND = os.getenv("SPLAT_INFERENCE_BACKEND", "mock")

# Temporary artifact storage
ARTIFACT_DIR = Path(os.getenv("SPLAT_ARTIFACT_DIR", "/tmp/splat-artifacts"))
ARTIFACT_TTL_SECONDS = int(os.getenv("SPLAT_ARTIFACT_TTL", "3600"))

# Image upload limits
MAX_IMAGE_BYTES = int(os.getenv("SPLAT_MAX_IMAGE_BYTES", str(20 * 1024 * 1024)))  # 20MB

# LGM-specific config
LGM_REPO_PATH = os.getenv("LGM_REPO_PATH", "")  # Path to cloned 3DTopia/LGM repo
LGM_CHECKPOINT = os.getenv("LGM_CHECKPOINT", "pretrained/model_fp16_fixrot.safetensors")
