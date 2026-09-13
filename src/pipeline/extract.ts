import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { getLogger } from '../log.js'
import type { ExtractResult } from '../types.js'

const logger = getLogger('extract')

/** Strip NUL bytes, which PostgreSQL rejects in TEXT columns (SQLite tolerates them). */
const sanitizeText = (text: string): string => text.replace(/\0/g, '')

export const extractText = async (filePath: string): Promise<ExtractResult> => {
  const ext = extname(filePath).toLowerCase()
  const result = await extractByExt(ext, filePath)
  return { ...result, text: sanitizeText(result.text), frontmatter: result.frontmatter }
}

const extractByExt = async (ext: string, filePath: string): Promise<ExtractResult> => {
  switch (ext) {
    case '.md':
      return parseFrontmatter(readFileSync(filePath, 'utf-8'))

    case '.txt':
    case '.html':
    case '.htm':
    case '.css':
    case '.js':
    case '.ts':
    case '.jsx':
    case '.tsx':
    case '.py':
    case '.rb':
    case '.sh':
    case '.yaml':
    case '.yml':
    case '.json':
    case '.xml':
    case '.env':
    case '.csv':
      return { text: readFileSync(filePath, 'utf-8'), frontmatter: null }

    case '.pdf':
      return await extractPdf(filePath)

    case '.docx':
      return await extractDocx(filePath)

    case '.xlsx':
      return await extractXlsx(filePath)

    case '.pptx':
      return await extractPptx(filePath)

    default:
      return { text: '', frontmatter: null }
  }
}

export const TEXT_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.html',
  '.htm',
  '.css',
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.py',
  '.rb',
  '.sh',
  '.yaml',
  '.yml',
  '.json',
  '.xml',
  '.env',
  '.csv',
])

export const isTextFile = (filePath: string): boolean => {
  return TEXT_EXTENSIONS.has(extname(filePath).toLowerCase())
}

/**
 * pdf.js logs diagnostics via `console.log` in its worker, bypassing pino and
 * the configured log level. Re-route those lines through pino (which honors
 * LOG_LEVEL) while the extractor runs.
 */
const routePdfConsole = async <T>(fn: () => Promise<T>): Promise<T> => {
  const original = console.log
  console.log = (...args: unknown[]) => {
    const msg = args
      .map(a => (typeof a === 'string' ? a : String(a)))
      .join(' ')
      .replace(/^Warning:\s*/, '')
    if (msg.trim()) logger.warn(msg)
  }
  try {
    return await fn()
  } finally {
    console.log = original
  }
}

const extractPdf = async (filePath: string): Promise<ExtractResult> => {
  try {
    return await routePdfConsole(async () => {
      const parse = (await import('pdf-parse')).default || (await import('pdf-parse'))
      const buf = readFileSync(filePath)
      const data = await parse(buf)
      return { text: data.text || '', frontmatter: null }
    })
  } catch {
    return { text: '', frontmatter: null }
  }
}

const extractDocx = async (filePath: string): Promise<ExtractResult> => {
  try {
    const mammoth = await import('mammoth')
    const buf = readFileSync(filePath)
    const result = await mammoth.extractRawText({ buffer: buf })
    return { text: result.value || '', frontmatter: null }
  } catch {
    return { text: '', frontmatter: null }
  }
}

const extractXlsx = async (filePath: string): Promise<ExtractResult> => {
  try {
    const XLSX = await import('xlsx')
    const wb = XLSX.readFile(filePath)
    const lines: string[] = []
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name]
      const csv = XLSX.utils.sheet_to_csv(sheet)
      if (csv.trim()) {
        lines.push(`--- ${name} ---\n${csv}`)
      }
    }
    return { text: lines.join('\n'), frontmatter: null }
  } catch {
    return { text: '', frontmatter: null }
  }
}

const extractPptx = async (filePath: string): Promise<ExtractResult> => {
  try {
    const JSZip = (await import('jszip')).default
    const buf = readFileSync(filePath)
    const zip = await JSZip.loadAsync(buf)
    const textTagRegex = /<a:t[^>]*>([^<]*)<\/a:t>/
    const slides = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    const texts: string[] = []
    for (const name of slides) {
      const slide = zip.files[name]
      const xml = (await slide.async('string')).replaceAll('</a:t>', '</a:t>\u0000')
      const slideText = xml
        .split('\u0000')
        .map(seg => textTagRegex.exec(seg)?.[1])
        .filter((t?: string): t is string => Boolean(t?.trim()))
        .map(t => t.trim())
        .join(' ')
      if (slideText) texts.push(slideText)
    }
    return { text: texts.join('\n\n'), frontmatter: null }
  } catch {
    return { text: '', frontmatter: null }
  }
}

/**
 * Parse an optional YAML frontmatter block from the start of a markdown file.
 * Recognizes `key: value` pairs, quoted strings, and inline arrays `[a, b]`.
 * Returns the remaining text (frontmatter stripped) plus the parsed fields,
 * or the original text unchanged when no well-formed frontmatter is present.
 */
export const parseFrontmatter = (raw: string): ExtractResult => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw)
  if (!m) return { text: raw, frontmatter: null }

  const frontmatter: Record<string, string> = {}
  let valid = false
  let malformed = false
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w.-]+):([^\r\n]*)$/.exec(line)
    if (!kv) {
      if (line.trim()) malformed = true
      continue
    }
    valid = true
    frontmatter[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, '')
  }

  if (!valid || malformed) return { text: raw, frontmatter: null }
  return { text: raw.slice(m[0].length).replace(/^\r?\n+/, ''), frontmatter }
}
