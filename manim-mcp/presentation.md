# Coloring in the Circle

### An AI Math Tutor Powered by Manim & MCP

**Brian Matzelle**
Software Engineer | Binghamton University CS '24

---

## Part 1: Why I Built This

---

### I Almost Didn't Study Computer Science

I almost went to school for philosophy. In 11th grade, while every one of my friends was
taking BC Calc, I was the only one in AP Stats -- because I couldn't do calculus.

**If I can't visualize something, I can't understand it.**

That's not a learning disability. That's just how some people think. But the way math is
taught doesn't account for that.

---

### The Dinner Table

Growing up, my family ate dinner together every night. That's where I learned the most.

I'll never forget when my dad tried to explain why in a track race, the outside runner
starts ahead of the inside runner. I *argued* with him. I struggled with it. And then
I visualized it -- the circumference changes as the diameter changes -- and it clicked.

**That's how I learn math. By seeing it. By arguing with it. By iterating.**

---

### Linear Algebra: My Great Regret

Sophomore year at Binghamton, I almost failed linear algebra.

Now, in the age of AI, linear algebra is *everywhere* -- embeddings, transformers,
attention mechanisms. It's become one of my goals to truly understand it someday.

Since I could barely keep up in class, I'd go home and watch **3blue1brown** on YouTube.
Grant Sanderson's visualizations did what the lectures couldn't.

---

### The Aha Moment

Chapter 5 of 3blue1brown's Deep Learning series -- vector word embeddings in 3D space.

He showed how "man" and "woman" are separated in a direction similar to "king" and "queen."

I didn't understand that from a textbook. I understood it from a **rotating 3D scatter plot**.

That was the moment I thought:

> "I wish I could just *talk* to Manim and have it show me what I'm thinking."

---

### What is Manim?

**Manim** (Mathematical Animation Engine) is the Python library Grant Sanderson created
to make all of those beautiful 3blue1brown animations.

```
Python code  -->  LaTeX + Cairo + FFmpeg  -->  Video
```

It's incredibly powerful. But there's a gap:

**You have to write code to make animations.**

A student who's struggling with math is not going to write Python to understand it.
What if they could just *ask*?

---

## Part 2: What is MCP?

---

### MCP in One Sentence

**Model Context Protocol** is an open standard that lets AI models
discover and call tools at runtime.

Think of it as:

- A **standardized interface** between an LLM and any backend
- Tools are **self-describing** (name, description, parameter schema)
- The LLM **discovers** tools dynamically -- no hardcoding
- The LLM uses its **discretion** to decide which tools to call and how

---

### AI Gets Hands

Before MCP, language models could only *talk* about things.

With MCP, they can *do* things.

There is nothing an agent cannot do now. **Nothing.**

MCP allows us developers to leverage an LLM's discretion
so it can arbitrarily execute code. It can be *anything*.

MCP servers should be:
- **Self-discovering** -- the LLM learns what's available at runtime
- **Schema-aware** -- each tool describes its own parameters
- **Context-efficient** -- rich descriptions so the LLM picks the right tool

This allows an LLM to leverage the **full scope of features**
enabled by the backend or library you wish to agent-ify.

---

### The 2D Plane Metaphor

Imagine traditional software on a 2D plane.

The **backend** is the origin. End-user **features** are terminal points on lines
extending from the origin. Each line is a hardcoded client implementation.

```
         Traditional Client-Server

                    Feature C
                     /
                    /
       Feature B   /
          \       /
           \     /
            \   /
  Feature A--[BACKEND]--Feature D
            /   \
           /     \
          /       \
       Feature E   Feature F

  Each line = a developer manually coded it
  The plane is mostly empty.
```

In traditional software, you might have tens of lines, each coded by a developer.
A lot of engineering effort, but the plane is **sparsely populated**.

---

### Coloring in the Circle

Now replace the web client with an **MCP client** -- an LLM that reads tool schemas
and calls them based on user intent.

```
         MCP-Powered Architecture

              . - - - - - .
           /                 \
         /    * * * * * * *    \
        |   * * * * * * * * *   |
       |  * * * [BACKEND] * * *  |
       |  * * *  every   * * *   |
       |  * * *  point   * * *   |
        |  * * * reached * * *  |
         \    * * * * * * *    /
           \                 /
              ' - - - - - '

  Each "line" is dynamically generated.
  The LLM reaches any tool, in any order.
  The circle is colored in.
```

Each line is **dynamically generated** by the LLM's discretion.
The full scope of the backend is theoretically realized.

**The circle is colored in, instead of sparsely populated.**

---

### What This Means for Data Visualization

For a company that provides data visualizations:

- Expose your **entire rendering library** via MCP tools
- Let the LLM **choose** which visualization fits the user's question
- No more building 50 chart-type selectors in the UI
- The user says what they want; the AI picks the right tool
- **Every chart type your backend supports becomes reachable**

That's what I built for Manim. Let me show you how.

---

## Part 3: Technical Deep Dive

---

### Architecture

Two independent services. The frontend never hardcodes which tools exist.

