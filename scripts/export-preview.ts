import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from '../src/app.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

// A preview is an HTML copy of the real route, never a tracked source file (ADR 0003).
export async function exportPreview(output: string): Promise<void> {
  const target = resolve(output);
  const fromRepo = relative(repoRoot, target);
  if (!isAbsolute(fromRepo) && fromRepo !== '..' && !fromRepo.startsWith(`..${sep}`)) {
    throw new Error('Save previews outside the repository.');
  }
  const response = await createApp().request('/digest/2026-10-28');
  if (!response.ok) throw new Error(`Digest returned HTTP ${response.status}.`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await response.text(), 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: pnpm preview /path/outside/repository/index.html');
  await exportPreview(output);
  console.log('Saved the digest HTML copy outside the repository.');
}
