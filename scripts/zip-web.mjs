import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, 'dist');
const releaseDir = path.join(repoRoot, 'release');

if (!fs.existsSync(distDir)) {
  throw new Error('Missing dist folder. Run "npm run build:web" first.');
}

fs.mkdirSync(releaseDir, { recursive: true });

const packageJsonPath = path.join(repoRoot, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const zipPath = path.join(releaseDir, `corebeasts-web-v${pkg.version}.zip`);

if (fs.existsSync(zipPath)) {
  fs.rmSync(zipPath, { force: true });
}

const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

const done = new Promise((resolve, reject) => {
  output.on('close', resolve);
  output.on('error', reject);
  archive.on('error', reject);
});

archive.pipe(output);
archive.directory(distDir, false);
void archive.finalize();

await done;
console.log(`Created ${zipPath}`);
