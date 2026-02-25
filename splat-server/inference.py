"""
Inference backends for Gaussian splat generation.

Two backends:
  - "mock": Generates a colorful sphere of Gaussians (no GPU needed, always works)
  - "lgm": Uses LGM (Large Gaussian Model) for real image-to-splat conversion

The mock backend is useful for testing the full pipeline (MCP → artifact → XR render)
without needing GPU setup. Switch to LGM for real inference.
"""

import io
import struct
import math
from typing import Any

import numpy as np
from PIL import Image

from config import INFERENCE_BACKEND, LGM_REPO_PATH, LGM_CHECKPOINT

# SH coefficient for degree 0 (DC term)
SH_C0 = 0.28209479177387814

# Lazy-loaded LGM model reference
_lgm_model: Any = None
_lgm_pipeline: Any = None


def load_backend() -> None:
    """Pre-load the configured inference backend."""
    if INFERENCE_BACKEND == "lgm":
        _load_lgm()
    else:
        print(f"[Inference] Using mock backend (colorful sphere)")


def generate_splat(image_bytes: bytes) -> tuple[bytes, dict]:
    """Generate a Gaussian splat PLY from an image.

    Returns (ply_bytes, metadata_dict).
    """
    if INFERENCE_BACKEND == "lgm":
        return _generate_lgm(image_bytes)
    return _generate_mock(image_bytes)


# =============================================================================
# MOCK BACKEND — colorful sphere of Gaussians
# =============================================================================


def _generate_mock(image_bytes: bytes) -> tuple[bytes, dict]:
    """Generate a sphere of ~1000 colorful Gaussians as a valid PLY file.

    This creates a visually interesting splat that validates the entire pipeline
    from MCP tool result → artifact serving → client PLY loading → WebXR rendering.
    """
    # Parse input image to extract dominant color (for fun)
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img_small = img.resize((1, 1))
        dominant_rgb = img_small.getpixel((0, 0))[:3]
        dominant_color = np.array(dominant_rgb, dtype=np.float32) / 255.0
    except Exception:
        dominant_color = np.array([0.4, 0.6, 1.0], dtype=np.float32)

    num_points = 1000

    # Generate points on a sphere using fibonacci spiral for even distribution
    indices = np.arange(num_points, dtype=np.float32)
    golden_ratio = (1 + math.sqrt(5)) / 2
    theta = 2 * math.pi * indices / golden_ratio
    phi = np.arccos(1 - 2 * (indices + 0.5) / num_points)

    # Vary radius slightly for organic look
    r = 0.25 + 0.05 * np.sin(indices * 0.1)

    x = r * np.sin(phi) * np.cos(theta)
    y = r * np.sin(phi) * np.sin(theta)
    z = r * np.cos(phi)

    # Colors: blend between dominant color and a complementary color based on position
    complement = np.array([1.0 - dominant_color[0], 1.0 - dominant_color[1], 1.0 - dominant_color[2]])
    t = (np.sin(phi * 3) * 0.5 + 0.5).reshape(-1, 1)
    point_colors = dominant_color * t + complement * (1 - t)
    # Add some random variation
    point_colors += np.random.uniform(-0.1, 0.1, (num_points, 3))
    point_colors = np.clip(point_colors, 0.0, 1.0)

    # Convert RGB to SH DC coefficients: f_dc = (color - 0.5) / SH_C0
    f_dc = (point_colors - 0.5) / SH_C0

    # Opacity: sigmoid inverse of ~0.9 → log(0.9 / 0.1) ≈ 2.197
    opacity_vals = np.full(num_points, 2.197, dtype=np.float32)

    # Scale: log of ~0.015 (small splats) ≈ -4.2
    scale_vals = np.full((num_points, 3), math.log(0.015), dtype=np.float32)

    # Rotation: identity quaternion [w=1, x=0, y=0, z=0]
    rot_vals = np.zeros((num_points, 4), dtype=np.float32)
    rot_vals[:, 0] = 1.0

    # Normals: zero (unused in rendering)
    normals = np.zeros((num_points, 3), dtype=np.float32)

    # Write binary PLY
    ply_bytes = _write_ply(num_points, x, y, z, normals, f_dc, opacity_vals, scale_vals, rot_vals)

    metadata = {
        "vertex_count": num_points,
        "backend": "mock",
        "description": "Colorful sphere for pipeline testing",
    }
    return ply_bytes, metadata


