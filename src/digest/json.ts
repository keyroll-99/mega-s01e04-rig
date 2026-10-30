import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from './read-night.js';

// Plan morning-digest, section 2b. Same rows as the page (2a), as JSON for agents (ADR 0001).
// Validation of the night string lives in the reader (NIGHT_PATTERN): null means 404.
export function registerDigestJson(app: Hono, config: RigConfig): void {
  app.get('/api/digest/:night', (c) => {
    const digest = readNight(config.runsDir, c.req.param('night'));
    if (digest === null) return c.notFound();
    return c.json(digest);
  });
}
