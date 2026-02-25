# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React + Three.js WebXR app.
- `src/components/`: 3D window and tool result panels.
- `src/hooks/`: Voice and XR hooks.
- `src/voice/`: Garvis WebSocket client.
- `public/`: Static assets.

## Build, Test, and Development Commands
- `npm run dev`: Vite dev server (HTTPS, port 5174).
- `npm run build`: TypeScript build + Vite bundle.
- `npx tsc -b`: Type check only.

This app expects MCP servers on `3001`/`3002` and the Garvis voice server on `8000`.

## Coding Style & Naming Conventions
- TypeScript, 2-space indent.
- Use descriptive 3D component names (e.g., `SubwayArrivals3D`).
- Keep rendering logic data-driven and aligned with existing parsing patterns.

## Testing Guidelines
- No unit tests configured; rely on `npx tsc -b` and manual XR validation.

## Commit & Pull Request Guidelines
- Note any changes to XR interaction (drag/resize, window behavior).
- Include screenshots or short clips for UI or XR changes.
