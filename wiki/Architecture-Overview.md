# Architecture Overview

MCP Overlay is a monorepo of six subprojects, each a self-contained building block that contributes a specific capability to the unified AR experience. The integration point is **xr-mcp-app**, which composes voice, vision, and MCP tools into a single WebXR application.

## System Architecture

```mermaid
graph TB
    subgraph "Meta Quest 3 Browser"
        XR["xr-mcp-app<br/>(React + Three.js + WebXR)<br/>:5174"]
    end

    subgraph "Garvis Server"
        GS["garvis/server<br/>(Python FastAPI)<br/>:8000"]
        STT["Deepgram STT"]
        LLM["Claude LLM"]
        TTS["ElevenLabs TTS"]
        YOLO["YOLOv8 Detection"]
        BRIDGE["MCP Bridge"]

        GS --> STT --> LLM --> TTS
        GS --> YOLO
        LLM --> BRIDGE
    end

    subgraph "MCP Servers"
        MTA["MTA Subway<br/>:3001"]
        CITI["Citibike<br/>:3002"]
        CRACK["CrackStreams<br/>:3003"]
        VIS["Vision Research<br/>:3004"]
    end

    XR -- "WebSocket<br/>PCM audio + JSON" --> GS
    XR -- "camera frames<br/>(base64 JPEG)" --> GS
    GS -- "MP3 audio +<br/>transcripts +<br/>tool results" --> XR

    BRIDGE -- "JSON-RPC 2.0<br/>HTTP" --> MTA
    BRIDGE -- "JSON-RPC 2.0<br/>HTTP" --> CITI
    BRIDGE -- "JSON-RPC 2.0<br/>HTTP" --> CRACK
    BRIDGE -- "JSON-RPC 2.0<br/>HTTP" --> VIS
```

## How It All Connects

The system follows a **hub-and-spoke** pattern:

1. **xr-mcp-app** is the frontend — it runs in the Quest 3 browser and handles all 3D rendering
2. **Garvis server** is the hub — it receives voice and camera input, orchestrates AI reasoning, and routes tool calls
3. **MCP servers** are the spokes — each provides specialized data (subway times, bike availability, sports streams, vision analysis)

The user never interacts with MCP servers directly. Everything flows through voice:

```
User speaks → Garvis transcribes → Claude reasons → Claude calls MCP tool
→ Tool result sent to XR app → 3D panel appears in AR space
→ Claude generates spoken response → Audio plays back
```

## Dual-Mode Rendering

The XR app has two modes, but only one matters:

| Mode | What Renders | Purpose |
|---|---|---|
| **Browser** | Title + "Enter AR" button | Launcher only |
| **XR (immersive-ar)** | Full 3D scene with all panels | The actual experience |

In XR mode, all UI is pure Three.js — no HTML overlays. Quest 3 silently ignores `dom-overlay`, so every element (text, buttons, windows, charts) is a 3D mesh.

## Data Flow: Voice-Triggered MCP

```mermaid
sequenceDiagram
    participant U as User (Quest 3)
    participant XR as xr-mcp-app
    participant G as Garvis Server
    participant D as Deepgram
    participant C as Claude
    participant M as MCP Server
    participant E as ElevenLabs

    U->>XR: Speaks into mic
    XR->>G: PCM audio (WebSocket binary)
    G->>D: Audio stream
    D->>G: Transcript (final)
    G->>C: User message + tools
    C->>G: tool_use: subway-arrivals
    G->>M: JSON-RPC tools/call
    M->>G: Tool result (JSON)
    G->>XR: mcp_tool_result message
    G->>C: Tool result → continue
    C->>G: "The next G train arrives in 3 minutes"
    G->>E: Text stream
    E->>G: MP3 audio chunks
    G->>XR: Binary MP3 frames
    XR->>U: 3D subway panel + spoken response
```

## Data Flow: Gaze-Anchored Vision

When the user asks about what they're looking at, a special flow captures their gaze position:

```mermaid
sequenceDiagram
    participant U as User
    participant XR as xr-mcp-app
    participant G as Garvis Server
    participant V as Vision Research

    Note over XR: Every frame: useXRHitTest('viewer')<br/>→ cache 3D surface point

    U->>XR: Starts speaking
    Note over XR: isListening: false→true<br/>Capture gaze position

    XR->>G: PCM audio + camera frame
    G->>V: research-visible-objects(frame)
    V->>G: Detections + enrichment
    G->>XR: mcp_tool_result

    Note over XR: consumeGaze('research-visible-objects')<br/>→ anchor at captured position

    XR->>U: Annotation cards at gaze point<br/>(billboard toward camera)
```

## Service Dependencies

```mermaid
graph LR
    XR["xr-mcp-app :5174"] --> GS["Garvis :8000"]
    XR --> MTA["MTA :3001"]
    XR --> CITI["Citibike :3002"]
    XR --> CRACK["CrackStreams :3003"]

    GS --> MTA
    GS --> CITI
    GS --> CRACK
    GS --> VIS["Vision Research :3004"]

    style XR fill:#4a9eff,color:#fff
    style GS fill:#ff6b6b,color:#fff
    style MTA fill:#6bcb77,color:#fff
    style CITI fill:#6bcb77,color:#fff
    style CRACK fill:#6bcb77,color:#fff
    style VIS fill:#6bcb77,color:#fff
```

- **xr-mcp-app** connects to Garvis via WebSocket and to MCP servers via Vite proxy (for direct tool calls)
- **Garvis** connects to all four MCP servers via the MCP Bridge (for voice-triggered tool calls)
- MCP servers are independent — they don't talk to each other

## Port Map

| Port | Service | Protocol |
|---|---|---|
| 3001 | MTA Subway MCP | HTTP (JSON-RPC) |
| 3002 | Citibike MCP | HTTP (JSON-RPC) |
| 3003 | CrackStreams MCP | HTTP (JSON-RPC) |
| 3004 | Vision Research MCP | HTTP (JSON-RPC) |
| 5173 | Garvis XR client / Vision Explorer 2 | HTTPS |
| 5174 | xr-mcp-app | HTTPS |
| 5180 | MCP App Sandbox frontend | HTTP |
| 5181 | MCP App Sandbox API | HTTP |
| 8000 | Garvis server | HTTP + WebSocket |

## Standalone vs Integrated

Not everything runs together. The monorepo contains both **integrated** services (started by `run.sh`) and **standalone** experiments:

| Service | In run.sh? | Notes |
|---|---|---|
| MTA Subway | Yes | MCP server |
| Citibike | Yes | MCP server |
| CrackStreams | Yes | MCP server |
| Vision Research | Yes | MCP server |
| Garvis server | Yes | Voice + detection hub |
| xr-mcp-app | Yes | Unified AR frontend |
| MCP App Sandbox | No | Browser-based MCP tester (separate workflow) |
| Vision Explorer 2 | No | Standalone app (port 8000 conflicts with Garvis) |
| Manim MCP | No | Separate math tutoring app |

---

**Next:** [Getting Started](Getting-Started.md) | [Garvis](Garvis.md) | [XR MCP App](XR-MCP-App.md)
