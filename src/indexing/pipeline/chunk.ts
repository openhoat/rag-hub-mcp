import { env } from '../../shared/config.js'

interface Chunk {
  content: string
  metadata: string
}

interface Paragraph {
  text: string
  headingPath: string
}

const OVERLAP_CHARS = 400

export const chunkText = (
  text: string,
  relPath: string,
  kb: string,
  frontmatter: Record<string, string> | null = null,
  maxChars: number = env.CHUNK_MAX_CHARS,
): Chunk[] => {
  const paragraphs = splitParagraphs(text, maxChars)
  const parts: { content: string; headings: string }[] = []
  let buffer: Paragraph[] = []
  let bufLen = 0

  // A chunk's heading context is the heading path of its last paragraph, i.e.
  // the deepest section heading the chunk sits under.
  const flush = (): void => {
    parts.push({
      content: buffer.map(p => p.text).join('\n'),
      headings: buffer.at(-1)?.headingPath ?? '',
    })
  }

  for (const para of paragraphs) {
    if (bufLen + para.text.length > maxChars && buffer.length > 0) {
      flush()
      const overlap = drainOverlap(buffer, OVERLAP_CHARS)
      buffer = overlap
      bufLen = countChars(overlap)
    }
    buffer.push(para)
    bufLen += para.text.length + 1
  }

  if (buffer.length > 0) flush()

  if (parts.length === 0) {
    return [{ content: '', metadata: metadataJson(kb, relPath, '', frontmatter, 0, 1) }]
  }

  return parts.map((part, i) => ({
    content: part.content,
    metadata: metadataJson(kb, relPath, part.headings, frontmatter, i, parts.length),
  }))
}

const metadataJson = (
  kb: string,
  relPath: string,
  headings: string,
  frontmatter: Record<string, string> | null,
  chunkIndex: number,
  total: number,
): string => {
  const base: Record<string, unknown> = { kb, path: relPath, headings, chunkIndex, total }
  if (frontmatter && Object.keys(frontmatter).length > 0) base.frontmatter = frontmatter
  return JSON.stringify(base)
}

const splitParagraphs = (text: string, maxChars: number): Paragraph[] => {
  const headings: string[] = []
  const result: Paragraph[] = []
  const normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')

  for (const raw of normalized.split(/\n\n+/)) {
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

    const headingPath = headings.filter(Boolean).join(' > ')
    for (const part of splitOversizedParagraph(line, maxChars)) {
      result.push({ text: part, headingPath })
    }
  }

  return result
}

/** Break a paragraph that alone exceeds maxChars into pieces, preferring a
 *  newline then a space boundary, so a single huge block (e.g. a PDF or a
 *  source file with no blank lines) can never become an oversized chunk. */
const splitOversizedParagraph = (text: string, maxChars: number): string[] => {
  if (text.length <= maxChars) return [text]
  const parts: string[] = []
  let rest = text
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf('\n', maxChars)
    if (cut <= 0) cut = rest.lastIndexOf(' ', maxChars)
    if (cut <= 0) cut = maxChars
    parts.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trimStart()
  }
  if (rest) parts.push(rest)
  return parts
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
