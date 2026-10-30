import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow, NightDigest } from '../src/digest/types.js';

// Route tests for morning-digest plan §2d, covering §2a (page) and §2b (JSON).
// They go through createApp(config).request() against a temp runsDir.
// runs/ is a read-only fixture and is never read or written here.

const NIGHT = '2026-10-28';
const ROW_KEYS = ['job', 'owner', 'runs', 'retries', 'lastStatus', 'lastError', 'firstAt', 'lastAt'];
const WARN = /class="[^"]*\bwarn\b/;

let root: string;
let runsDir: string;
let savedMarker: string | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  runsDir = join(root, 'runs');
  mkdirSync(runsDir);
  savedMarker = process.env.LANE_MARKER;
  delete process.env.LANE_MARKER;
});

afterEach(() => {
  if (savedMarker === undefined) delete process.env.LANE_MARKER;
  else process.env.LANE_MARKER = savedMarker;
  rmSync(root, { recursive: true, force: true });
});

function app(dir = runsDir) {
  return createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });
}

// One event line in runs/<night>.jsonl. `status` is a string so tests can write invalid values.
function ev(at: string, job: string, status: string, owner: string | null, error?: string): string {
  return JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });
}

function writeNight(lines: string[], night = NIGHT): void {
  writeFileSync(join(runsDir, `${night}.jsonl`), lines.map((line) => `${line}\n`).join(''));
}

async function page(path: string) {
  const res = await app().request(path);
  return { res, html: await res.text() };
}

async function json(path: string) {
  const res = await app().request(path);
  const body = (await res.json().catch(() => null)) as NightDigest | null;
  return { res, body };
}

// The table row that carries a job name. Checks use the row's text and classes, not exact tag layout.
function rowFor(html: string, job: string): string {
  const chunk = html.split('<tr').slice(1).find((c) => c.includes(job));
  if (chunk === undefined) throw new Error(`no table row for ${job}`);
  return chunk.split('</tr')[0];
}

function textOf(fragment: string): string {
  return fragment.replace(/<[^>]*>/g, ' ');
}

// The text of each <td> in a row, in column order. Tolerant of attributes and whitespace.
function cellsOf(row: string): string[] {
  return [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]*>/g, '').trim());
}

// Shuffled on purpose: page and JSON must sort by job, not by file order.
const MAIN = [
  ev('2026-10-28T23:00:06+01:00', 'lane/sync', 'ok', 'rook'),
  ev('2026-10-28T01:30:00+01:00', 'fixtures/refresh', 'retry', 'rook', 'upstream 503'),
  ev('2026-10-28T05:41:09+01:00', 'digest/render', 'ok', null),
  ev('2026-10-28T01:31:00+01:00', 'fixtures/refresh', 'retry', 'rook', 'upstream 503'),
  ev('2026-10-28T04:00:01+01:00', 'notes/backup', 'fail', 'lane-07', 'quota exceeded'),
  ev('2026-10-28T01:33:00+01:00', 'fixtures/refresh', 'retry', 'rook', 'upstream 503'),
  ev('2026-10-28T01:37:00+01:00', 'fixtures/refresh', 'ok', 'rook'),
];

