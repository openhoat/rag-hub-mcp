---
status: accepted
---

# Dual transport: stdio and HTTP

The same server is exposed over two transports: stdio (default — one MCP client,
no periodic scan, no REST) and HTTP (Fastify serving REST plus streamable-HTTP
MCP). stdio keeps the single-agent, local case dead simple; HTTP is for shared or
remote use, where the periodic scan loop and session management are needed. Both
mount the same tools and store, so behaviour diverges only in lifecycle.

## Consequences

- Only HTTP mode runs the periodic scan and the rate-limited session registry.
- `RAG_TRANSPORT` selects the mode; the store and tools are shared.