```
  Next.js Frontend (port 3000)        Python Server (port 8000)
  ================================    ================================
  |                              |    |                              |
  |  /api/chat                   |    |  FastAPI + FastMCP           |
  |    |                         |    |    |                         |
  |    v                         |    |    v                         |
  |  Claude API  <--- SSE --->   |    |  /mcp/math  (MCP endpoint)  |
  |  (streaming)                 |    |    |                         |
  |                              |    |    v                         |
  |  Dynamic tool discovery      |    |  10 MCP Tools                |
  |  at EVERY request            |    |    - 4 utilities             |
  |                              |    |    - 3 algebra (2D)          |
  |  No tool names               |    |    - 3 three-d (3D)         |
  |  hardcoded anywhere          |    |                              |
  ================================    ================================
```

At each chat request, the frontend calls `listTools()` on the MCP server and
passes whatever it finds to Claude. **Add a tool to the server, and the frontend
sees it without redeploying.** That's the circle getting colored in.

```typescript
// web-client/src/app/api/chat/route.ts
async function getAvailableTools(mcpClient) {
  const mcpTools = await mcpClient.listTools();
  return mcpTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema
  }));
}
```

---

### The Four-Stage Pipeline

When you ask "Plot sin(x)" -- here's what happens:

```
  "Plot sin(x)"
       |
       v
  ┌─────────────────────────────────────────────┐
  │  [1] PARSE                                   │
  │      SymPy parse_expr() -> Abstract Syntax   │
  │      Tree. NO eval(). Ever.                  │
  │                                               │
  │      3 validation checks:                     │
  │        Variables:  {x, y, z, t, u, v}        │
  │        Functions:  21 whitelisted (sin,       │
  │                    cos, sqrt, exp, ...)       │
  │        Complexity: max 1000 atoms             │
  └──────────────────────┬──────────────────────-─┘
                         |
  ┌──────────────────────v──────────────────────-─┐
  │  [2] GENERATE                                  │
  │      Jinja2 templates convert AST to Manim    │
  │      Python code. Auto-escaping. No string    │
  │      concatenation.                            │
  └──────────────────────┬─────────────────────-──┘
                         |
  ┌──────────────────────v──────────────────────-─┐
  │  [3] RENDER                                    │
  │      subprocess.run(manim, timeout=120s)      │
  │      Isolated process. Outputs .mp4 video.    │
  └──────────────────────┬─────────────────────-──┘
                         |
  ┌──────────────────────v──────────────────────-─┐
  │  [4] DISPLAY                                   │
  │      [DISPLAY_VIDEO:path] marker              │
  │      Frontend regex extracts path             │
  │      Renders <video> element in chat          │
  └────────────────────────────────────────────-──┘
```

---

### Stage 1: Security -- No eval(). Ever.

The most important design decision: **we never execute user input as code**.

The user's math expression goes through SymPy's `parse_expr()`, which builds an
Abstract Syntax Tree. Before we do anything with it, we validate three things:

```python
# server/core/expression_parser.py

# Only these variables are allowed
DEFAULT_ALLOWED_VARIABLES = {'x', 'y', 'z', 't', 'u', 'v'}

# Only these 21 functions are allowed
FUNCTION_MAP = {
    'sin': sin, 'cos': cos, 'tan': tan,
    'sqrt': sqrt, 'abs': Abs, 'ln': ln,
    'log': log, 'exp': exp, 'sinh': sinh,
    'cosh': cosh, 'tanh': tanh, 'asin': asin,
    'acos': acos, 'atan': atan, 'arcsin': asin,
    'arccos': acos, 'arctan': atan, 'floor': floor,
    'ceil': ceiling, 'ceiling': ceiling,
}

# Prevent DoS via deeply nested expressions
MAX_COMPLEXITY = 1000
```

If someone types `__import__('os').system('rm -rf /')`, it fails at the
variable check. It never gets anywhere near execution.

The `local_dict` passed to `parse_expr()` restricts what names are even
*available* during parsing:

```python
def _build_local_dict(allowed_variables):
    local_dict = {}
    for var in allowed_variables:
        local_dict[var] = Symbol(var, real=True)  # Forces real numbers
    local_dict['pi'] = pi
    local_dict['e'] = E
    local_dict.update(FUNCTION_MAP)  # Only safe SymPy functions
    return local_dict

sympy_expr = parse_expr(expression, local_dict=local_dict)
```

No Python builtins. No `exec`. No `eval`. Just math.

---

### Stage 2: Template-Based Code Generation

Once we have a validated AST, we convert it to a safe Python string and slot it
into a **Jinja2 template**. No f-strings. No string concatenation.

The user's expression becomes a `lambda` inside the template -- never raw code:

```python
# Inside a Jinja2 template:
graph = axes.plot(lambda x: {{ function }}, color={{ color }})
```

Where `{{ function }}` is something like `3*x**2 + numpy.sin(x)` --
derived from the SymPy AST, not from user input.

---

### Stage 3: Subprocess Isolation

The generated Manim code runs in a **subprocess** with a hard timeout:

