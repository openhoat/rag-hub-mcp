# Rag Hub MCP

Self-hosted RAG that turns folders on disk into searchable knowledge bases
served to MCP clients and over REST.

## Language

**Knowledge base (KB)**:
A first-level folder under the root directory; its documents are what gets
indexed and searched.
_Avoid_: collection, corpus, index

**Document**:
A single file inside a KB, addressed by its path relative to the KB root.
_Avoid_: file, item

**Chunk**:
A contiguous slice of a document's extracted text; the unit that is embedded and
searched.
_Avoid_: fragment, passage, segment

**Embedding**:
A numeric vector representing a chunk's meaning, produced by an
OpenAI-compatible endpoint.
_Avoid_: feature

**Hybrid search**:
A query answered by fusing vector similarity with keyword relevance.
_Avoid_: semantic search, full-text search

**Contextual chunking**:
An optional step that prepends a short LLM-generated context to each chunk
before embedding.
_Avoid_: enrichment, augmentation
