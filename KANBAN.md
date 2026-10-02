# KANBAN

## Backlog

### #4 [FEAT] Open WebUI default tool model binding, per-user access via custom headers

- [ ] Implementation

### #7 [FEAT] File-based document list via posit/download hook in the watch flow

- [ ] Implementation

### #8 [FEAT] Open Notebook embedding provider pointing to `EMBEDDINGS_BASE_URL`

- [ ] Implementation

### #13 [PERF] Recherche O(N) en mémoire — pgvector inutilisé

- [ ] pousser le cosinus en SQL (`<=>` + index) côté Postgres
- [ ] réfléchir à un index ANN côté SQLite (ou borne + rerank)

### #14 [PERF] Ingestion sans borne de taille de fichier

- [ ] refuser/skipper au-delà d'un seuil configurable avant `readFileSync`/`hashFile`

### #16 [BUG] Rate-limit de création de session appliqué à tout `/mcp`

- [ ] distinguer la création (sans `Mcp-Session-Id`) du trafic des sessions existantes

### #18 [QA] Couverture faible du code critique

- [ ] `worker.ts` (~70 % : reste `stop`/`drain`/branches d'erreur, `worker.unit.test.ts` ajouté), `postgres/job-queue.ts` (~0 %), `db.ts` (~19 %) : poll/claim/retry/reclaimStale

### #19 [TECH] Dettes mineures

- [ ] image Docker : `npm prune --omit=dev` (devDeps embarqués aujourd'hui)
- [ ] `chunk.ts` : metadata construit deux fois, `headings` = dernier paragraphe du chunk
- [ ] race scan/worker sur job `processing` (lost-update auto-réparé mais incohérent)

### #20 [TECH] `createPgJobQueue` réimplémente `poolToDb` (adapter `Db` divergent)

- [ ] construire la queue via `poolToDb(new Pool(buildPoolConfig()))` au lieu de l'objet `Db` inline
- [ ] corriger `exec` (`splitStatements`) pour que `migrateSql` (2 statements) passe
- [ ] tester `job-queue` via `pgliteToDb` (même seam que le store)

## In Progress
