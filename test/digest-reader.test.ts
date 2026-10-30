import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { digestText, isNight, parseLine, readNight } from '../src/digest/read-night.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function nightDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmp, 'runs-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

describe('readNight on the real night (runs/ is read-only)', () => {
  const digest = readNight('runs', '2026-10-28');

  it('has 5 jobs, sorted by job, and 1 bad line', () => {
    expect(digest).not.toBeNull();
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('aggregates each job into one row, offsets kept verbatim', () => {
    const row = (job: string) => digest?.rows.find((r) => r.job === job);
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(row('lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
    expect(row('notes/backup')).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(row('rig/rotate-logs')).toMatchObject({ runs: 1, lastStatus: 'ok', lastError: null });
  });

  it('keeps a row whose owner is null', () => {
    expect(digest?.rows.find((r) => r.job === 'digest/render')).toMatchObject({ owner: null, runs: 1 });
  });

  it('counts events by status', () => {
    expect(digest?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });
});

describe('readNight edges', () => {
  it('returns null for a night with no file, and for a missing runs dir', () => {
    const dir = nightDir({});
    expect(readNight(dir, '2026-10-01')).toBeNull();
    expect(readNight(join(dir, 'nope'), '2026-10-01')).toBeNull();
  });

  it('reads an empty file as a valid empty night', () => {
    const dir = nightDir({ '2026-10-02.jsonl': '' });
    expect(readNight(dir, '2026-10-02')).toEqual({ rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('rejects invalid nights before touching the disk (no path traversal)', () => {
    const dir = nightDir({ 'secret.jsonl': '{"at":"2026-10-28T23:00:00+01:00","job":"x","status":"ok","owner":null}\n' });
    mkdirSync(join(dir, 'sub'));
    for (const night of ['../secret', 'sub/../secret', 'secret', '2026-10-28.jsonl', '2026-13-01', '2026-02-30', '', '2026-1-1', ' 2026-10-28']) {
      expect(readNight(join(dir, 'sub'), night)).toBeNull();
    }
    expect(isNight('2024-02-29')).toBe(true);
  });

  it('throws other I/O errors instead of pretending the night is missing', () => {
    const dir = nightDir({});
    mkdirSync(join(dir, '2026-10-03.jsonl'));
    expect(() => readNight(dir, '2026-10-03')).toThrow();
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('throws on an unreadable file', () => {
    const dir = nightDir({ '2026-10-04.jsonl': '' });
    chmodSync(join(dir, '2026-10-04.jsonl'), 0o000);
    expect(() => readNight(dir, '2026-10-04')).toThrow();
  });
});

describe('untrusted lines', () => {
  const ok = { at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'ok', owner: 'rook' };
  const line = (o: Record<string, unknown>) => JSON.stringify(o);

  it('counts structurally invalid lines as bad, never throws', () => {
    const bad = [
      '{"at":',
      'null',
      '42',
      '"text"',
      '[]',
      line({ ...ok, status: 'done' }),
      line({ ...ok, job: '' }),
      line({ ...ok, job: 7 }),
      line({ ...ok, at: 'yesterday' }),
      line({ ...ok, at: '2026-10-28T23:00:00' }),
      line({ ...ok, owner: 3 }),
      line({ at: ok.at, job: 'a', status: 'ok' }),
      line({ ...ok, error: { msg: 'x' } }),
    ];
    for (const b of bad) expect(parseLine(b)).toBeNull();
    const digest = digestText([...bad, line(ok), '', '   '].join('\n'));
    expect(digest.badLines).toBe(bad.length);
    expect(digest.rows).toHaveLength(1);
    expect(digest.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });

  it('ignores prototype-ish keys and extra fields', () => {
    const d = digestText(`{"__proto__":{"x":1},"at":"${ok.at}","job":"__proto__","status":"retry","owner":null,"extra":true}\r\n`);
    expect(d.badLines).toBe(0);
    expect(d.rows).toEqual([
      {
        job: '__proto__',
        owner: null,
        runs: 1,
        retries: 1,
        lastStatus: 'retry',
        lastError: null,
        firstAt: ok.at,
        lastAt: ok.at,
      },
    ]);
  });

  it('orders events by instant across offsets and keeps each offset', () => {
    const d = digestText(
      [
        line({ ...ok, at: '2026-10-29T01:00:00+01:00', status: 'ok', owner: 'late' }),
        line({ ...ok, at: '2026-10-28T23:30:00Z', status: 'retry', owner: 'early', error: 'boom' }),
        line({ ...ok, at: '2026-10-29T00:30:00+02:00', status: 'fail', owner: 'first', error: 'first' }),
      ].join('\n'),
    );
    expect(d.rows[0]).toMatchObject({
      owner: 'late',
      runs: 3,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'boom',
      firstAt: '2026-10-29T00:30:00+02:00',
      lastAt: '2026-10-29T01:00:00+01:00',
    });
  });
});
