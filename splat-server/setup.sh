#!/bin/bash
# Setup script for LGM (Large Gaussian Model) inference backend.
# Run this once to install GPU dependencies and download model weights.
#
# Prerequisites:
#   - NVIDIA GPU with >=10GB VRAM (RTX 3060+, RTX 4070, etc.)
#   - CUDA toolkit installed (nvcc --version should work)
#   - Python 3.11+ with uv
#
# Usage:
#   cd splat-server
#   chmod +x setup.sh
#   ./setup.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== LGM Backend Setup ===${NC}"

# Check CUDA
if ! command -v nvcc &> /dev/null; then
    echo -e "${RED}Error: nvcc not found. Install CUDA toolkit first.${NC}"
    echo "  Ubuntu: sudo apt install nvidia-cuda-toolkit"
    exit 1
fi
echo -e "${GREEN}CUDA found: $(nvcc --version | grep release)${NC}"

# Install base deps
echo -e "${YELLOW}Installing base dependencies...${NC}"
uv sync

# Install PyTorch with CUDA
echo -e "${YELLOW}Installing PyTorch with CUDA...${NC}"
uv pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# Install LGM optional deps
echo -e "${YELLOW}Installing LGM dependencies...${NC}"
uv pip install safetensors transformers diffusers accelerate einops roma
uv pip install "rembg[gpu,cli]>=2.0.50"
uv pip install "kiui>=0.2.3" plyfile

# Install custom CUDA kernels (these compile from source)
echo -e "${YELLOW}Building diff-gaussian-rasterization (CUDA kernel)...${NC}"
uv pip install git+https://github.com/ashawkey/diff-gaussian-rasterization.git

echo -e "${YELLOW}Building simple-knn (CUDA kernel)...${NC}"
uv pip install git+https://github.com/camenduru/simple-knn.git

echo -e "${YELLOW}Installing nvdiffrast...${NC}"
uv pip install git+https://github.com/NVlabs/nvdiffrast.git

# Clone LGM repo if not present
LGM_DIR="${LGM_REPO_PATH:-../LGM}"
if [ ! -d "$LGM_DIR" ]; then
    echo -e "${YELLOW}Cloning LGM repository...${NC}"
    git clone https://github.com/3DTopia/LGM.git "$LGM_DIR"
fi

# Install MVDream/ImageDream
echo -e "${YELLOW}Installing MVDream pipeline...${NC}"
uv pip install git+https://github.com/bytedance/MVDream.git
uv pip install git+https://github.com/bytedance/ImageDream.git

# Download model weights
echo -e "${YELLOW}Downloading LGM model weights from HuggingFace...${NC}"
mkdir -p "$LGM_DIR/pretrained"
python -c "
from huggingface_hub import hf_hub_download
path = hf_hub_download(
    repo_id='ashawkey/LGM',
    filename='model_fp16_fixrot.safetensors',
    local_dir='$LGM_DIR/pretrained',
)
print(f'Downloaded to: {path}')
"

echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo -e "To use LGM backend, add to your .env:"
echo -e "  SPLAT_INFERENCE_BACKEND=lgm"
echo -e "  LGM_REPO_PATH=$(realpath $LGM_DIR)"
echo ""
echo -e "Start the server:"
echo -e "  uv run uvicorn server:app --host 0.0.0.0 --port 3005 --reload"
