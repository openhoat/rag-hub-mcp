import { join, relative } from 'node:path'

/**
 * Resolve a user-supplied relative path inside a knowledge base directory,
 * throwing when the resolved path escapes the KB root (path traversal).
 */
export const sanitizeRelativePath = (root: string, kb: string, relPath: string): string => {
  const kbDir = join(root, kb)
  const fullPath = join(kbDir, relPath)
  const normalized = relative(kbDir, fullPath)
  if (normalized === '' || normalized.startsWith('..')) throw new Error('invalid path')
  return fullPath
}
