"""
Lesson Viewer MCP App — split-pane video + KaTeX explanation rendered in a sandboxed iframe.

Registers:
  - render_manim_lesson tool (with meta.ui.resourceUri → lesson-viewer.html)
  - ui://manim-mcp/lesson-viewer.html resource (text/html;profile=mcp-app)
"""

import json
import re
from functools import lru_cache

from fastmcp import FastMCP
from core.renderer import render_manim_scene


RESOURCE_URI = "ui://manim-mcp/lesson-viewer.html"


def register_lesson_viewer(mcp: FastMCP, server_base_url: str) -> None:
    """Register the lesson viewer tool and resource on the given FastMCP instance."""

    # ── Tool ──────────────────────────────────────────────────────────────

    @mcp.tool(
        name="render_manim_lesson",
        description=(
            "Render a Manim animation and display it as an interactive lesson with "
            "a video player and a KaTeX-rendered explanation side by side. "
            "Write a complete Manim Scene class for the 'code' parameter, and provide "
            "an explanation using LaTeX ($...$ inline, $$...$$ display). "
            "This is the preferred tool — it renders AND displays in one call."
        ),
        meta={"ui": {"resourceUri": RESOURCE_URI}},
    )
    def render_manim_lesson(
        code: str,
        title: str = "Math Lesson",
        explanation: str = "",
        key_concepts: list[str] = [],
        quality: str = "medium_quality",
    ) -> str:
        # Validate code
        if "class " not in code or "Scene" not in code:
            return json.dumps(
                {
                    "status": "error",
                    "error": (
                        "Invalid code: Must contain a class inheriting from Scene.\n"
                        "Example:\n"
                        "from manim import *\n"
                        "class MyScene(Scene):\n"
                        "    def construct(self):\n"
                        "        ..."
                    ),
                }
            )

        if "from manim import" not in code:
            code = "from manim import *\n\n" + code

        valid_qualities = {
            "low_quality",
            "medium_quality",
            "high_quality",
            "production_quality",
        }
        if quality not in valid_qualities:
            quality = "medium_quality"

        result = render_manim_scene(code, quality=quality)

        # Extract video path from renderer output
        path_match = re.search(r"Video path: (.+?)(?:\n|$)", result)
        if not path_match:
            return json.dumps({"status": "error", "error": result})

        video_path = path_match.group(1).strip()
        video_url = f"{server_base_url}/videos/{video_path}"

        return json.dumps(
            {
                "status": "success",
                "video_url": video_url,
                "title": title,
                "explanation": explanation,
                "key_concepts": key_concepts,
            }
        )

    # ── Resource ──────────────────────────────────────────────────────────

    @mcp.resource(
        RESOURCE_URI,
        name="lesson-viewer.html",
        description="Lesson Viewer MCP App — split-pane video + KaTeX explanation",
        mime_type="text/html",
        meta={
            "ui": {
                "csp": {
                    "resourceDomains": [
                        "https://cdn.jsdelivr.net",
                        "https://unpkg.com",
                        server_base_url,
                    ]
                }
            }
        },
    )
    def lesson_viewer_html() -> str:
        return _build_html()

    # Patch mime_type to include MCP App profile.
    # FastMCP 2.13's Pydantic validation rejects MIME parameters (;profile=...)
    # so we register with text/html then patch after the fact.
    resource = mcp._resource_manager._resources[RESOURCE_URI]
    resource.mime_type = "text/html;profile=mcp-app"