const MAIN_ROWS: DigestRow[] = [
  { job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-28T05:41:09+01:00', lastAt: '2026-10-28T05:41:09+01:00' },
  { job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503', firstAt: '2026-10-28T01:30:00+01:00', lastAt: '2026-10-28T01:37:00+01:00' },
  { job: 'lane/sync', owner: 'rook', runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-28T23:00:06+01:00' },
  { job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded', firstAt: '2026-10-28T04:00:01+01:00', lastAt: '2026-10-28T04:00:01+01:00' },
];

const WITH_BAD_LINES = [
  ev('2026-10-28T23:00:06+01:00', 'lane/sync', 'ok', 'rook'),
  '{"at":"2026-10-28T02:00:00+01:00","job":"lane/sync"', // truncated JSON
  '', // blank: not a bad line
  ev('2026-10-28T03:00:00+01:00', 'lane/sync', 'meh', 'rook'), // unknown status fails structural validation
  ev('2026-10-28T04:00:00+01:00', 'fixtures/refresh', 'retry', 'rook', 'upstream 503'),
];

const OFFSETS = [
  ev('2026-10-28T23:30:00-05:00', 'offsets/check', 'ok', 'rook'), // = 2026-10-29T04:30Z
  ev('2026-10-29T10:00:00+01:00', 'offsets/check', 'ok', 'rook'), // = 2026-10-29T09:00Z
];

const HOSTILE = [ev('2026-10-28T01:00:00+01:00', '<b>evil</b>', 'fail', 'rook', '<script>alert("x")</script> & more')];

const ORDER = [
  ev('2026-10-28T01:00:00+01:00', 'notes/backup', 'ok', 'lane-07'),
  ev('2026-10-28T01:05:00+01:00', 'lane/sync', 'ok', 'rook'),
  ev('2026-10-28T01:10:00+01:00', 'Zeta/upper', 'ok', 'rook'),
  ev('2026-10-28T01:15:00+01:00', 'digest/render', 'ok', null),
  ev('2026-10-28T01:20:00+01:00', 'rig/rotate-logs', 'ok', 'lane-07'),
  ev('2026-10-28T01:25:00+01:00', 'fixtures/refresh', 'fail', 'rook', 'boom'),
];
const ORDER_JOBS = ['Zeta/upper', 'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'];

const BAD_NIGHTS = [
  '2026-13-45', // not a month
  '2026-02-30', // not a calendar date
  '2026-10-28.jsonl',
  'yesterday',
  '20261028',
  '..%2Fsecret', // traversal out of runsDir
  '%2e%2e%2fsecret',
  '..%2F..%2Fetc%2Fpasswd',
];

describe('GET /digest/:night (page)', () => {
  it('200 HTML with every job of the night', async () => {
    writeNight(MAIN);
    const { res, html } = await page(`/digest/${NIGHT}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    for (const row of MAIN_ROWS) expect(html).toContain(row.job);
  });

  it('renders a null owner as — and keeps the row', async () => {
    writeNight(MAIN);
    const { html } = await page(`/digest/${NIGHT}`);
    const text = textOf(rowFor(html, 'digest/render'));
    expect(text).toContain('—');
    expect(text).not.toMatch(/\bnull\b/);
  });

  it('marks a job with a fail and a job with 3 or more retries, and leaves healthy jobs unmarked', async () => {
    writeNight(MAIN);
    const { html } = await page(`/digest/${NIGHT}`);
    expect(rowFor(html, 'fixtures/refresh')).toMatch(WARN);
    expect(rowFor(html, 'notes/backup')).toMatch(WARN);
    expect(rowFor(html, 'lane/sync')).not.toMatch(WARN);
    expect(rowFor(html, 'digest/render')).not.toMatch(WARN);
  });

  it('does not mark two retries, and marks three', async () => {
    writeNight([
      ev('2026-10-28T01:00:00+01:00', 'two/retries', 'retry', 'rook', 'busy'),
      ev('2026-10-28T01:05:00+01:00', 'two/retries', 'retry', 'rook', 'busy'),
      ev('2026-10-28T01:10:00+01:00', 'two/retries', 'ok', 'rook'),
      ev('2026-10-28T02:00:00+01:00', 'three/retries', 'retry', 'rook', 'busy'),
      ev('2026-10-28T02:05:00+01:00', 'three/retries', 'retry', 'rook', 'busy'),
      ev('2026-10-28T02:10:00+01:00', 'three/retries', 'retry', 'rook', 'busy'),
      ev('2026-10-28T02:15:00+01:00', 'three/retries', 'ok', 'rook'),
    ]);
    const { html } = await page(`/digest/${NIGHT}`);
    expect(rowFor(html, 'two/retries')).not.toMatch(WARN);
    expect(rowFor(html, 'three/retries')).toMatch(WARN);
  });

  it('an empty file is 200 and says nothing ran', async () => {
    writeFileSync(join(runsDir, `${NIGHT}.jsonl`), '');
    const { res, html } = await page(`/digest/${NIGHT}`);
    expect(res.status).toBe(200);
    expect(html).toMatch(/nothing ran/i);
  });

  it('counts malformed lines, does not render them, and still renders the valid jobs', async () => {
    writeNight(WITH_BAD_LINES);
    const { res, html } = await page(`/digest/${NIGHT}`);
    expect(res.status).toBe(200);
    expect(html).toContain('lane/sync');
    expect(html).toContain('fixtures/refresh');
    expect(html).not.toContain('meh');
    expect(html).not.toContain('02:00:00+01:00');
  });

  it('shows the lane banner marker', async () => {
    process.env.LANE_MARKER = 'DIGEST-TEST-MARKER';
    writeNight(MAIN);
    const { html } = await page(`/digest/${NIGHT}`);
    expect(html).toContain('DIGEST-TEST-MARKER');
  });

  it('keeps timestamp offsets verbatim and does not convert them to UTC', async () => {
    writeNight(OFFSETS);
    const { html } = await page(`/digest/${NIGHT}`);
    expect(html).toContain('2026-10-28T23:30:00-05:00');
    expect(html).toContain('2026-10-29T10:00:00+01:00');
    expect(html).not.toContain('2026-10-29T04:30:00Z');
    expect(html).not.toContain('2026-10-29T09:00:00Z');
  });

  it('escapes job and error text', async () => {
    writeNight(HOSTILE);
    const { html } = await page(`/digest/${NIGHT}`);
    expect(html).not.toContain('<b>evil</b>');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;b&gt;evil&lt;/b&gt;');
    expect(html).toContain('&lt;script&gt;');
  });

  it('404 when this night has no file, even if another night does', async () => {
    writeNight(MAIN, '2026-10-27');
    const { res } = await page(`/digest/${NIGHT}`);
    expect(res.status).toBe(404);
  });

  it('404 when runsDir does not exist', async () => {
    const res = await app(join(root, 'no-such-dir')).request(`/digest/${NIGHT}`);
    expect(res.status).toBe(404);
  });

  it.each(BAD_NIGHTS)('404 for invalid night %s, and never reads outside runsDir', async (night) => {
    writeFileSync(join(root, 'secret.jsonl'), `${ev('2026-10-28T01:00:00+01:00', 'secret/job', 'ok', 'rook')}\n`);
    const res = await app().request(`/digest/${night}`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('secret/job');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('200 JSON with exactly rows, badLines and counts', async () => {
    writeNight(MAIN);
    const { res, body } = await json(`/api/digest/${NIGHT}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(Object.keys(body ?? {}).sort()).toEqual(['badLines', 'counts', 'rows']);
  });

  it('rows follow the DigestRow contract, sorted by job', async () => {
    writeNight(MAIN);
    const { body } = await json(`/api/digest/${NIGHT}`);
    expect(Object.keys(body?.rows[0] ?? {}).sort()).toEqual([...ROW_KEYS].sort());
    expect(body?.rows).toEqual(MAIN_ROWS);
  });

  it('keeps a null owner as null', async () => {
    writeNight(MAIN);
    const { body } = await json(`/api/digest/${NIGHT}`);
    const row = body?.rows.find((r) => r.job === 'digest/render');
    expect(row).toHaveProperty('owner', null);
  });

  it('counts ok, retry and fail over valid lines, and badLines over bad ones', async () => {
    writeNight(MAIN);
    const { body } = await json(`/api/digest/${NIGHT}`);
    expect(body?.counts).toEqual({ ok: 3, retry: 3, fail: 1 });
    expect(body?.badLines).toBe(0);
  });

  it('an empty file is 200 with no rows and zero counts', async () => {
    writeFileSync(join(runsDir, `${NIGHT}.jsonl`), '');
    const { res, body } = await json(`/api/digest/${NIGHT}`);
    expect(res.status).toBe(200);
    expect(body).toEqual({ rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('malformed lines are counted, and valid jobs still appear', async () => {
    writeNight(WITH_BAD_LINES);
    const { res, body } = await json(`/api/digest/${NIGHT}`);
    expect(res.status).toBe(200);
    expect(body?.badLines).toBe(2);
    expect(body?.counts).toEqual({ ok: 1, retry: 1, fail: 0 });
    expect(body?.rows).toEqual([
      { job: 'fixtures/refresh', owner: 'rook', runs: 1, retries: 1, lastStatus: 'retry', lastError: 'upstream 503', firstAt: '2026-10-28T04:00:00+01:00', lastAt: '2026-10-28T04:00:00+01:00' },
      { job: 'lane/sync', owner: 'rook', runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-28T23:00:06+01:00' },
    ]);
  });

  it('keeps timestamp offsets verbatim', async () => {
    writeNight(OFFSETS);
    const { body } = await json(`/api/digest/${NIGHT}`);
    expect(body?.rows).toHaveLength(1);
    expect(body?.rows[0]).toMatchObject({ firstAt: '2026-10-28T23:30:00-05:00', lastAt: '2026-10-29T10:00:00+01:00' });
  });

  it('keeps job and error text raw (escaping is for HTML only)', async () => {
    writeNight(HOSTILE);
    const { body } = await json(`/api/digest/${NIGHT}`);
    expect(body?.rows[0]).toMatchObject({ job: '<b>evil</b>', lastError: '<script>alert("x")</script> & more' });
  });

  it('404 when this night has no file', async () => {
    writeNight(MAIN, '2026-10-27');
    const res = await app().request(`/api/digest/${NIGHT}`);
    expect(res.status).toBe(404);
  });

  it('404 when runsDir does not exist', async () => {
    const res = await app(join(root, 'no-such-dir')).request(`/api/digest/${NIGHT}`);
    expect(res.status).toBe(404);
  });

  it.each(BAD_NIGHTS)('404 for invalid night %s, and never reads outside runsDir', async (night) => {
    writeFileSync(join(root, 'secret.jsonl'), `${ev('2026-10-28T01:00:00+01:00', 'secret/job', 'ok', 'rook')}\n`);
    const res = await app().request(`/api/digest/${night}`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('secret/job');
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order, sorted by job', async () => {
    writeNight(ORDER);
    const { body } = await json(`/api/digest/${NIGHT}`);
    expect(body?.rows.map((r) => r.job)).toEqual(ORDER_JOBS);

    const { html } = await page(`/digest/${NIGHT}`);
    const positions = ORDER_JOBS.map((job) => html.indexOf(job));
    positions.forEach((p) => expect(p).toBeGreaterThanOrEqual(0));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('show the same values in each row cell as the JSON row', async () => {
    writeNight(MAIN);
    const { body } = await json(`/api/digest/${NIGHT}`);
    const { html } = await page(`/digest/${NIGHT}`);
    for (const row of body?.rows ?? []) {
      expect(cellsOf(rowFor(html, row.job))).toEqual([
        row.job,
        row.owner ?? '—',
        String(row.runs),
        String(row.retries),
        row.lastStatus,
        row.lastError ?? '—',
        row.firstAt,
        row.lastAt,
      ]);
    }
  });
});

describe('control for the 404 cases', () => {
  it('a valid night in the same temp runsDir is 200 on both routes, so the 404s above are the reader’s doing', async () => {
    writeNight(MAIN);
    writeFileSync(join(root, 'secret.jsonl'), `${ev('2026-10-28T01:00:00+01:00', 'secret/job', 'ok', 'rook')}\n`);
    expect((await app().request(`/digest/${NIGHT}`)).status).toBe(200);
    expect((await app().request(`/api/digest/${NIGHT}`)).status).toBe(200);
  });
});
