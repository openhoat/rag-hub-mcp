import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { extractText, isTextFile, parseFrontmatter } from './extract.js'

const makeDir = (): string => {
  return mkdtempSync(join(tmpdir(), 'rag-extract-'))
}

describe('extractText', () => {
  test('should read plain text files as-is', async () => {
    const dir = makeDir()
    const p = join(dir, 'a.txt')
    writeFileSync(p, 'hello rag', 'utf-8')
    const { text, frontmatter } = await extractText(p)
    expect(text).toBe('hello rag')
    expect(frontmatter).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  test('should strip NUL bytes from extracted text', async () => {
    const dir = makeDir()
    const p = join(dir, 'nul.txt')
    writeFileSync(p, 'hello\u0000world', 'utf-8')
    const { text } = await extractText(p)
    expect(text).toBe('helloworld')
    rmSync(dir, { recursive: true, force: true })
  })

  test('should normalize CRLF line endings to LF', async () => {
    const dir = makeDir()
    const p = join(dir, 'crlf.md')
    writeFileSync(p, '# Title\r\n\r\nFirst paragraph\r\n\r\nSecond paragraph\r\n', 'utf-8')
    const { text } = await extractText(p)
    expect(text).not.toContain('\r')
    expect(text).toBe('# Title\n\nFirst paragraph\n\nSecond paragraph\n')
    rmSync(dir, { recursive: true, force: true })
  })

  test('should normalize bare CR line endings to LF', async () => {
    const dir = makeDir()
    const p = join(dir, 'cr-only.txt')
    writeFileSync(p, 'line one\rline two\r', 'utf-8')
    const { text } = await extractText(p)
    expect(text).not.toContain('\r')
    expect(text).toBe('line one\nline two\n')
    rmSync(dir, { recursive: true, force: true })
  })

  test('should read markdown and code files', async () => {
    const dir = makeDir()
    const p = join(dir, 'doc.md')
    writeFileSync(p, '# Title', 'utf-8')
    expect((await extractText(p)).text).toBe('# Title')
    rmSync(dir, { recursive: true, force: true })
  })

  test('should extract Kotlin files as text', async () => {
    const dir = makeDir()
    const p = join(dir, 'Main.kt')
    writeFileSync(p, 'class Main {\n  fun main() = "hello"\n}', 'utf-8')
    const { text } = await extractText(p)
    expect(text).toContain('fun main')
    expect(text).toContain('hello')
    rmSync(dir, { recursive: true, force: true })
  })

  test('should extract Java files as text', async () => {
    const dir = makeDir()
    const p = join(dir, 'Main.java')
    writeFileSync(p, 'public class Main {\n  public static void main(String[] args) {}\n}', 'utf-8')
    const { text } = await extractText(p)
    expect(text).toContain('public static void main')
    rmSync(dir, { recursive: true, force: true })
  })

  test('should extract text from an unknown extension via magic bytes', async () => {
    const dir = makeDir()
    const p = join(dir, 'Main.swift')
    writeFileSync(p, 'func greet() { print("hello") }', 'utf-8')
    const { text } = await extractText(p)
    expect(text).toContain('func greet')
    rmSync(dir, { recursive: true, force: true })
  })

  test('should reject binary content with an unknown extension', async () => {
    const dir = makeDir()
    const p = join(dir, 'data.bin')
    writeFileSync(p, Buffer.from([0x00, 0x01, 0x02, 0xff, 0x00]))
    const { text } = await extractText(p)
    expect(text).toBe('')
    rmSync(dir, { recursive: true, force: true })
  })

  test('should return empty string for unsupported extensions', async () => {
    const dir = makeDir()
    const p = join(dir, 'binary.bin')
    writeFileSync(p, '\u0000\u0001\u0002')
    expect((await extractText(p)).text).toBe('')
    rmSync(dir, { recursive: true, force: true })
  })

  test('should return empty string for a corrupted or empty pdf', async () => {
    const dir = makeDir()
    const p = join(dir, 'broken.pdf')
    writeFileSync(p, 'not a pdf')
    expect((await extractText(p)).text).toBe('')
    rmSync(dir, { recursive: true, force: true })
  })

  test('should extract text from a real pptx archive', async () => {
    const dir = makeDir()
    const p = join(dir, 'slides.pptx')
    const JSZip = (await import('jszip')).default
    const slide1 = JSZip()
    slide1.file('ppt/slides/slide1.xml', '<a:t>Hello</a:t> <a:t>World</a:t>')
    slide1.file('ppt/slides/slide2.xml', '<a:t>Second</a:t>')
    const buf = await slide1.generateAsync({ type: 'nodebuffer' })
    writeFileSync(p, buf)
    const text = (await extractText(p)).text
    expect(text).toContain('Hello')
    expect(text).toContain('World')
    expect(text).toContain('Second')
    rmSync(dir, { recursive: true, force: true })
  })

  test('should extract text from a real xlsx archive', async () => {
    const dir = makeDir()
    const p = join(dir, 'sheet.xlsx')
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        [1, 'alpha'],
        [2, 'beta'],
      ]),
      'data',
    )
    XLSX.writeFile(wb, p)
    const text = (await extractText(p)).text
    expect(text).toContain('alpha')
    expect(text).toContain('beta')
    rmSync(dir, { recursive: true, force: true })
  })

  test('should strip frontmatter from markdown and return it as metadata', async () => {
    const dir = makeDir()
    const p = join(dir, 'fm.md')
    writeFileSync(p, '---\ntitle: README\nauthor: Olivier\nstatus: draft\n---\n\n# Body\n\ncontent here', 'utf-8')
    const { text, frontmatter } = await extractText(p)
    expect(text).toContain('# Body')
    expect(text).toContain('content here')
    expect(text).not.toContain('title: README')
    expect(frontmatter).toEqual({ title: 'README', author: 'Olivier', status: 'draft' })
    rmSync(dir, { recursive: true, force: true })
  })

  test('should handle quoted frontmatter values', async () => {
    const dir = makeDir()
    const p = join(dir, 'quoted.md')
    writeFileSync(p, '---\nsubject: "A "quoted" title"\n---\n\nText.', 'utf-8')
    const { text, frontmatter } = await extractText(p)
    expect(text).toBe('Text.')
    expect(frontmatter).toEqual({ subject: 'A "quoted" title' })
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('parseFrontmatter', () => {
  test('should return null frontmatter when none is present', () => {
    expect(parseFrontmatter('# just a title\n\ntext')).toEqual({ text: '# just a title\n\ntext', frontmatter: null })
  })

  test('should treat malformed frontmatter as plain text', () => {
    const raw = '---\nnot a key value line\n---\n\nbody'
    const { text, frontmatter } = parseFrontmatter(raw)
    expect(frontmatter).toBeNull()
    expect(text).toBe(raw)
  })

  test('should parse key value pairs and strip the delimiters', () => {
    const { text, frontmatter } = parseFrontmatter('---\ntitle: Hello\n---\n\nContent')
    expect(text).toBe('Content')
    expect(frontmatter).toEqual({ title: 'Hello' })
  })

  test('should strip trailing quotes from values', () => {
    const { frontmatter } = parseFrontmatter("---\ntitle: 'Single'\ntags: 'a, b'\n---\n\nx")
    expect(frontmatter).toEqual({ title: 'Single', tags: 'a, b' })
  })
})

describe('isTextFile', () => {
  test('should classify text extensions', () => {
    expect(isTextFile('a.md')).toBe(true)
    expect(isTextFile('a.txt')).toBe(true)
    expect(isTextFile('a.json')).toBe(true)
    expect(isTextFile('a.kt')).toBe(true)
    expect(isTextFile('a.java')).toBe(true)
  })

  test('should reject non-text extensions', () => {
    expect(isTextFile('a.pdf')).toBe(false)
    expect(isTextFile('a.docx')).toBe(false)
    expect(isTextFile('a.bin')).toBe(false)
  })
})
