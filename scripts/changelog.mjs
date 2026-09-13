import { ConventionalChangelog } from 'conventional-changelog'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { Writable } from 'node:stream'

const TYPE_SECTIONS = {
  feat: 'Features',
  fix: 'Bug Fixes',
  test: 'Tests',
  docs: 'Documentation',
  chore: 'Chores',
  refactor: 'Refactoring',
  perf: 'Performance',
  style: 'Styling',
  ci: 'Continuous Integration',
  build: 'Build System',
  revert: 'Reverts',
}

const COMMIT_HASH_LENGTH = 7

let newContent = ''

const writable = new Writable({
  write(chunk, encoding, callback) {
    newContent += chunk.toString()
    callback()
  },
  final(callback) {
    if (existsSync('CHANGELOG.md')) {
      readFile('CHANGELOG.md', 'utf-8')
        .then(existingContent => {
          const updatedContent = newContent + existingContent
          return writeFile('CHANGELOG.md', updatedContent)
        })
        .then(() => callback())
        .catch(callback)
    } else {
      writeFile('CHANGELOG.md', newContent)
        .then(() => callback())
        .catch(callback)
    }
  },
})

const generator = new ConventionalChangelog()
generator
  .readPackage()
  .loadPreset('angular')
  .config({
    options: { releaseCount: 0 },
    writer: {
      transform: commit => {
        if (!commit.type || typeof commit.type !== 'string') return commit
        const type = commit.type.toLowerCase()
        const section = TYPE_SECTIONS[type]
        return {
          ...commit,
          ...(section ? { type: section } : {}),
          ...(typeof commit.hash === 'string'
            ? { shortHash: commit.hash.substring(0, COMMIT_HASH_LENGTH) }
            : {}),
        }
      },
    },
  })
  .writer({
    groupBy: 'type',
    commitGroupsSort: 'title',
    commitsSort: ['scope', 'subject'],
  })
  .writeStream()
  .pipe(writable)
