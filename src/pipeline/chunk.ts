interface Chunk {
  content: string
  metadata: string
}

interface Paragraph {
  text: string
  headingPath: string
}

const MAX_CHARS = 3200
const OVERLAP_CHARS = 400

export const chunkText = (text: string, relPath: string, kb: string, frontmatter?: Record<string, string> | null): Chunk[] => {
  const paragraphs = splitParagraphs(text)
  const chunks: { content: string; metadata: string }[] = []
  let buffer: Paragraph[] = []
  let bufLen = 0

  for (const para of paragraphs) {
    if (bufLen + para.text.length > MAX_CHARS && buffer.length > 0) {
      chunks.push(buildChunk(buffer, relPath, kb))
      const overlap = drainOverlap(buffer, OVERLAP_CHARS)
      buffer = overlap
      bufLen = countChars(overlap)
    }
    buffer.push(para)
    bufLen += para.text.length + 1
  }

  if (buffer.length > 0) {
    chunks.push(buildChunk(buffer, relPath, kb))
  }

  if (chunks.length === 0) {
    return [{ content: '', metadata: metadataJson(kb, relPath, '', frontmatter, 0, 1) }]
  }

  return chunks.map((c, i) => ({
    content: c.content,
    metadata: metadataJson(kb, relPath, getHeadingPath(c), frontmatter, i, chunks.length),
  }))
}

const metadataJson = (
  kb: string,
  relPath: string,
  headings: string,
  frontmatter: Record<string, string> | null | undefined,
  chunkIndex: number,
  total: number,
): string => {
  const base: Record<string, unknown> = { kb, path: relPath, headings, chunkIndex, total }
  if (frontmatter && Object.keys(frontmatter).length > 0) base.frontmatter = frontmatter
  return JSON.stringify(base)
}

const getHeadingPath = (chunk: { content: string; metadata: string }): string => {
  try {
    return (JSON.parse(chunk.metadata) as { headings: string }).headings
  } catch {
    return ''
  }
}

const buildChunk = (lines: Paragraph[], relPath: string, kb: string) => {
  const content = lines.map(p => p.text).join('\n')
  return {
    content,
    metadata: JSON.stringify({ kb, path: relPath, headings: lines.at(-1)?.headingPath ?? '' }),
  }
}

const splitParagraphs = (text: string): Paragraph[] => {
  const headings: string[] = []
  const result: Paragraph[] = []

  for (const raw of text.split(/\n\n+/)) {
    const line = raw.trim()
    if (!line) continue

    const heading = headingRegex.exec(line)
    if (heading) {
      const level = heading[1].length
      headings[level - 1] = heading[2].trim()
      headings.length = level
      result.push({ text: line, headingPath: headings.filter(Boolean).join(' > ') })
      continue
    }

    result.push({ text: line, headingPath: headings.filter(Boolean).join(' > ') })
  }

  return result
}

const headingRegex = /^(#{1,6})[ \t]+(.+)/

const countChars = (lines: Paragraph[]): number => {
  return lines.reduce((s, l) => s + l.text.length + 1, 0)
}

const drainOverlap = (lines: Paragraph[], maxChars: number): Paragraph[] => {
  const result: Paragraph[] = []
  let len = 0
  for (let i = lines.length - 1; i >= 0 && len < maxChars; i--) {
    result.unshift(lines[i])
    len += lines[i].text.length + 1
  }
  return result
}
