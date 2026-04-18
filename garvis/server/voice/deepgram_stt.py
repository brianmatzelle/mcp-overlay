"""
Deepgram real-time Speech-to-Text with Voice Activity Detection
Uses aiohttp WebSocket for Python 3.14 compatibility
"""

import asyncio
import json
from typing import Callable, Awaitable, Optional
import aiohttp

from config import DEEPGRAM_API_KEY


class DeepgramSTT:
    """
    Real-time speech-to-text using Deepgram's streaming WebSocket API.
    
    Features:
    - Real-time transcription streaming
    - Built-in Voice Activity Detection (VAD)
    - Utterance end detection for conversation flow
    """
    
    DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen"
    
    def __init__(
        self,
        on_transcript: Callable[[str, bool], Awaitable[None]],
        on_speech_end: Callable[[str], Awaitable[None]]
    ):
        """
        Args:
            on_transcript: Callback for transcript updates (text, is_final)
            on_speech_end: Callback when speech ends (final transcript)
        """
        self.on_transcript = on_transcript
        self.on_speech_end = on_speech_end
        
        self._session: Optional[aiohttp.ClientSession] = None
        self._ws: Optional[aiohttp.ClientWebSocketResponse] = None
        self.current_transcript = ""
        self._connected = False
        self._receive_task: Optional[asyncio.Task] = None
    
    async def connect(self):
        """Establish connection to Deepgram"""
        if not DEEPGRAM_API_KEY:
            raise ValueError("DEEPGRAM_API_KEY is not set")
        
        # Build WebSocket URL with query parameters
        params = {
            "model": "nova-2",
            "language": "en-US",
            "smart_format": "true",
            "encoding": "linear16",
            "channels": "1",
            "sample_rate": "16000",
            "vad_events": "true",
            "interim_results": "true",
            "utterance_end_ms": "1000",
            "endpointing": "300",
        }
        
        query_string = "&".join(f"{k}={v}" for k, v in params.items())
        url = f"{self.DEEPGRAM_WS_URL}?{query_string}"
        
        headers = {
            "Authorization": f"Token {DEEPGRAM_API_KEY}"
        }
        
        try:
            self._session = aiohttp.ClientSession()
            self._ws = await self._session.ws_connect(url, headers=headers)
            self._connected = True
            print("🎤 Deepgram STT connected")
            
            # Start receiving messages in background
            self._receive_task = asyncio.create_task(self._receive_loop())
            
        except Exception as e:
            print(f"❌ Failed to connect to Deepgram: {e}")
            if self._session:
                await self._session.close()
                self._session = None
            raise
    
    async def disconnect(self):
        """Close the Deepgram connection"""
        self._connected = False
        
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
            self._receive_task = None
        
        if self._ws:
            await self._ws.close()
            self._ws = None
        
        if self._session:
            await self._session.close()
            self._session = None
            
        print("🔌 Deepgram STT disconnected")
    
    async def send_audio(self, audio_bytes: bytes):
        """Send audio data to Deepgram for transcription"""
        if self._ws and self._connected:
            try:
                await self._ws.send_bytes(audio_bytes)
            except Exception as e:
                print(f"Error sending audio: {e}")
    
    async def _receive_loop(self):
        """Background task to receive messages from Deepgram"""
        try:
            async for msg in self._ws:
                if not self._connected:
                    break
                
                if msg.type == aiohttp.WSMsgType.TEXT:
                    try:
                        data = json.loads(msg.data)
                        await self._handle_message(data)
                    except json.JSONDecodeError:
                        print(f"Invalid JSON from Deepgram: {msg.data[:100]}")
                    except Exception as e:
                        print(f"Error handling Deepgram message: {e}")
                
                elif msg.type == aiohttp.WSMsgType.CLOSED:
                    print("🔴 Deepgram connection closed")
                    self._connected = False
                    break
                
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    print(f"❌ Deepgram WebSocket error: {msg.data}")
                    self._connected = False
                    break
        
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"❌ Deepgram receive error: {e}")
            self._connected = False
    
    async def _handle_message(self, data: dict):
        """Handle a message from Deepgram"""
        msg_type = data.get("type", "")
        
        if msg_type == "Results":
            # Transcription result
            channel = data.get("channel", {})
            alternatives = channel.get("alternatives", [])
            
            if alternatives:
                transcript = alternatives[0].get("transcript", "")
                is_final = data.get("is_final", False)
                
                if transcript:
                    if is_final:
                        # Append to current transcript
                        if self.current_transcript:
                            self.current_transcript += " " + transcript
                        else:
                            self.current_transcript = transcript
                    
                    # Send to callback
                    display_text = self.current_transcript if is_final else transcript
                    await self.on_transcript(display_text, is_final)
        
        elif msg_type == "UtteranceEnd":
            # User stopped speaking
            if self.current_transcript:
                await self.on_speech_end(self.current_transcript)
                self.current_transcript = ""
        
        elif msg_type == "SpeechStarted":
            # User started speaking
            pass
        
        elif msg_type == "Metadata":
            # Connection metadata
            print(f"📊 Deepgram metadata: request_id={data.get('request_id', 'unknown')}")
        
        elif msg_type == "Error":
            # Error message
            error_msg = data.get("message", "Unknown error")
            print(f"❌ Deepgram error: {error_msg}")
