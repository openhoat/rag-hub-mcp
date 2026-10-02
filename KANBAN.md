# KANBAN

## Backlog

### #4 [FEAT] Open WebUI default tool model binding, per-user access via custom headers

- [ ] Implementation

### #7 [FEAT] File-based document list via posit/download hook in the watch flow

- [ ] Implementation

### #8 [FEAT] Open Notebook embedding provider pointing to `EMBEDDINGS_BASE_URL`

- [ ] Implementation

### #10 [SECURITY] Path traversal via `kb` — lecture/écriture/suppression arbitraire

- [ ] valider `kb` contre `KB_ROOT` dans `sanitizeRelativePath` (comme le fait déjà `deleteKb`)
- [ ] déplacer `mkdirSync` APRÈS la validation dans `addDocument`
- [ ] ajouter des tests `kb='../..'` (addDocument/deleteDocument/readDocument)

### #11 [BUG] Pas de timeout sur les appels embeddings/LLM

- [ ] `AbortSignal.timeout` sur les `fetch` de `embed.ts` et `contextual-chunking.ts`
- [ ] rendre le fallback per-chunk réellement utile en cas de hang

### #12 [BUG] Concurrency worker = débit d'acquisition, pas un plafond

- [ ] plafonner réellement `inFlight.size < INDEXER_CONCURRENCY` dans `worker.ts`
- [ ] sinon un embedding lent peut monter à ~4×300 appels concurrents

### #13 [PERF] Recherche O(N) en mémoire — pgvector inutilisé

- [ ] pousser le cosinus en SQL (`<=>` + index) côté Postgres
- [ ] réfléchir à un index ANN côté SQLite (ou borne + rerank)

### #14 [PERF] Ingestion sans borne de taille de fichier

- [ ] refuser/skipper au-delà d'un seuil configurable avant `readFileSync`/`hashFile`

### #15 [BUG] Config incohérente

- [ ] `VERSION` = version de `package.json` (plus `1.3.0` codé en dur)
- [ ] intégrer `SEARCH_RATE_PER_MINUTE`/`REINDEX_RATE_PER_MINUTE` au schema zod (hors `process.env` aujourd'hui)

### #16 [BUG] Rate-limit de création de session appliqué à tout `/mcp`

- [ ] distinguer la création (sans `Mcp-Session-Id`) du trafic des sessions existantes

### #17 [PERF] Contextual chunking sans garde-fou

- [ ] limiter la concurrence des appels `/chat/completions` + timeout
- [ ] éviter le `Promise.all` sur tous les chunks d'un gros document

### #18 [QA] Couverture faible du code critique

- [ ] `worker.ts` (~5 %), `postgres/job-queue.ts` (~0 %), `db.ts` (~19 %) : poll/claim/retry/reclaimStale

### #19 [TECH] Dettes mineures

- [ ] image Docker : `npm prune --omit=dev` (devDeps embarqués aujourd'hui)
- [ ] `chunk.ts` : metadata construit deux fois, `headings` = dernier paragraphe du chunk
- [ ] race scan/worker sur job `processing` (lost-update auto-réparé mais incohérent)

### #20 [TECH] `createPgJobQueue` réimplémente `poolToDb` (adapter `Db` divergent)

- [ ] construire la queue via `poolToDb(new Pool(buildPoolConfig()))` au lieu de l'objet `Db` inline
- [ ] corriger `exec` (`splitStatements`) pour que `migrateSql` (2 statements) passe
- [ ] tester `job-queue` via `pgliteToDb` (même seam que le store)

## In Progress
