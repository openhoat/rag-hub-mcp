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
