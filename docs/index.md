---
layout: home

hero:
  name: Rag Hub MCP
  text: Self-hosted RAG that speaks MCP
  tagline: Drop folders on disk, get a searchable knowledge base served to any MCP-compatible agent or over REST. Zero infrastructure.
  image:
    src: /logo.svg
    alt: rag-hub-mcp
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: GitHub
      link: https://github.com/openhoat/rag-hub-mcp

features:
  - title: Folders are knowledge bases
    details: 1st-level folder = 1 KB, named after the folder. Drop documents, let indexing pick them up.
  - title: MCP-native
    details: 9 tools over the Model Context Protocol. Works with opencode, Claude Code, Cline and more.
  - title: Hybrid search
    details: Vector cosine similarity fused with SQLite FTS5 keyword search, weighted and scored per chunk.
  - title: Multi-format
    details: Markdown, text, HTML, code, PDF, DOCX, XLSX, PPTX — extracted to plain text.
  - title: Self-hosted & private
    details: Your documents never leave your machine. Embeddings come from an OpenAI-compatible endpoint you control.
  - title: Zero infrastructure
    details: One SQLite database with FTS5. No vector database, no separate services, no server to keep running.
---
