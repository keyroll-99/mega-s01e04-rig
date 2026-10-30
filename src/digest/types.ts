// Plan morning-digest, section 1. The contract every part of section 2 builds against.
// The implementation lives in ./read-night.ts as `export const readNight: ReadNight`.

/** Status of one event in `runs/<night>.jsonl`. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/** One row per job for the night. */
export type DigestRow = {
  job: string;
  /** Owner on the job's latest event. `null` is kept; views render it as `—`. */
  owner: string | null;
  /** Valid events for this job (ok + retry + fail). */
  runs: number;
  /** Events with status `retry`. */
  retries: number;
  /** Status of the job's latest event. */
  lastStatus: RunStatus;
  /** Most recent `error` seen for this job, even if a later event succeeded; `null` if none. */
  lastError: string | null;
  /** `at` of the earliest event, verbatim from the log (offset kept, never converted to UTC). */
  firstAt: string;
  /** `at` of the latest event, verbatim from the log (offset kept, never converted to UTC). */
  lastAt: string;
};

/** Event counts for the whole night, valid lines only. */
export type StatusCounts = { ok: number; retry: number; fail: number };

export type NightDigest = {
  /** Sorted by `job` (plain code-point order). Empty for an empty file. */
  rows: DigestRow[];
  /** Non-blank lines that were not valid JSON or failed structural validation. Never thrown. */
  badLines: number;
  counts: StatusCounts;
};

/** A night is `YYYY-MM-DD` (a real calendar date). Anything else is rejected before any file access. */
export const NIGHT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads `<runsDir>/<night>.jsonl` synchronously.
 * - `null` when `night` is not a valid `YYYY-MM-DD` date, or the file (or runsDir) does not exist → 404.
 * - An empty file is a valid night: `{ rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } }`.
 * - Other I/O errors (permissions, a directory where the file should be, ...) are thrown.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
