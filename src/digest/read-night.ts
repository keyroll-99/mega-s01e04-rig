import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NIGHT_PATTERN,
  type DigestRow,
  type NightDigest,
  type ReadNight,
  type RunStatus,
  type StatusCounts,
} from './types.js';

// Plan morning-digest, section 1: runs/<night>.jsonl → one row per job.

type RunEvent = {
  at: string;
  instant: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

// ISO 8601 with an explicit offset; the offset is what the digest shows, so it must be there.
const AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** `YYYY-MM-DD` that is a real calendar date. Also the guard against path traversal. */
export function isNight(night: string): boolean {
  if (!NIGHT_PATTERN.test(night)) return false;
  const [y, m, d] = night.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function isStatus(v: unknown): v is RunStatus {
  return v === 'ok' || v === 'retry' || v === 'fail';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** One untrusted line → a valid event, or null. Never throws. */
export function parseLine(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { at, job, status, owner, error } = value;
  if (typeof at !== 'string' || !AT_PATTERN.test(at)) return null;
  const instant = Date.parse(at);
  if (Number.isNaN(instant)) return null;
  if (typeof job !== 'string' || job.trim() === '') return null;
  if (!isStatus(status)) return null;
  if (!('owner' in value) || (owner !== null && typeof owner !== 'string')) return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  return { at, instant, job, status, owner, error: error ?? null };
}

/** Pure aggregation over the file's text. Exported for tests and for anything holding the text already. */
export function digestText(text: string): NightDigest {
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  const byJob = new Map<string, RunEvent[]>();
  let badLines = 0;

  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const event = parseLine(raw);
    if (event === null) {
      badLines += 1;
      continue;
    }
    counts[event.status] += 1;
    const events = byJob.get(event.job);
    if (events) events.push(event);
    else byJob.set(event.job, [event]);
  }

  const rows: DigestRow[] = [];
  for (const [job, events] of byJob) {
    // Order by instant; a stable sort keeps file order for equal instants.
    const ordered = [...events].sort((a, b) => a.instant - b.instant);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    let lastError: string | null = null;
    for (const e of ordered) if (e.error !== null) lastError = e.error;
    rows.push({
      job,
      owner: last.owner,
      runs: ordered.length,
      retries: ordered.filter((e) => e.status === 'retry').length,
      lastStatus: last.status,
      lastError,
      firstAt: first.at,
      lastAt: last.at,
    });
  }
  rows.sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { rows, badLines, counts };
}

function errorCode(err: unknown): string | undefined {
  if (isRecord(err) && typeof err.code === 'string') return err.code;
  return undefined;
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isNight(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    const code = errorCode(err);
    // No such file, or no such runs dir: the night didn't happen.
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw err;
  }
  return digestText(text);
};