def _write_ply(
    num_points: int,
    x: np.ndarray, y: np.ndarray, z: np.ndarray,
    normals: np.ndarray,
    f_dc: np.ndarray,
    opacity: np.ndarray,
    scale: np.ndarray,
    rot: np.ndarray,
) -> bytes:
    """Write a standard 3DGS binary PLY file."""
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {num_points}\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "property float nx\n"
        "property float ny\n"
        "property float nz\n"
        "property float f_dc_0\n"
        "property float f_dc_1\n"
        "property float f_dc_2\n"
        "property float opacity\n"
        "property float scale_0\n"
        "property float scale_1\n"
        "property float scale_2\n"
        "property float rot_0\n"
        "property float rot_1\n"
        "property float rot_2\n"
        "property float rot_3\n"
        "end_header\n"
    )

    buf = io.BytesIO()
    buf.write(header.encode("ascii"))

    for i in range(num_points):
        buf.write(struct.pack("<fff", float(x[i]), float(y[i]), float(z[i])))
        buf.write(struct.pack("<fff", float(normals[i, 0]), float(normals[i, 1]), float(normals[i, 2])))
        buf.write(struct.pack("<fff", float(f_dc[i, 0]), float(f_dc[i, 1]), float(f_dc[i, 2])))
        buf.write(struct.pack("<f", float(opacity[i])))
        buf.write(struct.pack("<fff", float(scale[i, 0]), float(scale[i, 1]), float(scale[i, 2])))
        buf.write(struct.pack("<ffff", float(rot[i, 0]), float(rot[i, 1]), float(rot[i, 2]), float(rot[i, 3])))

    return buf.getvalue()


# =============================================================================
# LGM BACKEND — real image-to-splat via Large Gaussian Model
# =============================================================================


def _load_lgm() -> None:
    """Load the LGM model and MVDream pipeline.

    Requires:
      - LGM_REPO_PATH set to cloned https://github.com/3DTopia/LGM
      - CUDA-capable GPU with >=10GB VRAM
      - Dependencies installed via setup.sh
    """
    global _lgm_model, _lgm_pipeline

    if not LGM_REPO_PATH:
        raise RuntimeError(
            "LGM_REPO_PATH not set. Clone https://github.com/3DTopia/LGM "
            "and set LGM_REPO_PATH to the repo directory."
        )

    import sys
    if LGM_REPO_PATH not in sys.path:
        sys.path.insert(0, LGM_REPO_PATH)

    import torch
    from core.options import config_defaults  # type: ignore
    from core.models import LGM as LGMModel  # type: ignore

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device.type != "cuda":
        raise RuntimeError("LGM backend requires CUDA GPU")

    print(f"[LGM] Loading model on {device}...")

    # Load model with 'big' config (splat_size=128, output_size=512)
    opt = config_defaults["big"]
    _lgm_model = LGMModel(opt)

    # Load checkpoint
    import os
    ckpt_path = os.path.join(LGM_REPO_PATH, LGM_CHECKPOINT)
    if not os.path.exists(ckpt_path):
        # Try downloading from HuggingFace
        from huggingface_hub import hf_hub_download
        ckpt_path = hf_hub_download(
            repo_id="ashawkey/LGM",
            filename="model_fp16_fixrot.safetensors",
            local_dir=os.path.join(LGM_REPO_PATH, "pretrained"),
        )
        print(f"[LGM] Downloaded checkpoint to {ckpt_path}")

    from safetensors.torch import load_file
    ckpt = load_file(ckpt_path, device=str(device))
    _lgm_model.load_state_dict(ckpt, strict=False)
    _lgm_model = _lgm_model.half().to(device)
    _lgm_model.eval()
    _lgm_model.prepare_default_rays(device)

    print("[LGM] Model loaded")

    # Load MVDream pipeline for multi-view generation
    from mvdream.pipeline_mvdream import MVDreamPipeline  # type: ignore
    _lgm_pipeline = MVDreamPipeline.from_pretrained(
        "ashawkey/imagedream-ipmv-diffusers",
        torch_dtype=torch.float16,
    ).to(device)
    print("[LGM] MVDream pipeline loaded")