@lru_cache(maxsize=1)
def _build_html() -> str:
    """Return the self-contained Lesson Viewer HTML app."""
    return """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Lesson Viewer</title>

<!-- KaTeX CSS -->
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css"
  crossorigin="anonymous"
/>

<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #0F1014;
    color: #ECDFCC;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  #loading {
    text-align: center;
    color: #6B7280;
    font-size: 14px;
  }
  #loading .spinner {
    width: 32px; height: 32px;
    border: 3px solid #2A2D35;
    border-top-color: #3B82F6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 12px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  #lesson { display: none; width: 100%; max-width: 1100px; }

  .title-bar {
    background: #1A1C20;
    border: 1px solid #2A2D35;
    border-radius: 10px 10px 0 0;
    padding: 14px 20px;
    font-size: 18px;
    font-weight: 600;
    color: #ECDFCC;
  }

  .content {
    display: flex;
    gap: 0;
    background: #1A1C20;
    border: 1px solid #2A2D35;
    border-top: none;
    border-radius: 0 0 10px 10px;
    overflow: hidden;
    min-height: 340px;
  }

  .video-pane {
    flex: 1 1 55%;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }
  .video-pane video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .explanation-pane {
    flex: 1 1 45%;
    padding: 20px 24px;
    overflow-y: auto;
    max-height: 480px;
    border-left: 1px solid #2A2D35;
  }

  .explanation-pane h3 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6B7280;
    margin-bottom: 12px;
  }

  .explanation-text {
    font-size: 15px;
    line-height: 1.7;
    color: #C4B8A8;
  }
  .explanation-text p { margin-bottom: 12px; }
  .explanation-text h1, .explanation-text h2, .explanation-text h3,
  .explanation-text h4, .explanation-text h5, .explanation-text h6 {
    color: #ECDFCC;
    margin: 20px 0 8px;
    line-height: 1.3;
  }
  .explanation-text h1 { font-size: 1.4em; }
  .explanation-text h2 { font-size: 1.25em; }
  .explanation-text h3 { font-size: 1.1em; }
  .explanation-text ul, .explanation-text ol {
    margin: 8px 0 12px 20px;
    color: #C4B8A8;
  }
  .explanation-text li { margin-bottom: 4px; }
  .explanation-text strong { color: #ECDFCC; font-weight: 600; }
  .explanation-text em { font-style: italic; }
  .explanation-text code {
    background: #2A2D35;
    color: #3B82F6;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
    font-family: "SF Mono", "Fira Code", monospace;
  }
  .explanation-text pre {
    background: #2A2D35;
    border: 1px solid #3A3D45;
    border-radius: 6px;
    padding: 12px 16px;
    overflow-x: auto;
    margin: 12px 0;
  }
  .explanation-text pre code {
    background: none;
    padding: 0;
    border-radius: 0;
  }
  .explanation-text blockquote {
    border-left: 3px solid #3B82F6;
    padding: 4px 16px;
    margin: 12px 0;
    color: #C4B8A8;
    font-style: italic;
  }
  .explanation-text hr {
    border: none;
    border-top: 1px solid #2A2D35;
    margin: 16px 0;
  }
  .explanation-text a {
    color: #3B82F6;
    text-decoration: underline;
  }
  .explanation-text table {
    border-collapse: collapse;
    margin: 12px 0;
    width: 100%;
  }
  .explanation-text th, .explanation-text td {
    border: 1px solid #2A2D35;
    padding: 6px 12px;
    text-align: left;
  }
  .explanation-text th {
    background: #2A2D35;
    color: #ECDFCC;
    font-weight: 600;
  }

  .key-concepts {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid #2A2D35;
  }
  .key-concepts h4 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6B7280;
    margin-bottom: 8px;
  }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag {
    background: #2A2D35;
    color: #3B82F6;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 12px;
    font-weight: 500;
  }

  /* Responsive: stack vertically on narrow screens */
  @media (max-width: 680px) {
    .content { flex-direction: column; }
    .video-pane { min-height: 220px; }
    .explanation-pane {
      border-left: none;
      border-top: 1px solid #2A2D35;
      max-height: none;
    }
  }

  /* KaTeX overrides for dark theme */
  .katex { color: #ECDFCC; }
  .katex-display { margin: 16px 0; overflow-x: auto; overflow-y: hidden; }
</style>
</head>
<body>

<div id="loading">
  <div class="spinner"></div>
  Waiting for lesson data&hellip;
</div>

<div id="lesson">
  <div class="title-bar" id="title">Math Lesson</div>
  <div class="content">
    <div class="video-pane">
      <video id="video" controls autoplay playsinline></video>
    </div>
    <div class="explanation-pane">
      <h3>Explanation</h3>
      <div class="explanation-text" id="explanation"></div>
      <div class="key-concepts" id="concepts-section" style="display:none">
        <h4>Key Concepts</h4>
        <div class="tags" id="concepts"></div>
      </div>
    </div>
  </div>
</div>

<!-- Marked (Markdown parser) -->
<script
  src="https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js"
  crossorigin="anonymous"
></script>
<!-- KaTeX JS + auto-render -->
<script
  src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js"
  crossorigin="anonymous"
></script>
<script
  src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js"
  crossorigin="anonymous"
></script>

<!-- MCP Apps SDK + App Logic (ES module) -->
<script type="module">
  import { App } from "https://unpkg.com/@modelcontextprotocol/ext-apps@0.4.0/app-with-deps";

  const app = new App({ name: "lesson-viewer", version: "1.0.0" });

  app.ontoolresult = (result) => {
    // result.content is an array of content blocks: [{type:"text", text:"..."}]
    const textBlock = result.content?.find(c => c.type === "text");
    if (!textBlock) {
      console.error("No text content in tool result:", result);
      return;
    }

    let data;
    try {
      data = JSON.parse(textBlock.text);
    } catch (e) {
      console.error("Failed to parse tool result JSON:", e);
      return;
    }

    if (data.status !== "success") {
      document.getElementById("loading").innerHTML =
        '<span style="color:#f87171">Error: ' +
        (data.error || "Unknown error") +
        "</span>";
      return;
    }

    // Hide loading, show lesson
    document.getElementById("loading").style.display = "none";
    document.getElementById("lesson").style.display = "block";

    // Title
    document.getElementById("title").textContent = data.title || "Math Lesson";

    // Video
    const video = document.getElementById("video");
    video.src = data.video_url;

    // Explanation — Markdown + KaTeX rendering
    const explEl = document.getElementById("explanation");
    const text = data.explanation || "";

    // Protect math expressions from Markdown parser
    const mathPlaceholders = [];
    let protected_ = text;

    // Protect display math ($$...$$) first, then inline ($...$)
    protected_ = protected_.replace(/\\$\\$([\\s\\S]*?)\\$\\$/g, (match) => {
      const idx = mathPlaceholders.length;
      mathPlaceholders.push(match);
      return "MATH_PLACEHOLDER_" + idx + "_END";
    });
    protected_ = protected_.replace(/\\$([^$\\n]+?)\\$/g, (match) => {
      const idx = mathPlaceholders.length;
      mathPlaceholders.push(match);
      return "MATH_PLACEHOLDER_" + idx + "_END";
    });

    // Parse Markdown
    let html = text;
    if (typeof marked !== "undefined" && marked.parse) {
      html = marked.parse(protected_, { breaks: true });
      // Restore math placeholders
      for (let i = 0; i < mathPlaceholders.length; i++) {
        html = html.replace("MATH_PLACEHOLDER_" + i + "_END", mathPlaceholders[i]);
      }
    } else {
      // Fallback: simple newline-to-paragraph conversion
      const paragraphs = text.split(/\\n\\n|\\n/).filter(p => p.trim());
      html = paragraphs.map(p => "<p>" + p + "</p>").join("");
    }

    explEl.innerHTML = html;

    // Render KaTeX
    if (typeof renderMathInElement === "function") {
      renderMathInElement(explEl, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\\\(", right: "\\\\)", display: false },
          { left: "\\\\[", right: "\\\\]", display: true },
        ],
        throwOnError: false,
      });
    }

    // Key concepts
    const concepts = data.key_concepts || [];
    if (concepts.length > 0) {
      document.getElementById("concepts-section").style.display = "block";
      document.getElementById("concepts").innerHTML = concepts
        .map(c => '<span class="tag">' + c + "</span>")
        .join("");
    }
  };

  // Establish communication with the host — REQUIRED
  await app.connect();
</script>
</body>
</html>"""
