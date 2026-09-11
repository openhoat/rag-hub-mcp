import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { extractText, isTextFile } from './extract.js'

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'rag-extract-'))
}

describe('extractText', () => {
  test('should read plain text files as-is', async () => {
    const dir = makeDir()
    const p = join(dir, 'a.txt')
    writeFileSync(p, 'hello rag', 'utf-8')
    expect(await extractText(p)).toBe('hello rag')
    rmSync(dir, { recursive: true, force: true })
  })

  test('should read markdown and code files', async () => {
    const dir = makeDir()
    const p = join(dir, 'doc.md')
    writeFileSync(p, '# Title', 'utf-8')
    expect(await extractText(p)).toBe('# Title')
    rmSync(dir, { recursive: true, force: true })
  })

  test('should return empty string for unsupported extensions', async () => {
    const dir = makeDir()
    const p = join(dir, 'binary.bin')
    writeFileSync(p, '\u0000\u0001\u0002')
    expect(await extractText(p)).toBe('')
    rmSync(dir, { recursive: true, force: true })
  })

  test('should return empty string for a corrupted or empty pdf', async () => {
    const dir = makeDir()
    const p = join(dir, 'broken.pdf')
    writeFileSync(p, 'not a pdf')
    expect(await extractText(p)).toBe('')
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
    const text = await extractText(p)
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
    const text = await extractText(p)
    expect(text).toContain('alpha')
    expect(text).toContain('beta')
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('isTextFile', () => {
  test('should classify text extensions', () => {
    expect(isTextFile('a.md')).toBe(true)
    expect(isTextFile('a.txt')).toBe(true)
    expect(isTextFile('a.json')).toBe(true)
  })

  test('should reject non-text extensions', () => {
    expect(isTextFile('a.pdf')).toBe(false)
    expect(isTextFile('a.docx')).toBe(false)
    expect(isTextFile('a.bin')).toBe(false)
  })
})