def _generate_lgm(image_bytes: bytes) -> tuple[bytes, dict]:
    """Run LGM inference: image → background removal → multi-view → Gaussians → PLY."""
    import sys
    if LGM_REPO_PATH not in sys.path:
        sys.path.insert(0, LGM_REPO_PATH)

    import torch
    import tempfile
    from rembg import remove  # type: ignore

    if _lgm_model is None or _lgm_pipeline is None:
        raise RuntimeError("LGM model not loaded. Call load_backend() first.")

    device = next(_lgm_model.parameters()).device

    # 1. Load and preprocess image
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    # 2. Remove background
    img_nobg = remove(img)
    img_nobg = img_nobg.resize((256, 256))

    # Composite on white background
    if img_nobg.mode == "RGBA":
        bg = Image.new("RGBA", img_nobg.size, (255, 255, 255, 255))
        bg.paste(img_nobg, mask=img_nobg.split()[3])
        img_input = bg.convert("RGB")
    else:
        img_input = img_nobg.convert("RGB")

    # 3. Generate 4 multi-view images via MVDream
    input_tensor = torch.from_numpy(
        np.array(img_input).astype(np.float32) / 255.0
    ).permute(2, 0, 1).unsqueeze(0).to(device)

    with torch.no_grad():
        mv_images = _lgm_pipeline(
            image=input_tensor,
            guidance_scale=5.0,
            num_inference_steps=30,
            elevation=0,
        )
        mv_images = mv_images.images  # [4, H, W, 3]

    # 4. Prepare multi-view input for LGM
    images_input = []
    for mv_img in mv_images:
        if isinstance(mv_img, Image.Image):
            mv_img = np.array(mv_img).astype(np.float32) / 255.0
        mv_tensor = torch.from_numpy(mv_img).permute(2, 0, 1).unsqueeze(0).to(device).half()
        images_input.append(mv_tensor)

    images_input = torch.cat(images_input, dim=0).unsqueeze(0)  # [1, 4, 3, H, W]

    # Add ray embeddings
    rays = _lgm_model.prepare_default_rays(device)
    images_input = torch.cat([images_input, rays.unsqueeze(0).repeat(1, 1, 1, 1, 1)[:, :, :6, :, :]], dim=2)

    # 5. Forward pass → Gaussians
    with torch.no_grad():
        gaussians = _lgm_model.forward_gaussians(images_input)

    # 6. Save PLY to temp file, read bytes
    with tempfile.NamedTemporaryFile(suffix=".ply", delete=False) as f:
        tmp_path = f.name

    _lgm_model.gs.save_ply(gaussians, tmp_path)

    with open(tmp_path, "rb") as f:
        ply_bytes = f.read()

    import os
    os.unlink(tmp_path)

    # Count vertices from PLY header
    vertex_count = 0
    header_str = ply_bytes[:2048].decode("ascii", errors="ignore")
    for line in header_str.split("\n"):
        if line.startswith("element vertex"):
            vertex_count = int(line.split()[-1])
            break

    metadata = {
        "vertex_count": vertex_count,
        "backend": "lgm",
        "description": "LGM image-to-splat generation",
    }
    return ply_bytes, metadata
