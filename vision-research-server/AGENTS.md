# Repository Guidelines

## Project Structure & Module Organization
- `server.py`: FastAPI + FastMCP entry point.
- `detect.py`: YOLO detection logic.
- `vision_llm.py`: Vision LLM enrichment.
- `config.py`: Configuration helpers.

## Build, Test, and Development Commands
- `uv sync`: Install dependencies.
- `uv run uvicorn server:app --host 0.0.0.0 --port 3004 --reload`: Run dev server.

## Coding Style & Naming Conventions
- Python 3.11+ with type hints.
- Keep detection and enrichment logic separate (detection in `detect.py`, enrichment in `vision_llm.py`).

## Testing Guidelines
- No tests configured. If you add tests, prefer `pytest` and name files `test_*.py`.

## Commit & Pull Request Guidelines
- Call out model changes, prompt updates, and any new output fields.

## Configuration & Environment Notes
- Requires `ANTHROPIC_API_KEY` in the runtime environment.
