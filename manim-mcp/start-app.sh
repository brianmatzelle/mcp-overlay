#!/bin/bash

# Start a new tmux session in detached mode with the server
tmux new-session -d -s "manim-mcp" -c "$(pwd)/server" "uv run uvicorn server:app --host 0.0.0.0 --port 8000 --reload"

# Split the window vertically and start the web client
tmux split-window -v -t "manim-mcp" -c "$(pwd)/web-client" "npm run dev"

# Attach to the tmux session
tmux attach-session -t "manim-mcp"