```python
# server/core/renderer.py
result = subprocess.run(
    ["uv", "run", "manim", f"-q{quality_flag}", temp_file],
    capture_output=True,
    text=True,
    timeout=120  # 2 minutes max, 3 minutes for 3D
)
```

If Manim hangs or crashes, we catch it and return a clean error.
The server process is never at risk.

---

### Stage 4: The DISPLAY_VIDEO Technique

This is one of my favorite design decisions. How do you get a video from a
server-side subprocess into a chat message?

**Step 1: The server returns a marker string.**

```python
# server/tools/utilities.py -- ShowVideoTool
def execute(self, video_path: str) -> str:
    return f"[DISPLAY_VIDEO:{video_path}]"
```

**Step 2: The system prompt teaches Claude to call it.**

```
"After a visualization tool completes, it will return a video path.
 You MUST immediately call show_video(path) with that exact path
 to display it!"
```

Claude learns this behavior from **instruction**, not from hardcoded logic.

**Step 3: The frontend extracts the path with a regex.**

```typescript
// web-client/src/components/ChatInterface.tsx
const getVideoPath = (result: string | undefined): string | null => {
    if (!result) return null;
    const match = result.match(/\[DISPLAY_VIDEO:([^\]]+)\]/);
    return match ? match[1] : null;
};
```

If the regex matches, the frontend renders a `<video>` element.

This is the 2D Plane Metaphor in miniature: Claude chains `plot_function` ->
`show_video` not because we hardcoded that chain, but because we *described*
the behavior and let the LLM figure it out.

---

### Tool Extensibility

Adding a new visualization tool takes 3 steps. No frontend changes.

```python
# 1. Create a class
class MyNewTool(BaseVisualizationTool):

    @property
    def metadata(self) -> ToolMetadata:
        return ToolMetadata(
            name="my_new_tool",
            description="Does something cool",
            category=ToolCategory.ALGEBRA_2D,
            use_cases=["When a student asks about..."],
            examples=[{"function": "x^2"}]
        )

    def execute(self, function: str, ...) -> str:
        # Parse, generate, render
        return render_manim_scene(code)

# 2. Register it
registry.register_tool(MyNewTool())

# 3. Done. The LLM discovers it at the next request.
```

We have 10 tools today. Manim has hundreds of Mobjects and animations.
Every tool we add colors in a little more of the circle.

---

### Streaming: Real-Time Tool Execution

The frontend uses **Server-Sent Events** to show everything in real time:

```
User sends message
    |
    v
Claude starts responding (text streams in real-time)
    |
    v
Claude decides to call plot_function
    --> Frontend shows tool card: "Executing..."
    |
    v
Server parses, generates, renders (2-5 seconds)
    --> Frontend updates: "Complete" + video appears
    |
    v
Claude calls show_video, then explains what it rendered
    --> Text streams alongside the video
```

The tool call loop runs up to 100 iterations -- Claude can chain
as many tools as it needs to answer a question.

---

## Part 4: Live Demo

---

### Demo 1: Plot a Function

> "Plot f(x) = x^2 - 4 and highlight where it crosses the x-axis"

Watch Claude:
1. Choose `plot_function` (not `compare_functions` or `show_transformation`)
2. Parse the expression safely through SymPy
3. Render the Manim animation
4. Call `show_video` to display it
5. Explain the result

---

### Demo 2: Compare Functions

> "Compare f(x) = sin(x) and g(x) = cos(x)"

Claude picks a *different* tool -- `compare_functions` -- because I asked to compare.
Same pipeline, different tool. The LLM's discretion at work.

---

### Demo 3: 3D Surface

> "Show me what x^2 + y^2 looks like in 3D"

Now Claude calls `plot_3d_surface`. A rotating 3D paraboloid with a
color gradient from blue to red based on height.

Three different questions. Three different tools. **Zero hardcoded routing.**

---

## Part 5: Open Questions

---

### Where is MCP Best Used?

MCP shines when you have a **rich backend with many capabilities**.

If you only have one tool, you don't need LLM discretion.
But if you have hundreds of chart types, hundreds of Mobjects,
hundreds of animation styles -- letting the LLM pick the right one
based on the user's question is powerful.

**Where does LLM discretion help vs. hurt?**

---

### What's the Best Medium for Manim MCP?

I built a chat interface because it was fastest. But what about:

- **Voice-first tutoring?** "Hey, show me what happens when I stretch this parabola."
- **Embedded in an LMS?** Canvas, Blackboard, or Google Classroom integration.
- **A VS Code extension?** For math students writing proofs.
- **Inside your own data viz platform?** Where your chart library replaces Manim.

---

### How Do We Verify AI-Generated Graphs at Scale?

This is the question that keeps me up at night.

The LLM **chooses the parameters**. What if it picks a misleading x-range?
What if the generated code produces a visually plausible but mathematically
wrong animation?

**How do you regression-test visual output?**

For a data visualization company, this is existential:
when the AI picks the chart and the parameters,
**how do you know it's not hallucinating entire graphs?**

I'd genuinely love to hear your thoughts.

---

### Thank You

```
github.com/brianmatzelle/manim-mcp
```

**"The circle is colored in."**

Brian Matzelle
brian@startingsoftware.com

---
