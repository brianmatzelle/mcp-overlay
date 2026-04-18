# 📹 Video Rendering in Web Client

## Overview

The Manim Math Tutor automatically displays generated videos in the chat interface! When a Manim tool creates a visualization, the video player appears in the tool call result card.

## How It Works

### 1. **Server Side (MCP Tools)**

When a Manim visualization is rendered, the tool workflow is:

**Step 1:** Visualization tool (e.g., `plot_function`) renders the video:
```
✅ Scene rendered successfully!

Video path: tmp1cq1k94x/720p30/Surface3D.mp4

📹 Use the show_video tool with path 'tmp1cq1k94x/720p30/Surface3D.mp4' to display it.
```

**Step 2:** AI calls `show_video` tool with the path:
```
[DISPLAY_VIDEO:tmp1cq1k94x/720p30/Surface3D.mp4]
```

The `[DISPLAY_VIDEO:...]` tag contains the relative path from the manim `media/videos/` directory.

**Implementation:** 
- `server.py` → `_render_manim_code()` function (renders video)
- `server.py` → `show_video()` tool (returns display tag)

### 2. **API Endpoint (`/api/video`)**

A Next.js API route serves video files from the manim directory:

```typescript
GET /api/video?path=tmp1cq1k94x/720p30/Surface3D.mp4
```

**Features:**
- Streams video files with proper headers
- Supports video seeking (Accept-Ranges)
- Caching for performance
- Security: Only serves from manim media directory

**Location:** `web-client/src/app/api/video/route.ts`

### 3. **Client Side (React Components)**

The `ToolCallDisplay` component in `ChatInterface` automatically:
1. Detects `[DISPLAY_VIDEO:...]` patterns in tool call results
2. Parses out the video path
3. Renders an HTML5 video player in the tool card
4. Video auto-plays (muted, looping) for instant feedback

**Location:** `web-client/src/components/ChatInterface.tsx` → `ToolCallDisplay` component

## Architecture Diagram

```
┌─────────────────┐
│  Manim Tool     │
│  (plot_function)│
└────────┬────────┘
         │ Renders video
         ▼
┌─────────────────────────────────┐
│ _render_manim_code()            │
│ Returns: "Video path: abc.mp4   │
│          Use show_video..."     │
└────────┬────────────────────────┘
         │ AI calls show_video
         ▼
┌─────────────────────────────────┐
│ show_video tool                 │
│ Returns: [DISPLAY_VIDEO:abc.mp4]│
└────────┬────────────────────────┘
         │ Tool result
         ▼
┌─────────────────────────────────┐
│ ChatInterface                   │
│ → ToolCallDisplay component     │
└────────┬────────────────────────┘
         │ Detects [DISPLAY_VIDEO:...]
         ▼
┌─────────────────────────────────┐
│ ToolCallDisplay                 │
│ - Parses [DISPLAY_VIDEO:...]   │
│ - Renders VideoPlayer in card   │
└────────┬────────────────────────┘
         │ Requests video
         ▼
┌─────────────────────────────────┐
│ /api/video?path=...             │
│ - Serves video file             │
│ - From manim/media/videos/      │
└─────────────────────────────────┘
```

## Example Flow

1. **Student asks:** "Show me z = x² + y²"
2. **AI calls:** `plot_3d_surface(function="x**2 + y**2")`
3. **Tool returns:** 
   ```
   ✅ Scene rendered successfully!
   Video path: tmp1cq1k94x/720p30/Surface3D.mp4
   📹 Use the show_video tool with path 'tmp1cq1k94x/720p30/Surface3D.mp4' to display it.
   ```
4. **AI calls:** `show_video(video_path="tmp1cq1k94x/720p30/Surface3D.mp4")`
5. **Tool returns:** `[DISPLAY_VIDEO:tmp1cq1k94x/720p30/Surface3D.mp4]`
6. **ToolCallDisplay detects** the display tag in tool result
7. **Video player renders** in tool card with source: `/api/video?path=tmp1cq1k94x/720p30/Surface3D.mp4`
8. **Student watches** the 3D surface rotating!

## Video Player Features

- ✅ **Auto-play** (muted, looping for instant visual feedback)
- ✅ **Play/Pause controls**
- ✅ **Seek bar** (timeline scrubbing)
- ✅ **Volume control**
- ✅ **Fullscreen support**
- ✅ **Responsive sizing** (max-width: 2xl)
- ✅ **Clean UI** matching the app theme
- ✅ **Automatic preload** (metadata only for performance)
- ✅ **Displayed in tool card** (clear visual connection to the tool that created it)

## File Locations

### Server
- `mcp-factory/server/server.py` - Video rendering and `show_video` tool

### Web Client
- `web-client/src/app/api/video/route.ts` - Video streaming endpoint
- `web-client/src/components/ChatInterface.tsx` - Tool call display with video detection
- `web-client/src/components/MarkdownRenderer.tsx` - Markdown rendering (videos handled by ToolCallDisplay)

### Videos
- Generated in: `/manim/media/videos/tmpXXXXXX/720p30/*.mp4`
- Served via: `/api/video?path=tmpXXXXXX/720p30/*.mp4`

## Security Considerations

1. **Path Validation:** API only serves files from `manim/media/videos/`
2. **No Directory Traversal:** Paths are joined safely using `path.join()`
3. **File Type Check:** Only serves actual files (not directories)
4. **Error Handling:** Returns 404 for missing/invalid files

## Performance

- **Streaming:** Videos stream progressively (don't need full download)
- **Caching:** 1-year cache headers for served videos
- **Metadata Preload:** Only loads metadata initially, not full video
- **Efficient Seeking:** Supports byte-range requests

## Troubleshooting

### Video doesn't appear?
- Check console for `[DISPLAY_VIDEO:...]` in tool result
- Verify video file exists in `manim/media/videos/`
- Check browser network tab for `/api/video` request
- Ensure AI called `show_video` tool after rendering

### Video won't play?
- Ensure file is actually an MP4
- Check browser supports H.264 codec
- Verify file permissions allow reading
- Check if video is still rendering (wait for tool completion)

### Video path wrong?
- Check `_render_manim_code()` parsing logic
- Manim output format: `File ready at '/full/path/video.mp4'`
- Should extract everything after `media/videos/`
- Verify `show_video` tool received correct path

## Future Enhancements

- 📊 Video thumbnails/previews
- ⚡ WebM format support for better compression
- 🎬 Playlist support for multiple videos
- 💾 Download button for videos
- 📱 Better mobile video player
- 🎨 Custom video player controls

