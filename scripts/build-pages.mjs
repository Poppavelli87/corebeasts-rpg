import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

const explicitBase = process.env.PAGES_BASE_PATH;
const repoFromGitHub = process.env.GITHUB_REPOSITORY?.split('/')[1];
const repoName = repoFromGitHub ?? pkg.name;
const basePath = explicitBase ?? `/${repoName}/`;

console.log(`Building GitHub Pages bundle with base path: ${basePath}`);
execSync('npm run typecheck', { cwd: repoRoot, stdio: 'inherit' });
execSync(`npx vite build --base=${basePath}`, { cwd: repoRoot, stdio: 'inherit' });
