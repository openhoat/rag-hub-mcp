import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHANGELOG = 'CHANGELOG.md'
const TAG_PATTERN = /^#{1,2} \[(\d+\.\d+\.\d+)\]/

const parseChangelog = async () => {
  const content = await readFile(CHANGELOG, 'utf-8')
  const sections = new Map()
  let currentVersion = null
  let currentLines = []

  for (const line of content.split('\n')) {
    const match = line.match(TAG_PATTERN)
    if (match) {
      if (currentVersion && !sections.has(currentVersion)) {
        sections.set(currentVersion, currentLines.join('\n').trim())
      }
      currentVersion = match[1]
      currentLines = []
    } else if (currentVersion !== null) {
      currentLines.push(line)
    }
  }
  if (currentVersion && !sections.has(currentVersion)) {
    sections.set(currentVersion, currentLines.join('\n').trim())
  }
  return sections
}

const exec = cmd => execSync(cmd, { encoding: 'utf-8' }).trim()

const run = cmd => {
  try {
    return exec(cmd)
  } catch {
    return null
  }
}

const listTags = () =>
  exec('git tag -l --sort=version:refname')
    .split('\n')
    .filter(Boolean)
    .map(t => t.replace(/^v/, ''))

const listExistingReleases = () => {
  const out = exec('gh release list --json tagName --limit 1000')
  return new Set(JSON.parse(out).map(r => r.tagName.replace(/^v/, '')))
}

const createRelease = async (sections, version) => {
  const tag = `v${version}`
  const notes = sections.get(version)
  if (!notes) {
    console.warn(`?  No CHANGELOG section for ${tag}, skipping`)
    return
  }

  const notesFile = join(tmpdir(), `gh-release-notes-${randomUUID()}.md`)
  await writeFile(notesFile, notes)

  const result = run(`gh release create "${tag}" --title "${tag}" --notes-file "${notesFile}" --verify-tag`)
  if (result !== null) {
    console.log(`?  ${tag} created`)
  } else {
    console.warn(`?  ${tag}: skipped (already exists or error)`)
  }
  await unlink(notesFile).catch(() => {})
}

const handleCli = () => {
  const args = process.argv.slice(2)
  if (!args.includes('--backfill')) {
    console.error('Usage: node scripts/github-release.mjs --backfill')
    process.exit(1)
  }
}

const main = async () => {
  handleCli()
  const sections = await parseChangelog()
  const tags = listTags()
  const existing = listExistingReleases()
  const missing = tags.filter(v => !existing.has(v))

  console.log(`Tags: ${tags.length}, existing releases: ${existing.size}, missing: ${missing.length}`)

  for (const version of missing) {
    await createRelease(sections, version)
  }
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
