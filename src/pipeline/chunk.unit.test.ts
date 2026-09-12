import { describe, expect, test } from 'vitest'
import { chunkText } from './chunk.js'

describe('chunkText', () => {
  test('should return a single empty chunk for empty text', () => {
    const chunks = chunkText('', 'a.md', 'kb')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('')
    const meta = JSON.parse(chunks[0].metadata)
    expect(meta.kb).toBe('kb')
    expect(meta.chunkIndex).toBe(0)
    expect(meta.total).toBe(1)
  })

  test('should chunk a long text into multiple chunks with metadata', () => {
    const paragraph = 'word '.repeat(400) // ~2000 chars
    const text = Array.from({ length: 4 }, () => paragraph).join('\n\n')
    const chunks = chunkText(text, 'docs/long.md', 'dev')
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      const meta = JSON.parse(chunk.metadata)
      expect(meta.kb).toBe('dev')
      expect(meta.path).toBe('docs/long.md')
      expect(meta.total).toBe(chunks.length)
    }
  })

  test('should carry heading path from the document', () => {
    const text = '# Title\n\n## Section\n\nSome content here.'
    const chunks = chunkText(text, 'h.md', 'kb')
    const meta = JSON.parse(chunks[0].metadata)
    expect(meta.headings).toBe('Title > Section')
  })

  test('should assign per-chunk heading context to each section', () => {
    // Each section is long enough to force its own chunks. Each chunk carries
    // the heading path of the section it belongs to, not one global heading.
    const paragraph = 'filler words for this section '.repeat(220) // ~4.6k chars, over MAX_CHARS
    const text = `# Intro\n\nIntro ${paragraph}\n\n# Install\n\nInstall ${paragraph}\n\n# Usage\n\nUsage ${paragraph}`
    const chunks = chunkText(text, 'sec.md', 'kb')
    const metas = chunks.map(c => JSON.parse(c.metadata))
    const headings = metas.map(m => m.headings)
    expect(metas.length).toBeGreaterThanOrEqual(3)
    expect(headings).toContain('Intro')
    expect(headings).toContain('Install')
    expect(headings).toContain('Usage')
    expect(new Set(headings).size).toBeGreaterThan(1)
  })

  test('should include frontmatter metadata in every chunk', () => {
    const text = '# Title\n\nSome body content here.'
    const chunks = chunkText(text, 'fm.md', 'kb', { title: 'Doc', author: 'Olivier' })
    for (const chunk of chunks) {
      const meta = JSON.parse(chunk.metadata)
      expect(meta.frontmatter).toEqual({ title: 'Doc', author: 'Olivier' })
    }
  })

  test('should omit frontmatter from metadata when absent', () => {
    const text = '# Title\n\nBody.'
    const meta = JSON.parse(chunkText(text, 'nf.md', 'kb')[0].metadata)
    expect(meta.frontmatter).toBeUndefined()
  })

  test('should produce overlapping chunks for continuity', () => {
    const paragraph = 'filler words that repeat '.repeat(200) // ~4.7k chars
    const text = Array.from({ length: 6 }, () => paragraph).join('\n\n')
    const chunks = chunkText(text, 'o.md', 'kb')
    expect(chunks.length).toBeGreaterThan(1)
    for (let i = 1; i < chunks.length; i++) {
      const prevContent = chunks[i - 1].content
      const curContent = chunks[i].content
      const overlap = prevContent
        .split('\n')
        .filter(line => line.length > 0)
        .some(line => curContent.includes(line))
      expect(overlap).toBe(true)
    }
  })
})
