import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from vision_llm import call_vision_llm
from models import EnrichmentRequest, EnrichmentResponse

# Import config — will raise ValueError if ANTHROPIC_API_KEY missing.
# We catch it so the server still starts during development without a key.
try:
    from config import FRONTEND_ORIGIN
except ValueError:
    FRONTEND_ORIGIN = "http://localhost:5173"

app = FastAPI(title="Vision Explorer Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def health_check():
    return {"status": "ok"}


@app.websocket("/enrich")
async def enrich(websocket: WebSocket):
    await websocket.accept()
    tasks: set[asyncio.Task] = set()

    async def process_request(request: EnrichmentRequest):
        try:
            result = await call_vision_llm(request.cropBase64, request.label)
            response = EnrichmentResponse(
                trackId=request.trackId,
                **result,
            )
            await websocket.send_json(response.model_dump())
        except (WebSocketDisconnect, RuntimeError):
            # Client already gone — nothing to send
            pass
        except Exception as exc:
            print(f"Error processing trackId {request.trackId}: {exc}")
            try:
                await websocket.send_json({"error": True, "trackId": request.trackId})
            except (WebSocketDisconnect, RuntimeError):
                pass

    try:
        while True:
            try:
                data = await websocket.receive_json()
                request = EnrichmentRequest(**data)
            except (ValueError, ValidationError) as exc:
                print(f"Invalid request: {exc}")
                continue

            # Fire off LLM call concurrently so the receive loop stays
            # responsive to WebSocket pings/pongs
            task = asyncio.create_task(process_request(request))
            tasks.add(task)
            task.add_done_callback(tasks.discard)

    except WebSocketDisconnect:
        print("Client disconnected")
    finally:
        # Cancel any in-flight LLM calls for this connection
        for t in tasks:
            t.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
