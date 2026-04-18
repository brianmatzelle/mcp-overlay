"""
Voice pipeline orchestrating Deepgram STT → Claude → Eleven Labs TTS
With MCP tool calling support via the bridge
"""

import json
import re
from typing import Optional
from fastapi import WebSocket

from .deepgram_stt import DeepgramSTT
from .claude_llm import ClaudeLLM
from .elevenlabs_tts import ElevenLabsTTS

from tools.mcp_bridge import get_bridge


class VoicePipeline:
    """
    Orchestrates the real-time voice conversation flow:
    1. Receives audio from client
    2. Streams to Deepgram for real-time transcription
    3. On speech end (VAD), sends transcript to Claude with tools
    4. Executes any tool calls via MCP bridge
    5. Streams Claude response to Eleven Labs TTS
    6. Streams TTS audio back to client
    """

    @staticmethod
    def _normalize_transcript(text: str) -> str:
        """Normalize transcript to fix common STT misinterpretations."""
        text = re.sub(r'\bjarvis\b', 'Garvis', text, flags=re.IGNORECASE)
        text = re.sub(r'\btravis\b', 'Garvis', text, flags=re.IGNORECASE)
        return text

    @staticmethod
    def _normalize_llm_output(text: str) -> str:
        """Normalize LLM output and clean up whitespace."""
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.stt: Optional[DeepgramSTT] = None
        self.llm: Optional[ClaudeLLM] = None
        self.tts: Optional[ElevenLabsTTS] = None

        self.is_listening = False
        self.is_speaking = False
        self._processing = False  # Guard against overlapping speech-end handling
        self.conversation_history: list[dict] = []
        self.current_transcript = ""

        self._running = False

        # Latest camera frame (base64 JPEG) for vision research tool injection
        self._latest_frame: str | None = None

    # Tools whose results should be sent to the client for 3D rendering
    _RENDERABLE_MCP_TOOLS = {"subway-arrivals", "citibike-status", "search-streams", "show-stream", "research-visible-objects"}

    async def _send_mcp_tool_result(self, tool_name: str, content: list) -> None:
        """Send an MCP tool result to the client for 3D rendering."""
        if not self._running:
            return
        try:
            await self.websocket.send_json({
                "type": "mcp_tool_result",
                "tool_name": tool_name,
                "content": content,
            })
        except Exception as e:
            print(f"Error sending MCP tool result: {e}")

    async def _execute_tool(self, tool_name: str, args: dict) -> str:
        """Execute a tool and return the result string."""
        print(f"🔧 Executing tool: {tool_name} with args: {args}")

        try:
            # Inject latest camera frame for vision research tool
            if tool_name == "research-visible-objects":
                if not self._latest_frame:
                    return json.dumps({"success": False, "error": "No camera frame available. Make sure camera is streaming."})
                args["image_base64"] = self._latest_frame

            # Check MCP bridge first
            bridge = get_bridge()
            if bridge and bridge.is_mcp_tool(tool_name):
                result = await bridge.execute(tool_name, args)
                content = result.get("content", [])

                # Send renderable results to the client
                if tool_name in self._RENDERABLE_MCP_TOOLS and content:
                    await self._send_mcp_tool_result(tool_name, content)

                # Return text content to Claude for spoken response
                text_parts = [c.get("text", "") for c in content if c.get("type") == "text"]
                return "\n".join(text_parts) if text_parts else json.dumps(result)

            if tool_name == "ping":
                return json.dumps({
                    "status": "pong",
                    "service": "Garvis Voice Server",
                })

            return f"Unknown tool: {tool_name}"

        except Exception as e:
            print(f"❌ Tool execution error: {e}")
            return f"Error executing tool: {str(e)}"

    async def start(self):
        """Initialize and start the pipeline components"""
        self._running = True

        # Initialize components
        self.stt = DeepgramSTT(
            on_transcript=self._handle_transcript,
            on_speech_end=self._handle_speech_end
        )
        self.llm = ClaudeLLM()
        self.tts = ElevenLabsTTS(on_audio=self._send_audio)

        # Connect to Deepgram
        await self.stt.connect()

        # Send ready status
        await self._send_status()

    async def cleanup(self):
        """Clean up pipeline resources"""
        self._running = False

        if self.stt:
            await self.stt.disconnect()
        if self.tts:
            await self.tts.stop()

    async def process_audio(self, audio_bytes: bytes):
        """Process incoming audio from the client"""
        if not self._running or not self.stt:
            return

        # Forward audio to Deepgram STT
        await self.stt.send_audio(audio_bytes)

    async def handle_control(self, data: dict):
        """Handle control messages from the client"""
        msg_type = data.get("type")

        if msg_type == "start":
            self.is_listening = True
            await self._send_status()

        elif msg_type == "stop":
            self.is_listening = False
            await self._send_status()

        elif msg_type == "interrupt":
            # Stop current TTS playback
            if self.tts:
                await self.tts.stop()
            self.is_speaking = False
            await self._send_status()

        elif msg_type == "camera_frame":
            # Store latest camera frame for vision research tool
            frame = data.get("frame")
            if frame:
                self._latest_frame = frame
                if not hasattr(self, '_frame_log_count'):
                    self._frame_log_count = 0
                self._frame_log_count += 1
                if self._frame_log_count <= 3 or self._frame_log_count % 10 == 0:
                    print(f"📷 Camera frame received (#{self._frame_log_count}, {len(frame)} chars)")

        elif msg_type == "config":
            # Update configuration (voice, model, etc.)
            pass

    async def _handle_transcript(self, text: str, is_final: bool):
        """Handle transcript updates from Deepgram"""
        text = self._normalize_transcript(text)
        self.current_transcript = text

        # Send transcript to client
        await self.websocket.send_json({
            "type": "transcript",
            "text": text,
            "is_final": is_final,
            "role": "user"
        })

        if not self.is_listening:
            self.is_listening = True
            await self._send_status()

    async def _handle_speech_end(self, final_transcript: str):
        """Handle end of user speech (VAD triggered)"""
        if not final_transcript.strip():
            return

        # Guard: skip if already processing a response (prevents duplicates)
        if self._processing:
            print(f"⚠️ Skipping duplicate speech-end while still processing")
            return
        self._processing = True

        # Normalize transcript (e.g., "Jarvis" -> "Garvis")
        final_transcript = self._normalize_transcript(final_transcript)

        self.is_listening = False
        await self._send_status()

        # Add user message to history
        self.conversation_history.append({
            "role": "user",
            "content": final_transcript
        })

        # Get Claude response with tool support
        self.is_speaking = True
        await self._send_status()

        assistant_response = ""

        # Use tool-calling response flow
        async for event in self.llm.stream_response_with_tools(
            self.conversation_history,
            self._execute_tool
        ):
            event_type = event.get("type")

            if event_type == "text":
                # Accumulate text content
                assistant_response += event.get("content", "")

                # Normalize and send to client
                normalized = self._normalize_llm_output(assistant_response)
                if normalized:
                    await self.websocket.send_json({
                        "type": "transcript",
                        "text": normalized,
                        "is_final": False,
                        "role": "assistant"
                    })

            elif event_type == "tool_use":
                print(f"🔧 Tool call: {event.get('name')} with {event.get('input')}")

        # Finalize response
        final_response = self._normalize_llm_output(assistant_response)

        # Only add to history and TTS if there's actual text content
        if final_response:
            self.conversation_history.append({
                "role": "assistant",
                "content": final_response
            })

            # Send to TTS
            await self.tts.add_text(final_response)

            # Send final transcript
            await self.websocket.send_json({
                "type": "transcript",
                "text": final_response,
                "is_final": True,
                "role": "assistant"
            })

            # Wait for TTS to finish
            await self.tts.flush()

        self.is_speaking = False
        self._processing = False
        await self._send_status()

    async def _send_audio(self, audio_bytes: bytes):
        """Send TTS audio to the client"""
        if not self._running:
            return

        try:
            await self.websocket.send_bytes(audio_bytes)
        except Exception as e:
            print(f"Error sending audio: {e}")

    async def _send_status(self):
        """Send current status to the client"""
        if not self._running:
            return

        try:
            await self.websocket.send_json({
                "type": "status",
                "listening": self.is_listening,
                "speaking": self.is_speaking
            })
        except Exception as e:
            print(f"Error sending status: {e}")
