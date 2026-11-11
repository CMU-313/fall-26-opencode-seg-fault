import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

// Minimal stdio MCP server for the learning-mode properties. It offers no tools;
// its only job is to send the instructions given as its argument, so that model
// requests contain an <mcp_instructions> block next to the learning-mode prompt.
const instructions = process.argv[2]
if (!instructions) throw new Error("usage: learning-mode.mcp-server.ts <instructions>")

const server = new Server({ name: "learning-mode-guide", version: "1.0.0" }, { capabilities: {}, instructions })
await server.connect(new StdioServerTransport())
