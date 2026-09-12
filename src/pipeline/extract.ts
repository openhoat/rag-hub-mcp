import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

export const extractText = async (filePath: string): Promise<string> => {
  const ext = extname(filePath).toLowerCase()
  switch (ext) {
    case '.md':
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
      return readFileSync(filePath, 'utf-8')

    case '.pdf':
      return await extractPdf(filePath)

    case '.docx':
      return await extractDocx(filePath)

    case '.xlsx':
      return await extractXlsx(filePath)

    case '.pptx':
      return await extractPptx(filePath)

    default:
      return ''
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

const extractPdf = async (filePath: string): Promise<string> => {
  try {
    const parse = (await import('pdf-parse')).default || (await import('pdf-parse'))
    const buf = readFileSync(filePath)
    const data = await parse(buf)
    return data.text || ''
  } catch {
    return ''
  }
}

const extractDocx = async (filePath: string): Promise<string> => {
  try {
    const mammoth = await import('mammoth')
    const buf = readFileSync(filePath)
    const result = await mammoth.extractRawText({ buffer: buf })
    return result.value || ''
  } catch {
    return ''
  }
}

const extractXlsx = async (filePath: string): Promise<string> => {
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
    return lines.join('\n')
  } catch {
    return ''
  }
}

const extractPptx = async (filePath: string): Promise<string> => {
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
    return texts.join('\n\n')
  } catch {
    return ''
  }
}
