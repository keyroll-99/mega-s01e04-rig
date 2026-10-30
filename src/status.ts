import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read-night.js';
import type { StatusCounts } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

// One entry per night on disk, in the same order as `nights`.
// `counts` is null when the night can't be read (the board shows `—`, the page still renders).
export type NightCounts = { night: string; counts: StatusCounts | null };

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: string[];
  nightCounts: NightCounts[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  const nights = nightsOnDisk(config.runsDir);
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
    nightCounts: nights.map((night) => ({ night, counts: countsFor(config.runsDir, night) })),
  };
}

// The reader's contract throws on I/O errors (permissions, a directory where the file should be).
// One unreadable night must not take the whole board down, so it becomes `null` here.
function countsFor(runsDir: string, night: string): StatusCounts | null {
  try {
    return readNight(runsDir, night)?.counts ?? null;
  } catch {
    return null;
  }
}
