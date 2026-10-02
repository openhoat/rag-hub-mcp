import { describe, expect, test } from 'vitest'
import { sanitizeKbDir, sanitizeRelativePath } from './path.js'

const root = '/kb/root'

describe('sanitizeKbDir', () => {
  test('should resolve a kb under the root', () => {
    expect(sanitizeKbDir(root, 'docs')).toBe('/kb/root/docs')
    expect(sanitizeKbDir(root, 'team/docs')).toBe('/kb/root/team/docs')
    expect(sanitizeKbDir(root, 'a/../docs')).toBe('/kb/root/docs')
  })

  test('should reject a kb escaping the root', () => {
    expect(() => sanitizeKbDir(root, '..')).toThrow('invalid path')
    expect(() => sanitizeKbDir(root, '../evil')).toThrow('invalid path')
    expect(() => sanitizeKbDir(root, '../..')).toThrow('invalid path')
  })

  test('should reject the root itself as a kb name', () => {
    expect(() => sanitizeKbDir(root, '')).toThrow('invalid path')
    expect(() => sanitizeKbDir(root, '.')).toThrow('invalid path')
  })
})

describe('sanitizeRelativePath', () => {
  test('should resolve a nested path inside the kb', () => {
    expect(sanitizeRelativePath(root, 'docs', 'a/b.md')).toBe('/kb/root/docs/a/b.md')
  })

  test('should reject a relPath escaping the kb', () => {
    expect(() => sanitizeRelativePath(root, 'docs', '../outside.md')).toThrow('invalid path')
    expect(() => sanitizeRelativePath(root, 'docs', 'a/../../escape.md')).toThrow('invalid path')
    expect(() => sanitizeRelativePath(root, 'docs', '.')).toThrow('invalid path')
  })

  test('should reject a kb escaping the root', () => {
    expect(() => sanitizeRelativePath(root, '../..', 'etc/passwd')).toThrow('invalid path')
    expect(() => sanitizeRelativePath(root, '../evil', 'a.md')).toThrow('invalid path')
  })
})
