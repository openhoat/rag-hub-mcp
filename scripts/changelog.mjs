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

// GitHub owner/repo names are alphanumeric with inner hyphens (no leading or
// trailing hyphen). Rejecting anything else drops false references parsed from
// prose like `#10-#19` (which yields repository "10-") while keeping real ones.
const GITHUB_IDENTIFIER = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/

const isValidReference = reference => {
  if (!reference.repository && !reference.owner) return true
  return (
    (!reference.repository || GITHUB_IDENTIFIER.test(reference.repository)) && (!reference.owner || GITHUB_IDENTIFIER.test(reference.owner))
  )
}

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
        const enriched = {
          ...commit,
          ...(typeof commit.hash === 'string' ? { shortHash: commit.hash.substring(0, COMMIT_HASH_LENGTH) } : {}),
          ...(Array.isArray(commit.references) ? { references: commit.references.filter(isValidReference) } : {}),
        }
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
