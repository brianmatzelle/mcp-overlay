#!/bin/bash
# Run all services for Garvis XR + MCP overlay

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PIDS=()

cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "${GREEN}Starting MCP Overlay services...${NC}"

# 1. MTA MCP server (port 3001)
echo -e "${GREEN}[1/4] MTA MCP server on port 3001...${NC}"
cd "$SCRIPT_DIR/mcp-app-sandbox/mta-subway"
npm run dev &
PIDS+=($!)

# 2. Citibike MCP server (port 3002)
echo -e "${GREEN}[2/4] Citibike MCP server on port 3002...${NC}"
cd "$SCRIPT_DIR/mcp-app-sandbox/citibike"
npm run serve &
PIDS+=($!)

# 3. Garvis server (port 8000)
echo -e "${GREEN}[3/4] Garvis server on port 8000...${NC}"
cd "$SCRIPT_DIR/garvis/server"
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
PIDS+=($!)

sleep 3

# 4. xr-mcp-app (port 5174)
echo -e "${GREEN}[4/4] XR MCP App on port 5174...${NC}"
cd "$SCRIPT_DIR/xr-mcp-app"
npm run dev &
PIDS+=($!)

echo ""
echo -e "${GREEN}All services running:${NC}"
echo -e "  MTA MCP server:      http://localhost:3001"
echo -e "  Citibike MCP server: http://localhost:3002"
echo -e "  Garvis server:       http://localhost:8000"
echo -e "  XR MCP App:          https://localhost:5174"
echo ""
echo -e "Press Ctrl+C to stop all services."

wait
