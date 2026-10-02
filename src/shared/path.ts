import { join, relative } from 'node:path'

const assertInside = (base: string, target: string): void => {
  const normalized = relative(base, target)
  if (normalized === '' || normalized.startsWith('..')) throw new Error('invalid path')
}

/**
 * Resolve a user-supplied knowledge base directory under `root`, throwing when
 * the KB name escapes the root (e.g. `../..`). The root itself is not a valid
 * KB name.
 */
export const sanitizeKbDir = (root: string, kb: string): string => {
  const kbDir = join(root, kb)
  assertInside(root, kbDir)
  return kbDir
}

/**
 * Resolve a user-supplied relative path inside a knowledge base directory,
 * throwing when either the KB name or the relative path escapes the KB root
 * (path traversal).
 */
export const sanitizeRelativePath = (root: string, kb: string, relPath: string): string => {
  const kbDir = sanitizeKbDir(root, kb)
  const fullPath = join(kbDir, relPath)
  assertInside(kbDir, fullPath)
  return fullPath
}
