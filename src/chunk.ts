interface Chunk {
  content: string
  metadata: string
}

const MAX_CHARS = 3200
const OVERLAP_CHARS = 400

export function chunkText(text: string, relPath: string, kb: string): Chunk[] {
  const headingPath = extractHeadingPath(text)
  const paragraphs = splitParagraphs(text)
  const chunks: { content: string; metadata: string }[] = []
  let buffer: string[] = []
  let bufLen = 0

  for (const para of paragraphs) {
    if (bufLen + para.length > MAX_CHARS && buffer.length > 0) {
      chunks.push(buildChunk(buffer, relPath, kb, headingPath))
      const overlap = drainOverlap(buffer, OVERLAP_CHARS)
      buffer = overlap
      bufLen = countChars(overlap)
    }
    buffer.push(para)
    bufLen += para.length + 1
  }

  if (buffer.length > 0) {
    chunks.push(buildChunk(buffer, relPath, kb, headingPath))
  }

  if (chunks.length === 0) {
    const meta = JSON.stringify({ kb, path: relPath, headings: '', chunkIndex: 0, total: 1 })
    return [{ content: '', metadata: meta }]
  }

  return chunks.map((c, i) => ({
    content: c.content,
    metadata: JSON.stringify({ ...JSON.parse(c.metadata), chunkIndex: i, total: chunks.length }),
  }))
}

function buildChunk(lines: string[], relPath: string, kb: string, headingPath: string) {
  const content = lines.join('\n')
  return {
    content,
    metadata: JSON.stringify({ kb, path: relPath, headings: headingPath }),
  }
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

const headingRegex = /^(#{1,6})[ \t]+(.+)/

function extractHeadingPath(text: string): string {
  const lines = text.split('\n')
  const headings: string[] = []
  for (const line of lines) {
    const m = headingRegex.exec(line)
    if (m) {
      const level = m[1].length
      headings[level - 1] = m[2].trim()
      headings.length = level
    }
  }
  return headings.filter(Boolean).join(' > ')
}

function countChars(lines: string[]): number {
  return lines.reduce((s, l) => s + l.length + 1, 0)
}

function drainOverlap(lines: string[], maxChars: number): string[] {
  const result: string[] = []
  let len = 0
  for (let i = lines.length - 1; i >= 0 && len < maxChars; i--) {
    result.unshift(lines[i])
    len += lines[i].length + 1
  }
  return result
}
