import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = process.cwd();
const releaseDir = path.join(repoRoot, 'release');
fs.mkdirSync(releaseDir, { recursive: true });

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const now = new Date().toISOString().slice(0, 10);

const runGit = (command) => {
  try {
    return execSync(command, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
};

const lastTag = runGit('git describe --tags --abbrev=0');
const range = lastTag ? `${lastTag}..HEAD` : 'HEAD~30..HEAD';
const log = runGit(`git log ${range} --pretty=format:%s`);
const commitLines = log
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const byPrefix = (prefixes) =>
  commitLines.filter((line) => prefixes.some((prefix) => line.toLowerCase().startsWith(prefix)));
const uncategorized = commitLines.filter(
  (line) =>
    !['feat', 'fix', 'docs', 'chore', 'refactor', 'perf', 'test'].some((prefix) =>
      line.toLowerCase().startsWith(prefix)
    )
);

const section = (title, lines) => {
  if (lines.length === 0) {
    return `## ${title}\n- (none)\n`;
  }
  return `## ${title}\n${lines.map((line) => `- ${line}`).join('\n')}\n`;
};

const notes = [
  `# Release Notes - v${pkg.version}`,
  '',
  `Date: ${now}`,
  '',
  lastTag ? `Range: ${lastTag}..HEAD` : 'Range: last 30 commits',
  '',
  section('Features', byPrefix(['feat'])).trimEnd(),
  '',
  section('Fixes', byPrefix(['fix'])).trimEnd(),
  '',
  section('Docs and Chores', [
    ...byPrefix(['docs', 'chore', 'refactor', 'perf', 'test']),
    ...uncategorized
  ]).trimEnd(),
  '',
  '## QA Checklist',
  '- [ ] npm run lint',
  '- [ ] npm run build',
  '- [ ] npm run zip:web',
  '- [ ] Smoke test title/new game/continue',
  ''
].join('\n');

const outputPath = path.join(releaseDir, `release-notes-v${pkg.version}.md`);
fs.writeFileSync(outputPath, notes, 'utf8');

console.log(`Wrote ${outputPath}`);
