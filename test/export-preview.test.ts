import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportPreview } from '../scripts/export-preview.js';

let dir: string;
let savedMarker: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rig-preview-'));
  savedMarker = process.env.LANE_MARKER;
});

afterEach(async () => {
  if (savedMarker === undefined) delete process.env.LANE_MARKER;
  else process.env.LANE_MARKER = savedMarker;
  await rm(dir, { recursive: true, force: true });
});

describe('preview export', () => {
  it('saves the marked route with inline CSS and no client scripts', async () => {
    process.env.LANE_MARKER = 'PREVIEW-TEST-MARKER';
    const path = join(dir, 'site', 'index.html');
    await exportPreview(path);
    const html = await readFile(path, 'utf8');
    expect(html).toContain('PREVIEW-TEST-MARKER');
    expect(html).toContain('digest · 2026-10-28');
    expect(html).toContain('bad lines: 1');
    expect(html).toContain('<style>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<link');
  });

  it('can replace the same file with the marker unset', async () => {
    const path = join(dir, 'index.html');
    process.env.LANE_MARKER = 'PREVIEW-TEST-MARKER';
    await exportPreview(path);
    delete process.env.LANE_MARKER;
    await exportPreview(path);
    const html = await readFile(path, 'utf8');
    expect(html).toContain('no marker set');
    expect(html).not.toContain('PREVIEW-TEST-MARKER');
    expect(html).toContain('fixtures/refresh');
  });

  it('refuses to save a preview inside the repository', async () => {
    await expect(exportPreview('preview.html')).rejects.toThrow('outside the repository');
  });
});
