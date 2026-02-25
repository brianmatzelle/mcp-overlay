# Splat Server

Gaussian Splat Generation MCP Server. Converts images into interactive 3D Gaussian splat models.

## Architecture

```
FastMCP + FastAPI (port 3005)
├── /mcp                    — MCP protocol endpoint (JSON-RPC 2.0)
│   └── generate-splat-from-image tool
└── /artifacts/{id}.ply     — Serves generated PLY files
```

## MCP Tools

### `generate-splat-from-image`
- **Input:** `image_base64` (base64-encoded JPEG/PNG)
- **Output:** JSON with `artifact_url`, `vertex_count`, `backend`
- **Flow:** Image → (rembg → MVDream multi-view → LGM → PLY) or (mock sphere)

## Inference Backends

### Mock (default)
Generates a colorful sphere of ~1000 Gaussians. No GPU needed. Good for testing the full pipeline.

```bash
SPLAT_INFERENCE_BACKEND=mock  # default
```

### LGM (Large Gaussian Model)
Real image-to-3D conversion. Requires NVIDIA GPU with >=10GB VRAM.

```bash
SPLAT_INFERENCE_BACKEND=lgm
LGM_REPO_PATH=/path/to/cloned/LGM
```

Setup: `./setup.sh` (installs CUDA kernels, downloads model weights).

## Quick Start

```bash
uv sync
uv run uvicorn server:app --host 0.0.0.0 --port 3005 --reload
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SPLAT_INFERENCE_BACKEND` | `mock` | `mock` or `lgm` |
| `SPLAT_ARTIFACT_DIR` | `/tmp/splat-artifacts` | Temp PLY storage |
| `SPLAT_ARTIFACT_TTL` | `3600` | Artifact expiry (seconds) |
| `SPLAT_MAX_IMAGE_BYTES` | `20971520` | Max upload size (20MB) |
| `LGM_REPO_PATH` | — | Path to cloned 3DTopia/LGM repo |
| `LGM_CHECKPOINT` | `pretrained/model_fp16_fixrot.safetensors` | Model weights path |

## Key Files

- `server.py` — FastMCP + FastAPI server, artifact storage, MCP tool
- `inference.py` — Mock + LGM inference backends
- `config.py` — Environment variable configuration
- `setup.sh` — One-time GPU dependency installer
