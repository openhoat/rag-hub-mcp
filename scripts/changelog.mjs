import { writeFile } from 'node:fs/promises'
import { Writable } from 'node:stream'
import { ConventionalChangelog } from 'conventional-changelog'

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

// `releaseCount: 0` regenerates the WHOLE changelog from git tags, so the file
// is OVERWRITTEN — never prepended to its previous content. Prepending the full
// regeneration used to duplicate the entire history on every release.
const writable = new Writable({
  write(chunk, _encoding, callback) {
    newContent += chunk.toString()
    callback()
  },
  final(callback) {
    if (!newContent.trim()) {
      callback(new Error('conventional-changelog produced empty output; CHANGELOG.md left unchanged'))
      return
    }
    writeFile('CHANGELOG.md', newContent.replace(/^\n+/, ''))
      .then(() => callback())
      .catch(callback)
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
        // Always expose shortHash so the writer never renders `[undefined]`
        // links for non-conventional commits (e.g. plain "Revert ...").
        const enriched = typeof commit.hash === 'string' ? { ...commit, shortHash: commit.hash.substring(0, COMMIT_HASH_LENGTH) } : commit
        if (!commit.type || typeof commit.type !== 'string') return enriched
        const section = TYPE_SECTIONS[commit.type.toLowerCase()]
        return section ? { ...enriched, type: section } : enriched
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
