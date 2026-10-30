import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readStatus } from '../src/status.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  let prevMarker: string | undefined;
  let tempDirs: string[] = [];

  beforeEach(() => {
    prevMarker = process.env.LANE_MARKER;
  });

  afterEach(() => {
    if (prevMarker === undefined) delete process.env.LANE_MARKER;
    else process.env.LANE_MARKER = prevMarker;
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
    tempDirs = [];
  });

  // A temp runs dir with the given files (name -> content). `runs/` is read-only, so tests never write there.
  function runsWith(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'rig-status-'));
    tempDirs.push(dir);
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    return dir;
  }

  const line = (status: string) =>
    JSON.stringify({ at: '2026-10-29T01:00:00+01:00', job: 'lane/sync', status, owner: 'rook' });

  const boardFor = (runsDir: string) => createApp({ ...config, runsDir }).request('/');

  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links each night on disk to its digest, newest first, with ok / retry / fail counts', async () => {
    const runsDir = runsWith({
      '2026-10-28.jsonl': [line('ok'), line('retry'), line('fail')].join('\n') + '\n',
      '2026-10-29.jsonl': [line('ok'), line('ok')].join('\n') + '\n',
    });
    const res = await boardFor(runsDir);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('href="/digest/2026-10-29"');
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('ok 2 · retry 0 · fail 0');
    expect(html).toContain('ok 1 · retry 1 · fail 1');
    const order = [...html.matchAll(/href="\/digest\/(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
    expect(order).toEqual(['2026-10-29', '2026-10-28']);
  });

  it('counts valid events only: a bad line is not an event', async () => {
    const runsDir = runsWith({
      '2026-10-28.jsonl': [line('ok'), 'not json', line('fail')].join('\n') + '\n',
    });
    const html = await (await boardFor(runsDir)).text();
    expect(html).toContain('ok 1 · retry 0 · fail 1');
  });

  it('shows zero counts for an empty night, and still links it', async () => {
    const runsDir = runsWith({ '2026-10-28.jsonl': '' });
    const html = await (await boardFor(runsDir)).text();
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('ok 0 · retry 0 · fail 0');
  });

  it('keeps a night that cannot be read: linked, counts shown as —, page still 200', async () => {
    const runsDir = runsWith({ '2026-10-29.jsonl': line('ok') + '\n' });
    // A directory where the night's file should be: the reader throws, the board must not.
    mkdirSync(join(runsDir, '2026-10-28.jsonl'));
    const res = await boardFor(runsDir);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('href="/digest/2026-10-29"');
    expect(html).toContain('ok 1 · retry 0 · fail 0');
    expect(html).toContain('<span class="mute">—</span>');
  });

  it('ignores files that are not a night and says so when runs/ has none', async () => {
    const runsDir = runsWith({ 'notes.txt': 'hello', '2026-10-28.log': line('ok') });
    const html = await (await boardFor(runsDir)).text();
    expect(html).not.toContain('/digest/');
    expect(html).toContain('nothing in runs/');
  });

  it('readStatus keeps nights as the same string list and aligns counts to it', () => {
    const runsDir = runsWith({
      '2026-10-27.jsonl': line('retry') + '\n',
      '2026-10-28.jsonl': line('ok') + '\n' + line('fail') + '\n',
    });
    const status = readStatus({ ...config, runsDir });
    expect(status.nights).toEqual(['2026-10-28', '2026-10-27']);
    expect(status.nightCounts).toEqual([
      { night: '2026-10-28', counts: { ok: 1, retry: 0, fail: 1 } },
      { night: '2026-10-27', counts: { ok: 0, retry: 1, fail: 0 } },
    ]);
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
