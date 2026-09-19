export default {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'shared-should-not-import-internal',
      comment: 'shared/ is the foundation layer — may not import any other domain',
      severity: 'error',
      from: { path: '^src/shared/', pathNot: '\\.test\\.ts$' },
      to: { path: '^src/(?!shared)', pathNot: '\\.test\\.ts$' },
    },
    {
      name: 'embeddings-should-not-import-internal',
      comment: 'embeddings/ may only import shared/',
      severity: 'error',
      from: { path: '^src/embeddings/', pathNot: '\\.test\\.ts$' },
      to: { path: '^src/', pathNot: '^src/(shared|embeddings/)' },
    },
    {
      name: 'storage-should-not-import-internal',
      comment: 'storage/ may only import shared/',
      severity: 'error',
      from: { path: '^src/storage/', pathNot: '\\.test\\.ts$' },
      to: { path: '^src/', pathNot: '^src/(shared|storage/)' },
    },
    {
      name: 'indexing-should-not-import-internal',
      comment: 'indexing/ may only import shared/ and embeddings/',
      severity: 'error',
      from: { path: '^src/indexing/', pathNot: '\\.test\\.ts$' },
      to: { path: '^src/', pathNot: '^src/(shared|embeddings|indexing/)' },
    },
    {
      name: 'search-should-not-import-internal',
      comment: 'search/ may only import shared/ and embeddings/',
      severity: 'error',
      from: { path: '^src/search/', pathNot: '\\.test\\.ts$' },
      to: { path: '^src/', pathNot: '^src/(shared|embeddings|search/)' },
    },
    {
      name: 'transport-should-not-import-internal',
      comment: 'transport/ may only import shared/, indexing/ and search/',
      severity: 'error',
      from: { path: '^src/transport/', pathNot: '\\.test\\.ts$' },
      to: { path: '^src/', pathNot: '^src/(shared|indexing|search|transport/)' },
    },
    {
      name: 'index-should-not-import-transport-only',
      comment: 'src/index.ts is the composition root — may import anything, but nothing should import it back',
      severity: 'error',
      from: { path: '^src/(?!index\\.ts)', pathNot: '\\.test\\.ts$' },
      to: { path: '^src/index\\.ts$' },
    },
    {
      name: 'prod-must-not-import-test',
      comment: 'Production code must not depend on test/',
      severity: 'error',
      from: { path: '^src/', pathNot: ['^src/test/', '\\.test\\.ts$'] },
      to: { path: '^src/test/' },
    },
  ],

  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
  },
}