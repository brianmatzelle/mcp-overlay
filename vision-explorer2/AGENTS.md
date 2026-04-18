# Repository Guidelines

## Project Structure & Module Organization
- `frontend/`: React + TypeScript + Vite (YOLO in-browser).
- `backend/`: FastAPI WebSocket server for Vision LLM enrichment.
- `docs/`: Supporting notes and design docs.

## Build, Test, and Development Commands
- `cd frontend && pnpm install && pnpm dev`: Frontend dev server (5173).
- `cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000`: Backend.
- `cd frontend && pnpm tsc --noEmit`: Frontend type check.
- `cd frontend && pnpm vitest run`: Frontend unit tests.
- `cd backend && python -m pytest tests/ -x`: Backend tests.
- `cd frontend && pnpm eslint src/`: Frontend lint.
- `cd backend && ruff check .`: Backend lint.

## Coding Style & Naming Conventions
- Frontend uses Tailwind and Zustand; keep types in `frontend/src/types/index.ts`.
- Use `getClassColor()` for overlays; do not hardcode class colors.
- Keep ONNX model in `frontend/public/models/` (Vite does not bundle from `src/`).

## Testing Guidelines
- Prefer unit tests for tracking/YOLO logic over camera-dependent UI tests.
- Mock Anthropic calls in backend tests.

## Commit & Pull Request Guidelines
- Note any changes to gating rules or overlay lifecycle.
- Include screenshots for UI changes.

## Configuration & Environment Notes
- Backend requires `ANTHROPIC_API_KEY`.
- Backend uses WebSocket `/enrich`; no REST endpoints.
