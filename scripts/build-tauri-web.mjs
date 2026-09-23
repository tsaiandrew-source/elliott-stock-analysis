import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const distRoot = path.join(projectRoot, 'dist-tauri');

const copiedDirectories = ['assets', 'chart-surface', 'data-model'];
const copiedFiles = [
  'coverage-order.js',
  'manifest.webmanifest',
  'offline.html',
  'shared-menu.css',
  'shared-menu.js',
  'shared-topbar.css',
  'shared-topbar.js'
];

const appPages = [
  ['data-model/home.html', '../desktop/tauri-persistence.js', '../desktop/tauri-fresh-data.js'],
  ['data-model/coverage.html', '../desktop/tauri-persistence.js', '../desktop/tauri-fresh-data.js'],
  ['data-model/app.html', '../desktop/tauri-persistence.js', '../desktop/tauri-fresh-data.js'],
  ['chart-surface/index.html', '../desktop/tauri-persistence.js', '../desktop/tauri-fresh-data.js'],
  ['offline.html', './desktop/tauri-persistence.js', null]
];

const pwaRegistration = /\s*<script\b[^>]*\bsrc=["'][^"']*pwa-register(?:-v\d+)?\.js["'][^>]*><\/script>/gi;

async function copyRuntime() {
  await rm(distRoot, { recursive: true, force: true });
  await mkdir(distRoot, { recursive: true });

  await Promise.all(copiedDirectories.map((name) => (
    cp(path.join(projectRoot, name), path.join(distRoot, name), { recursive: true })
  )));
  await Promise.all(copiedFiles.map((name) => (
    cp(path.join(projectRoot, name), path.join(distRoot, name))
  )));
  await cp(path.join(projectRoot, 'desktop/index.html'), path.join(distRoot, 'index.html'));
}

async function bundleDesktopBridge() {
  await build({
    entryPoints: {
      'tauri-entry': path.join(projectRoot, 'desktop/tauri-entry.js'),
      'tauri-persistence': path.join(projectRoot, 'desktop/tauri-persistence.js'),
      'tauri-fresh-data': path.join(projectRoot, 'desktop/tauri-fresh-data.js')
    },
    bundle: true,
    entryNames: '[name]',
    format: 'iife',
    minify: true,
    outdir: path.join(distRoot, 'desktop'),
    platform: 'browser',
    target: ['safari13']
  });
}

async function preparePage(relativePath, scriptPath, freshDataPath) {
  const outputPath = path.join(distRoot, relativePath);
  const source = await readFile(outputPath, 'utf8');
  const freshData = freshDataPath ? `  <script src="${freshDataPath}"></script>\n` : '';
  const script = `${freshData}  <script src="${scriptPath}" defer></script>\n`;
  const staged = source.replace(pwaRegistration, '').replace('</head>', `${script}</head>`);
  await writeFile(outputPath, staged);
}

await copyRuntime();
await bundleDesktopBridge();
await Promise.all(appPages.map(([page, script, freshData]) => preparePage(page, script, freshData)));

console.log(`Staged Elliott+ desktop web assets in ${path.relative(projectRoot, distRoot)}/`);
