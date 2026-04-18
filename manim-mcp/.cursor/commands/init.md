Let's begin another development session for the Manim MCP chatbot application :D

This is the monorepo that will allow students at each level to easily graph functions, operations, comparisons, etc. -- using only natural language.

The full stack is comprised of four parts:
UI/Web Client (./web-client) -> MCP Client (./web-client/src/app/api/) -> MCP Server (./server/)

--

Web Client - handles user input prompt, styles, etc.

MCP Client - manages conversation and LLM calls to Anthropic, as well as the connection to the MCP server

MCP Server - contains the tutoring tools which leverage [ManimCommunity](https://docs.manim.community/en/stable/index.html), catalogged by curriculum. 

--