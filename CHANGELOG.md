# [1.3.0](https://github.com/openhoat/rag-hub-mcp/compare/v1.2.1...v1.3.0) (2026-09-18)

### Bug Fixes

* reuse EMBEDDINGS_API_KEY for contextual chunking auth ([6f104e7](https://github.com/openhoat/rag-hub-mcp/commit/6f104e7cf8f3d2e4cd6b5500f6fd6bd7d55732fd))

### Documentation

* add markdownlint and fix README diagram for npm ([340e37f](https://github.com/openhoat/rag-hub-mcp/commit/340e37ff9d9a127491f848aca7e25a61e4a675eb))
* align markdown tables with prettier (IntelliJ-style padding) ([797ee40](https://github.com/openhoat/rag-hub-mcp/commit/797ee400da4dd4f38d9d834faba1849edf174211))
* clarify contextual chunking is transparent to the search path ([b92448c](https://github.com/openhoat/rag-hub-mcp/commit/b92448c807747f55691beaebe72366090fe5c33c))
* document contextual chunking configuration and self-contained rag_search queries ([bf48c5d](https://github.com/openhoat/rag-hub-mcp/commit/bf48c5dc438e563837626a897ea07fc4fc5dd281))

### Features

* add contextual chunking to improve search precision ([a77a5a1](https://github.com/openhoat/rag-hub-mcp/commit/a77a5a163783b6e449574650498f5658659a3af2))
* add force parameter to rag_reindex for full index rebuild ([5f732c7](https://github.com/openhoat/rag-hub-mcp/commit/5f732c738c3413df955a65af7b1554eaf70bce73))
* report excluded files on scan and self-heal null embeddings ([40dc2f6](https://github.com/openhoat/rag-hub-mcp/commit/40dc2f64223a589ad2980b94f3b581708e0a977d))

### Tests

* add e2e coverage for contextual chunking use case ([9017df6](https://github.com/openhoat/rag-hub-mcp/commit/9017df62075a14c5afb6d818259dbc5a5ca86e3a))

## [1.2.1](https://github.com/openhoat/rag-hub-mcp/compare/v1.0.0...v1.2.1) (2026-09-15)

### Bug Fixes

* normalize CRLF chunks and recover embeddings on batch failure ([b05adbf](https://github.com/openhoat/rag-hub-mcp/commit/b05adbf808c293838eb7722cf05b92618bf35a0c))
* resolve SonarQube issues and configure test sources ([803b477](https://github.com/openhoat/rag-hub-mcp/commit/803b477255f0abddb8ca66c00ddddf612b6a3058))

### Chores

* **release:** bump version to v1.1.0 ([b4dcc83](https://github.com/openhoat/rag-hub-mcp/commit/b4dcc834b6e4c0caa1b941cbfaa97f6427fb2957))
* **release:** bump version to v1.2.0 ([48d0f38](https://github.com/openhoat/rag-hub-mcp/commit/48d0f389fd0dac71b5239bf6e1b79106713e9720))
* **release:** bump version to v1.2.1 ([59af8e1](https://github.com/openhoat/rag-hub-mcp/commit/59af8e1fd037c2285c63704a2be2c7586c207ebf))
* remove completed .kt/.java task from KANBAN ([12b378b](https://github.com/openhoat/rag-hub-mcp/commit/12b378b4dd74d7735a195c00557739a0c9894cad))

### Continuous Integration

* build docker image for amd64 only and bump actions to Node 24 ([9b27d22](https://github.com/openhoat/rag-hub-mcp/commit/9b27d22d922e6c7f84d4a97fc78f7f726c873aa3))
* push docker image to op3n.cloud registry alongside ghcr.io ([f1b7482](https://github.com/openhoat/rag-hub-mcp/commit/f1b74823b0f9bdcb7841df02a721745c95601f65))

### Documentation

* add contributing guide and pull request template ([a495a9a](https://github.com/openhoat/rag-hub-mcp/commit/a495a9adddb0cfb756dc4b8387773897f834ab33))
* document how to estimate CHUNK_MAX_CHARS ([518b66f](https://github.com/openhoat/rag-hub-mcp/commit/518b66f162204108abff84a84a3950619001fdd5))
* translate architecture guide to English ([4d7a297](https://github.com/openhoat/rag-hub-mcp/commit/4d7a297f78a97c3c2a2621fc8a69a5f4779e7bd9))

### Features

* add .kt/.java support and magic bytes text detection ([28ad5d7](https://github.com/openhoat/rag-hub-mcp/commit/28ad5d75b22447d0ffbab1b0fdc0e9122f81731c)), closes [#8](https://github.com/openhoat/rag-hub-mcp/issues/8)

### Refactoring

* fix sonar findings in pgStore and extract ([f5b6f6f](https://github.com/openhoat/rag-hub-mcp/commit/f5b6f6f87ca2cc69eb8dacd376f7272a77c620bc))
* rename camelCase source files to kebab-case ([0ebd23e](https://github.com/openhoat/rag-hub-mcp/commit/0ebd23e7a0d37ec91d3f70f15416fd982be69fef))

### Tests

* boost coverage of index bootstrap, pgStore and main ([02e8fce](https://github.com/openhoat/rag-hub-mcp/commit/02e8fce275551f079e122b308781d3b267072bc6))
* restructure test dirs and include coverage in validate gate ([5fdcc5f](https://github.com/openhoat/rag-hub-mcp/commit/5fdcc5f34e0e5ec060ccc9e9201cbdd7d6e5e7c8))

# [1.0.0](https://github.com/openhoat/rag-hub-mcp/compare/v0.0.1...v1.0.0) (2026-09-13)

### Bug Fixes

* always run sonar scan under wireit ([227d9bf](https://github.com/openhoat/rag-hub-mcp/commit/227d9bfd5344f44df477bd0ff6bb518c1ceba80b))
* bind HTTP server to 0.0.0.0 and silence test logs ([573967a](https://github.com/openhoat/rag-hub-mcp/commit/573967a33feae7229ccfa73507ea06efc7f1fc58))
* bind HTTP server to 0.0.0.0 for reverse proxy access ([2eb4688](https://github.com/openhoat/rag-hub-mcp/commit/2eb468859ccf5675de50976c8d4c2b4bf12a3ff3))
* repair FTS5 indexing and add robustness fixes ([cdeb06e](https://github.com/openhoat/rag-hub-mcp/commit/cdeb06e919544d09b6e4e5b37d5e47e3a07ff75d))
* resolve sonar maintainability and regex issues ([6b76cbf](https://github.com/openhoat/rag-hub-mcp/commit/6b76cbf10027dc37b6441aae9cc450095f7081ec))
* route pdf.js console diagnostics through pino log level ([5c2d6aa](https://github.com/openhoat/rag-hub-mcp/commit/5c2d6aa0257381ea9a6ca83c65f604721f723e22))
* **security:** enforce path containment in addDocument and validate content ([c0c5dd6](https://github.com/openhoat/rag-hub-mcp/commit/c0c5dd6768fcbae2e2798c4e90fca9c9ce804f2d))
* **security:** fail fast when MCP_API_KEY is empty in HTTP mode ([87e156a](https://github.com/openhoat/rag-hub-mcp/commit/87e156aebdfa58fa09730d4d597bc7aaf3c40ae4))
* strip NUL bytes from extracted text for PostgreSQL ([066e300](https://github.com/openhoat/rag-hub-mcp/commit/066e300b1889fd1dc45c8230ba68d95ef595f089))
* upgrade better-sqlite3 to 12 to fix native teardown SIGABRT ([6217b6d](https://github.com/openhoat/rag-hub-mcp/commit/6217b6de952ec27e04e40cab1b9b870d7fa8bb4b))
* use nullish coalescing in preload and cover it ([88eba00](https://github.com/openhoat/rag-hub-mcp/commit/88eba0004086e4fa7047a23081d971c80c788e87))

### Chores

* add npm config and cache to gitignore ([2d0df55](https://github.com/openhoat/rag-hub-mcp/commit/2d0df559c58fcf5b00fc6b6e35f82df7b851b3d3))
* clean up kanban board and gitignore ([1129450](https://github.com/openhoat/rag-hub-mcp/commit/11294506df840f96172b2b423b79668df086cc30)), closes [#5](https://github.com/openhoat/rag-hub-mcp/issues/5) [#0](https://github.com/openhoat/rag-hub-mcp/issues/0)
* clean up kanban board and update changelog ([28f0c51](https://github.com/openhoat/rag-hub-mcp/commit/28f0c5112f82eb76e7a60dcc639fe3c1863f235d))
* orchestrate npm scripts with wireit ([9696c4f](https://github.com/openhoat/rag-hub-mcp/commit/9696c4f09c0585139253a55de57aac1055c20473))
* **release:** bump version to v1.0.0 ([3b01c86](https://github.com/openhoat/rag-hub-mcp/commit/3b01c8634527a57861ce71a762f613853faa1dc4))
* rename sonar project display name to Rag Hub Mcp ([b102a23](https://github.com/openhoat/rag-hub-mcp/commit/b102a23c7a920c4326a70cadabecf61a5eff7b7b))
* trim completed backlog items from kanban board ([987cdc9](https://github.com/openhoat/rag-hub-mcp/commit/987cdc9c5d297e4f707f82979b1ad5421c871847))

### Documentation

* rename project display title to Rag Hub MCP ([9bbbac4](https://github.com/openhoat/rag-hub-mcp/commit/9bbbac408b1e4c2d4cb09199fd365cc852380844))
* rewrite architecture guide, enrich README, add MCP inspector script ([febb5b3](https://github.com/openhoat/rag-hub-mcp/commit/febb5b3b98d3349ce5b63e3c6b53d5dfdbe0a1c2))
* update architecture guide from Express to Fastify ([60d9cb0](https://github.com/openhoat/rag-hub-mcp/commit/60d9cb0fd5e5779a32698a336635586495c7075f))

### Features

* add pluggable PostgreSQL backend with pgvector ([d125232](https://github.com/openhoat/rag-hub-mcp/commit/d12523210f591ab0bd9cc7ef0148212b498ec018))
* add rag_read tool and support multi-KB search filter ([f9f67f0](https://github.com/openhoat/rag-hub-mcp/commit/f9f67f082c9718fb9c938c66ede951dfaa5d3c07))
* extract markdown frontmatter and per-chunk section metadata ([3de8d03](https://github.com/openhoat/rag-hub-mcp/commit/3de8d03f7da86b9bd51ab71dadbe7f884d3d1267))
* **security:** add MCP session TTL/limits and HTTP rate limiting ([ac9c8b2](https://github.com/openhoat/rag-hub-mcp/commit/ac9c8b2b89ddffc3f18559312edee25d5be02d28))

### Refactoring

* centralize env config, move to pino, and tidy tooling ([fde58a0](https://github.com/openhoat/rag-hub-mcp/commit/fde58a0b4cfd0aaff365aa97324de04d7e12f24c))
* decouple PgStore from pg driver and test via PGlite ([b7a4f52](https://github.com/openhoat/rag-hub-mcp/commit/b7a4f52f9bf3a0e418a9395073ebff9e41c35fa1))
* extract handlers to pass strict sonar quality profile ([3c51ffa](https://github.com/openhoat/rag-hub-mcp/commit/3c51ffa427f29787135a65185cfa560276e2824a))
* make Store interface async and encapsulate db access ([a68d73d](https://github.com/openhoat/rag-hub-mcp/commit/a68d73df9d8550558d12a9ea1d7ce669227bd1ed))
* migrate REST and MCP HTTP layer from Express to Fastify ([a44ee8c](https://github.com/openhoat/rag-hub-mcp/commit/a44ee8c9baac01209535aa665a5bc8f88935a535))
* reorganize sources into layered modules and enforce TypeScript rules ([2b9670e](https://github.com/openhoat/rag-hub-mcp/commit/2b9670e813468c62a7ce0e471a731f662d684ebf))

### Tests

* cover store factory branches and reuse PGlite helper ([747cb47](https://github.com/openhoat/rag-hub-mcp/commit/747cb478763c53e7a97b84559157adecd9c333f9))
* split unit and e2e tests and raise coverage thresholds ([d67f149](https://github.com/openhoat/rag-hub-mcp/commit/d67f149c20c85bd72791fc3202926d12078dba7c))

## [0.0.1](https://github.com/openhoat/rag-hub-mcp/compare/50796060847b04ca03e5d70f0951df4f6762a335...v0.0.1) (2026-09-11)

### Features

* initial rag-hub-mcp implementation ([5079606](https://github.com/openhoat/rag-hub-mcp/commit/50796060847b04ca03e5d70f0951df4f6762a335))
# [1.2.1](https://github.com/openhoat/rag-hub-mcp/compare/v1.2.0...v1.2.1) (2026-09-15)

# [1.2.0](https://github.com/openhoat/rag-hub-mcp/compare/v1.0.0...v1.2.0) (2026-09-15)

### Bug Fixes

* normalize CRLF chunks and recover embeddings on batch failure ([b05adbf](https://github.com/openhoat/rag-hub-mcp/commit/b05adbf808c293838eb7722cf05b92618bf35a0c))
* resolve SonarQube issues and configure test sources ([803b477](https://github.com/openhoat/rag-hub-mcp/commit/803b477255f0abddb8ca66c00ddddf612b6a3058))

### Chores

* **release:** bump version to v1.1.0 ([b4dcc83](https://github.com/openhoat/rag-hub-mcp/commit/b4dcc834b6e4c0caa1b941cbfaa97f6427fb2957))
* **release:** bump version to v1.2.0 ([48d0f38](https://github.com/openhoat/rag-hub-mcp/commit/48d0f389fd0dac71b5239bf6e1b79106713e9720))
* remove completed .kt/.java task from KANBAN ([12b378b](https://github.com/openhoat/rag-hub-mcp/commit/12b378b4dd74d7735a195c00557739a0c9894cad))

### Continuous Integration

* build docker image for amd64 only and bump actions to Node 24 ([9b27d22](https://github.com/openhoat/rag-hub-mcp/commit/9b27d22d922e6c7f84d4a97fc78f7f726c873aa3))
* push docker image to op3n.cloud registry alongside ghcr.io ([f1b7482](https://github.com/openhoat/rag-hub-mcp/commit/f1b74823b0f9bdcb7841df02a721745c95601f65))

### Documentation

* add contributing guide and pull request template ([a495a9a](https://github.com/openhoat/rag-hub-mcp/commit/a495a9adddb0cfb756dc4b8387773897f834ab33))
* document how to estimate CHUNK_MAX_CHARS ([518b66f](https://github.com/openhoat/rag-hub-mcp/commit/518b66f162204108abff84a84a3950619001fdd5))
* translate architecture guide to English ([4d7a297](https://github.com/openhoat/rag-hub-mcp/commit/4d7a297f78a97c3c2a2621fc8a69a5f4779e7bd9))

### Features

* add .kt/.java support and magic bytes text detection ([28ad5d7](https://github.com/openhoat/rag-hub-mcp/commit/28ad5d75b22447d0ffbab1b0fdc0e9122f81731c)), closes [#8](https://github.com/openhoat/rag-hub-mcp/issues/8)

### Refactoring

* fix sonar findings in pgStore and extract ([f5b6f6f](https://github.com/openhoat/rag-hub-mcp/commit/f5b6f6f87ca2cc69eb8dacd376f7272a77c620bc))
* rename camelCase source files to kebab-case ([0ebd23e](https://github.com/openhoat/rag-hub-mcp/commit/0ebd23e7a0d37ec91d3f70f15416fd982be69fef))

### Tests

* boost coverage of index bootstrap, pgStore and main ([02e8fce](https://github.com/openhoat/rag-hub-mcp/commit/02e8fce275551f079e122b308781d3b267072bc6))
* restructure test dirs and include coverage in validate gate ([5fdcc5f](https://github.com/openhoat/rag-hub-mcp/commit/5fdcc5f34e0e5ec060ccc9e9201cbdd7d6e5e7c8))

# [1.0.0](https://github.com/openhoat/rag-hub-mcp/compare/v0.0.1...v1.0.0) (2026-09-13)

### Bug Fixes

* always run sonar scan under wireit ([227d9bf](https://github.com/openhoat/rag-hub-mcp/commit/227d9bfd5344f44df477bd0ff6bb518c1ceba80b))
* bind HTTP server to 0.0.0.0 and silence test logs ([573967a](https://github.com/openhoat/rag-hub-mcp/commit/573967a33feae7229ccfa73507ea06efc7f1fc58))
* bind HTTP server to 0.0.0.0 for reverse proxy access ([2eb4688](https://github.com/openhoat/rag-hub-mcp/commit/2eb468859ccf5675de50976c8d4c2b4bf12a3ff3))
* repair FTS5 indexing and add robustness fixes ([cdeb06e](https://github.com/openhoat/rag-hub-mcp/commit/cdeb06e919544d09b6e4e5b37d5e47e3a07ff75d))
* resolve sonar maintainability and regex issues ([6b76cbf](https://github.com/openhoat/rag-hub-mcp/commit/6b76cbf10027dc37b6441aae9cc450095f7081ec))
* route pdf.js console diagnostics through pino log level ([5c2d6aa](https://github.com/openhoat/rag-hub-mcp/commit/5c2d6aa0257381ea9a6ca83c65f604721f723e22))
* **security:** enforce path containment in addDocument and validate content ([c0c5dd6](https://github.com/openhoat/rag-hub-mcp/commit/c0c5dd6768fcbae2e2798c4e90fca9c9ce804f2d))
* **security:** fail fast when MCP_API_KEY is empty in HTTP mode ([87e156a](https://github.com/openhoat/rag-hub-mcp/commit/87e156aebdfa58fa09730d4d597bc7aaf3c40ae4))
* strip NUL bytes from extracted text for PostgreSQL ([066e300](https://github.com/openhoat/rag-hub-mcp/commit/066e300b1889fd1dc45c8230ba68d95ef595f089))
* upgrade better-sqlite3 to 12 to fix native teardown SIGABRT ([6217b6d](https://github.com/openhoat/rag-hub-mcp/commit/6217b6de952ec27e04e40cab1b9b870d7fa8bb4b))
* use nullish coalescing in preload and cover it ([88eba00](https://github.com/openhoat/rag-hub-mcp/commit/88eba0004086e4fa7047a23081d971c80c788e87))

### Chores

* add npm config and cache to gitignore ([2d0df55](https://github.com/openhoat/rag-hub-mcp/commit/2d0df559c58fcf5b00fc6b6e35f82df7b851b3d3))
* clean up kanban board and gitignore ([1129450](https://github.com/openhoat/rag-hub-mcp/commit/11294506df840f96172b2b423b79668df086cc30)), closes [#5](https://github.com/openhoat/rag-hub-mcp/issues/5) [#0](https://github.com/openhoat/rag-hub-mcp/issues/0)
* clean up kanban board and update changelog ([28f0c51](https://github.com/openhoat/rag-hub-mcp/commit/28f0c5112f82eb76e7a60dcc639fe3c1863f235d))
* orchestrate npm scripts with wireit ([9696c4f](https://github.com/openhoat/rag-hub-mcp/commit/9696c4f09c0585139253a55de57aac1055c20473))
* **release:** bump version to v1.0.0 ([3b01c86](https://github.com/openhoat/rag-hub-mcp/commit/3b01c8634527a57861ce71a762f613853faa1dc4))
* rename sonar project display name to Rag Hub Mcp ([b102a23](https://github.com/openhoat/rag-hub-mcp/commit/b102a23c7a920c4326a70cadabecf61a5eff7b7b))
* trim completed backlog items from kanban board ([987cdc9](https://github.com/openhoat/rag-hub-mcp/commit/987cdc9c5d297e4f707f82979b1ad5421c871847))

### Documentation

* rename project display title to Rag Hub MCP ([9bbbac4](https://github.com/openhoat/rag-hub-mcp/commit/9bbbac408b1e4c2d4cb09199fd365cc852380844))
* rewrite architecture guide, enrich README, add MCP inspector script ([febb5b3](https://github.com/openhoat/rag-hub-mcp/commit/febb5b3b98d3349ce5b63e3c6b53d5dfdbe0a1c2))
* update architecture guide from Express to Fastify ([60d9cb0](https://github.com/openhoat/rag-hub-mcp/commit/60d9cb0fd5e5779a32698a336635586495c7075f))

### Features

* add pluggable PostgreSQL backend with pgvector ([d125232](https://github.com/openhoat/rag-hub-mcp/commit/d12523210f591ab0bd9cc7ef0148212b498ec018))
* add rag_read tool and support multi-KB search filter ([f9f67f0](https://github.com/openhoat/rag-hub-mcp/commit/f9f67f082c9718fb9c938c66ede951dfaa5d3c07))
* extract markdown frontmatter and per-chunk section metadata ([3de8d03](https://github.com/openhoat/rag-hub-mcp/commit/3de8d03f7da86b9bd51ab71dadbe7f884d3d1267))
* **security:** add MCP session TTL/limits and HTTP rate limiting ([ac9c8b2](https://github.com/openhoat/rag-hub-mcp/commit/ac9c8b2b89ddffc3f18559312edee25d5be02d28))

### Refactoring

* centralize env config, move to pino, and tidy tooling ([fde58a0](https://github.com/openhoat/rag-hub-mcp/commit/fde58a0b4cfd0aaff365aa97324de04d7e12f24c))
* decouple PgStore from pg driver and test via PGlite ([b7a4f52](https://github.com/openhoat/rag-hub-mcp/commit/b7a4f52f9bf3a0e418a9395073ebff9e41c35fa1))
* extract handlers to pass strict sonar quality profile ([3c51ffa](https://github.com/openhoat/rag-hub-mcp/commit/3c51ffa427f29787135a65185cfa560276e2824a))
* make Store interface async and encapsulate db access ([a68d73d](https://github.com/openhoat/rag-hub-mcp/commit/a68d73df9d8550558d12a9ea1d7ce669227bd1ed))
* migrate REST and MCP HTTP layer from Express to Fastify ([a44ee8c](https://github.com/openhoat/rag-hub-mcp/commit/a44ee8c9baac01209535aa665a5bc8f88935a535))
* reorganize sources into layered modules and enforce TypeScript rules ([2b9670e](https://github.com/openhoat/rag-hub-mcp/commit/2b9670e813468c62a7ce0e471a731f662d684ebf))

### Tests

* cover store factory branches and reuse PGlite helper ([747cb47](https://github.com/openhoat/rag-hub-mcp/commit/747cb478763c53e7a97b84559157adecd9c333f9))
* split unit and e2e tests and raise coverage thresholds ([d67f149](https://github.com/openhoat/rag-hub-mcp/commit/d67f149c20c85bd72791fc3202926d12078dba7c))

## [0.0.1](https://github.com/openhoat/rag-hub-mcp/compare/50796060847b04ca03e5d70f0951df4f6762a335...v0.0.1) (2026-09-11)

### Features

* initial rag-hub-mcp implementation ([5079606](https://github.com/openhoat/rag-hub-mcp/commit/50796060847b04ca03e5d70f0951df4f6762a335))
# [1.2.0](https://github.com/openhoat/rag-hub-mcp/compare/v1.0.0...v1.2.0) (2026-09-15)

### Bug Fixes

* normalize CRLF chunks and recover embeddings on batch failure ([b05adbf](https://github.com/openhoat/rag-hub-mcp/commit/b05adbf808c293838eb7722cf05b92618bf35a0c))
* resolve SonarQube issues and configure test sources ([803b477](https://github.com/openhoat/rag-hub-mcp/commit/803b477255f0abddb8ca66c00ddddf612b6a3058))

### Chores

* **release:** bump version to v1.1.0 ([b4dcc83](https://github.com/openhoat/rag-hub-mcp/commit/b4dcc834b6e4c0caa1b941cbfaa97f6427fb2957))
* remove completed .kt/.java task from KANBAN ([12b378b](https://github.com/openhoat/rag-hub-mcp/commit/12b378b4dd74d7735a195c00557739a0c9894cad))

### Continuous Integration

* build docker image for amd64 only and bump actions to Node 24 ([9b27d22](https://github.com/openhoat/rag-hub-mcp/commit/9b27d22d922e6c7f84d4a97fc78f7f726c873aa3))
* push docker image to op3n.cloud registry alongside ghcr.io ([f1b7482](https://github.com/openhoat/rag-hub-mcp/commit/f1b74823b0f9bdcb7841df02a721745c95601f65))

### Documentation

* add contributing guide and pull request template ([a495a9a](https://github.com/openhoat/rag-hub-mcp/commit/a495a9adddb0cfb756dc4b8387773897f834ab33))
* document how to estimate CHUNK_MAX_CHARS ([518b66f](https://github.com/openhoat/rag-hub-mcp/commit/518b66f162204108abff84a84a3950619001fdd5))
* translate architecture guide to English ([4d7a297](https://github.com/openhoat/rag-hub-mcp/commit/4d7a297f78a97c3c2a2621fc8a69a5f4779e7bd9))

### Features

* add .kt/.java support and magic bytes text detection ([28ad5d7](https://github.com/openhoat/rag-hub-mcp/commit/28ad5d75b22447d0ffbab1b0fdc0e9122f81731c)), closes [#8](https://github.com/openhoat/rag-hub-mcp/issues/8)

### Refactoring

* fix sonar findings in pgStore and extract ([f5b6f6f](https://github.com/openhoat/rag-hub-mcp/commit/f5b6f6f87ca2cc69eb8dacd376f7272a77c620bc))
* rename camelCase source files to kebab-case ([0ebd23e](https://github.com/openhoat/rag-hub-mcp/commit/0ebd23e7a0d37ec91d3f70f15416fd982be69fef))

### Tests

* boost coverage of index bootstrap, pgStore and main ([02e8fce](https://github.com/openhoat/rag-hub-mcp/commit/02e8fce275551f079e122b308781d3b267072bc6))
* restructure test dirs and include coverage in validate gate ([5fdcc5f](https://github.com/openhoat/rag-hub-mcp/commit/5fdcc5f34e0e5ec060ccc9e9201cbdd7d6e5e7c8))

# [1.0.0](https://github.com/openhoat/rag-hub-mcp/compare/v0.0.1...v1.0.0) (2026-09-13)

### Bug Fixes

* always run sonar scan under wireit ([227d9bf](https://github.com/openhoat/rag-hub-mcp/commit/227d9bfd5344f44df477bd0ff6bb518c1ceba80b))
* bind HTTP server to 0.0.0.0 and silence test logs ([573967a](https://github.com/openhoat/rag-hub-mcp/commit/573967a33feae7229ccfa73507ea06efc7f1fc58))
* bind HTTP server to 0.0.0.0 for reverse proxy access ([2eb4688](https://github.com/openhoat/rag-hub-mcp/commit/2eb468859ccf5675de50976c8d4c2b4bf12a3ff3))
* repair FTS5 indexing and add robustness fixes ([cdeb06e](https://github.com/openhoat/rag-hub-mcp/commit/cdeb06e919544d09b6e4e5b37d5e47e3a07ff75d))
* resolve sonar maintainability and regex issues ([6b76cbf](https://github.com/openhoat/rag-hub-mcp/commit/6b76cbf10027dc37b6441aae9cc450095f7081ec))
* route pdf.js console diagnostics through pino log level ([5c2d6aa](https://github.com/openhoat/rag-hub-mcp/commit/5c2d6aa0257381ea9a6ca83c65f604721f723e22))
* **security:** enforce path containment in addDocument and validate content ([c0c5dd6](https://github.com/openhoat/rag-hub-mcp/commit/c0c5dd6768fcbae2e2798c4e90fca9c9ce804f2d))
* **security:** fail fast when MCP_API_KEY is empty in HTTP mode ([87e156a](https://github.com/openhoat/rag-hub-mcp/commit/87e156aebdfa58fa09730d4d597bc7aaf3c40ae4))
* strip NUL bytes from extracted text for PostgreSQL ([066e300](https://github.com/openhoat/rag-hub-mcp/commit/066e300b1889fd1dc45c8230ba68d95ef595f089))
* upgrade better-sqlite3 to 12 to fix native teardown SIGABRT ([6217b6d](https://github.com/openhoat/rag-hub-mcp/commit/6217b6de952ec27e04e40cab1b9b870d7fa8bb4b))
* use nullish coalescing in preload and cover it ([88eba00](https://github.com/openhoat/rag-hub-mcp/commit/88eba0004086e4fa7047a23081d971c80c788e87))

### Chores

* add npm config and cache to gitignore ([2d0df55](https://github.com/openhoat/rag-hub-mcp/commit/2d0df559c58fcf5b00fc6b6e35f82df7b851b3d3))
* clean up kanban board and gitignore ([1129450](https://github.com/openhoat/rag-hub-mcp/commit/11294506df840f96172b2b423b79668df086cc30)), closes [#5](https://github.com/openhoat/rag-hub-mcp/issues/5) [#0](https://github.com/openhoat/rag-hub-mcp/issues/0)
* clean up kanban board and update changelog ([28f0c51](https://github.com/openhoat/rag-hub-mcp/commit/28f0c5112f82eb76e7a60dcc639fe3c1863f235d))
* orchestrate npm scripts with wireit ([9696c4f](https://github.com/openhoat/rag-hub-mcp/commit/9696c4f09c0585139253a55de57aac1055c20473))
* **release:** bump version to v1.0.0 ([3b01c86](https://github.com/openhoat/rag-hub-mcp/commit/3b01c8634527a57861ce71a762f613853faa1dc4))
* rename sonar project display name to Rag Hub Mcp ([b102a23](https://github.com/openhoat/rag-hub-mcp/commit/b102a23c7a920c4326a70cadabecf61a5eff7b7b))
* trim completed backlog items from kanban board ([987cdc9](https://github.com/openhoat/rag-hub-mcp/commit/987cdc9c5d297e4f707f82979b1ad5421c871847))

### Documentation

* rename project display title to Rag Hub MCP ([9bbbac4](https://github.com/openhoat/rag-hub-mcp/commit/9bbbac408b1e4c2d4cb09199fd365cc852380844))
* rewrite architecture guide, enrich README, add MCP inspector script ([febb5b3](https://github.com/openhoat/rag-hub-mcp/commit/febb5b3b98d3349ce5b63e3c6b53d5dfdbe0a1c2))
* update architecture guide from Express to Fastify ([60d9cb0](https://github.com/openhoat/rag-hub-mcp/commit/60d9cb0fd5e5779a32698a336635586495c7075f))

### Features

* add pluggable PostgreSQL backend with pgvector ([d125232](https://github.com/openhoat/rag-hub-mcp/commit/d12523210f591ab0bd9cc7ef0148212b498ec018))
* add rag_read tool and support multi-KB search filter ([f9f67f0](https://github.com/openhoat/rag-hub-mcp/commit/f9f67f082c9718fb9c938c66ede951dfaa5d3c07))
* extract markdown frontmatter and per-chunk section metadata ([3de8d03](https://github.com/openhoat/rag-hub-mcp/commit/3de8d03f7da86b9bd51ab71dadbe7f884d3d1267))
* **security:** add MCP session TTL/limits and HTTP rate limiting ([ac9c8b2](https://github.com/openhoat/rag-hub-mcp/commit/ac9c8b2b89ddffc3f18559312edee25d5be02d28))

### Refactoring

* centralize env config, move to pino, and tidy tooling ([fde58a0](https://github.com/openhoat/rag-hub-mcp/commit/fde58a0b4cfd0aaff365aa97324de04d7e12f24c))
* decouple PgStore from pg driver and test via PGlite ([b7a4f52](https://github.com/openhoat/rag-hub-mcp/commit/b7a4f52f9bf3a0e418a9395073ebff9e41c35fa1))
* extract handlers to pass strict sonar quality profile ([3c51ffa](https://github.com/openhoat/rag-hub-mcp/commit/3c51ffa427f29787135a65185cfa560276e2824a))
* make Store interface async and encapsulate db access ([a68d73d](https://github.com/openhoat/rag-hub-mcp/commit/a68d73df9d8550558d12a9ea1d7ce669227bd1ed))
* migrate REST and MCP HTTP layer from Express to Fastify ([a44ee8c](https://github.com/openhoat/rag-hub-mcp/commit/a44ee8c9baac01209535aa665a5bc8f88935a535))
* reorganize sources into layered modules and enforce TypeScript rules ([2b9670e](https://github.com/openhoat/rag-hub-mcp/commit/2b9670e813468c62a7ce0e471a731f662d684ebf))

### Tests

* cover store factory branches and reuse PGlite helper ([747cb47](https://github.com/openhoat/rag-hub-mcp/commit/747cb478763c53e7a97b84559157adecd9c333f9))
* split unit and e2e tests and raise coverage thresholds ([d67f149](https://github.com/openhoat/rag-hub-mcp/commit/d67f149c20c85bd72791fc3202926d12078dba7c))

## [0.0.1](https://github.com/openhoat/rag-hub-mcp/compare/50796060847b04ca03e5d70f0951df4f6762a335...v0.0.1) (2026-09-11)

### Features

* initial rag-hub-mcp implementation ([5079606](https://github.com/openhoat/rag-hub-mcp/commit/50796060847b04ca03e5d70f0951df4f6762a335))
# [1.1.0](https://github.com/openhoat/rag-hub-mcp/compare/v1.0.0...v1.1.0) (2026-09-15)

### Bug Fixes

* normalize CRLF chunks and recover embeddings on batch failure ([b05adbf](https://github.com/openhoat/rag-hub-mcp/commit/b05adbf808c293838eb7722cf05b92618bf35a0c))
* resolve SonarQube issues and configure test sources ([803b477](https://github.com/openhoat/rag-hub-mcp/commit/803b477255f0abddb8ca66c00ddddf612b6a3058))

### Continuous Integration

* build docker image for amd64 only and bump actions to Node 24 ([9b27d22](https://github.com/openhoat/rag-hub-mcp/commit/9b27d22d922e6c7f84d4a97fc78f7f726c873aa3))
* push docker image to op3n.cloud registry alongside ghcr.io ([f1b7482](https://github.com/openhoat/rag-hub-mcp/commit/f1b74823b0f9bdcb7841df02a721745c95601f65))

### Documentation

* add contributing guide and pull request template ([a495a9a](https://github.com/openhoat/rag-hub-mcp/commit/a495a9adddb0cfb756dc4b8387773897f834ab33))
* document how to estimate CHUNK_MAX_CHARS ([518b66f](https://github.com/openhoat/rag-hub-mcp/commit/518b66f162204108abff84a84a3950619001fdd5))
* translate architecture guide to English ([4d7a297](https://github.com/openhoat/rag-hub-mcp/commit/4d7a297f78a97c3c2a2621fc8a69a5f4779e7bd9))

### Refactoring

* fix sonar findings in pgStore and extract ([f5b6f6f](https://github.com/openhoat/rag-hub-mcp/commit/f5b6f6f87ca2cc69eb8dacd376f7272a77c620bc))
* rename camelCase source files to kebab-case ([0ebd23e](https://github.com/openhoat/rag-hub-mcp/commit/0ebd23e7a0d37ec91d3f70f15416fd982be69fef))

### Tests

* boost coverage of index bootstrap, pgStore and main ([02e8fce](https://github.com/openhoat/rag-hub-mcp/commit/02e8fce275551f079e122b308781d3b267072bc6))
* restructure test dirs and include coverage in validate gate ([5fdcc5f](https://github.com/openhoat/rag-hub-mcp/commit/5fdcc5f34e0e5ec060ccc9e9201cbdd7d6e5e7c8))

# [1.0.0](https://github.com/openhoat/rag-hub-mcp/compare/v0.0.1...v1.0.0) (2026-09-13)

### Bug Fixes

* always run sonar scan under wireit ([227d9bf](https://github.com/openhoat/rag-hub-mcp/commit/227d9bfd5344f44df477bd0ff6bb518c1ceba80b))
* bind HTTP server to 0.0.0.0 and silence test logs ([573967a](https://github.com/openhoat/rag-hub-mcp/commit/573967a33feae7229ccfa73507ea06efc7f1fc58))
* bind HTTP server to 0.0.0.0 for reverse proxy access ([2eb4688](https://github.com/openhoat/rag-hub-mcp/commit/2eb468859ccf5675de50976c8d4c2b4bf12a3ff3))
* repair FTS5 indexing and add robustness fixes ([cdeb06e](https://github.com/openhoat/rag-hub-mcp/commit/cdeb06e919544d09b6e4e5b37d5e47e3a07ff75d))
* resolve sonar maintainability and regex issues ([6b76cbf](https://github.com/openhoat/rag-hub-mcp/commit/6b76cbf10027dc37b6441aae9cc450095f7081ec))
* route pdf.js console diagnostics through pino log level ([5c2d6aa](https://github.com/openhoat/rag-hub-mcp/commit/5c2d6aa0257381ea9a6ca83c65f604721f723e22))
* **security:** enforce path containment in addDocument and validate content ([c0c5dd6](https://github.com/openhoat/rag-hub-mcp/commit/c0c5dd6768fcbae2e2798c4e90fca9c9ce804f2d))
* **security:** fail fast when MCP_API_KEY is empty in HTTP mode ([87e156a](https://github.com/openhoat/rag-hub-mcp/commit/87e156aebdfa58fa09730d4d597bc7aaf3c40ae4))
* strip NUL bytes from extracted text for PostgreSQL ([066e300](https://github.com/openhoat/rag-hub-mcp/commit/066e300b1889fd1dc45c8230ba68d95ef595f089))
* upgrade better-sqlite3 to 12 to fix native teardown SIGABRT ([6217b6d](https://github.com/openhoat/rag-hub-mcp/commit/6217b6de952ec27e04e40cab1b9b870d7fa8bb4b))
* use nullish coalescing in preload and cover it ([88eba00](https://github.com/openhoat/rag-hub-mcp/commit/88eba0004086e4fa7047a23081d971c80c788e87))

### Chores

* add npm config and cache to gitignore ([2d0df55](https://github.com/openhoat/rag-hub-mcp/commit/2d0df559c58fcf5b00fc6b6e35f82df7b851b3d3))
* clean up kanban board and gitignore ([1129450](https://github.com/openhoat/rag-hub-mcp/commit/11294506df840f96172b2b423b79668df086cc30)), closes [#5](https://github.com/openhoat/rag-hub-mcp/issues/5) [#0](https://github.com/openhoat/rag-hub-mcp/issues/0)
* clean up kanban board and update changelog ([28f0c51](https://github.com/openhoat/rag-hub-mcp/commit/28f0c5112f82eb76e7a60dcc639fe3c1863f235d))
* orchestrate npm scripts with wireit ([9696c4f](https://github.com/openhoat/rag-hub-mcp/commit/9696c4f09c0585139253a55de57aac1055c20473))
* **release:** bump version to v1.0.0 ([3b01c86](https://github.com/openhoat/rag-hub-mcp/commit/3b01c8634527a57861ce71a762f613853faa1dc4))
* rename sonar project display name to Rag Hub Mcp ([b102a23](https://github.com/openhoat/rag-hub-mcp/commit/b102a23c7a920c4326a70cadabecf61a5eff7b7b))
* trim completed backlog items from kanban board ([987cdc9](https://github.com/openhoat/rag-hub-mcp/commit/987cdc9c5d297e4f707f82979b1ad5421c871847))

### Documentation

* rename project display title to Rag Hub MCP ([9bbbac4](https://github.com/openhoat/rag-hub-mcp/commit/9bbbac408b1e4c2d4cb09199fd365cc852380844))
* rewrite architecture guide, enrich README, add MCP inspector script ([febb5b3](https://github.com/openhoat/rag-hub-mcp/commit/febb5b3b98d3349ce5b63e3c6b53d5dfdbe0a1c2))
* update architecture guide from Express to Fastify ([60d9cb0](https://github.com/openhoat/rag-hub-mcp/commit/60d9cb0fd5e5779a32698a336635586495c7075f))

### Features

* add pluggable PostgreSQL backend with pgvector ([d125232](https://github.com/openhoat/rag-hub-mcp/commit/d12523210f591ab0bd9cc7ef0148212b498ec018))
* add rag_read tool and support multi-KB search filter ([f9f67f0](https://github.com/openhoat/rag-hub-mcp/commit/f9f67f082c9718fb9c938c66ede951dfaa5d3c07))
* extract markdown frontmatter and per-chunk section metadata ([3de8d03](https://github.com/openhoat/rag-hub-mcp/commit/3de8d03f7da86b9bd51ab71dadbe7f884d3d1267))
* **security:** add MCP session TTL/limits and HTTP rate limiting ([ac9c8b2](https://github.com/openhoat/rag-hub-mcp/commit/ac9c8b2b89ddffc3f18559312edee25d5be02d28))

### Refactoring

* centralize env config, move to pino, and tidy tooling ([fde58a0](https://github.com/openhoat/rag-hub-mcp/commit/fde58a0b4cfd0aaff365aa97324de04d7e12f24c))
* decouple PgStore from pg driver and test via PGlite ([b7a4f52](https://github.com/openhoat/rag-hub-mcp/commit/b7a4f52f9bf3a0e418a9395073ebff9e41c35fa1))
* extract handlers to pass strict sonar quality profile ([3c51ffa](https://github.com/openhoat/rag-hub-mcp/commit/3c51ffa427f29787135a65185cfa560276e2824a))
* make Store interface async and encapsulate db access ([a68d73d](https://github.com/openhoat/rag-hub-mcp/commit/a68d73df9d8550558d12a9ea1d7ce669227bd1ed))
* migrate REST and MCP HTTP layer from Express to Fastify ([a44ee8c](https://github.com/openhoat/rag-hub-mcp/commit/a44ee8c9baac01209535aa665a5bc8f88935a535))
* reorganize sources into layered modules and enforce TypeScript rules ([2b9670e](https://github.com/openhoat/rag-hub-mcp/commit/2b9670e813468c62a7ce0e471a731f662d684ebf))

### Tests

* cover store factory branches and reuse PGlite helper ([747cb47](https://github.com/openhoat/rag-hub-mcp/commit/747cb478763c53e7a97b84559157adecd9c333f9))
* split unit and e2e tests and raise coverage thresholds ([d67f149](https://github.com/openhoat/rag-hub-mcp/commit/d67f149c20c85bd72791fc3202926d12078dba7c))

## [0.0.1](https://github.com/openhoat/rag-hub-mcp/compare/50796060847b04ca03e5d70f0951df4f6762a335...v0.0.1) (2026-09-11)

### Features

* initial rag-hub-mcp implementation ([5079606](https://github.com/openhoat/rag-hub-mcp/commit/50796060847b04ca03e5d70f0951df4f6762a335))
