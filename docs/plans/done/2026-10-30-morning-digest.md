---
plan: morning-digest
status: done
owner: rook
opened: 2026-10-29
closed: 2026-10-30
---

# Morning digest

The night's run log is a JSONL file nobody reads. By breakfast someone has to know what ran,
what retried, what failed, and whose it was, without opening `runs/`. rig already serves the
status board; the digest is one more page on it.

Out of scope: notifications, history across nights, auth (rig only listens on localhost).

## 1. Run log reader

Read `runs/<night>.jsonl` into one row per job: job, owner, runs, retries, last status, last
error, first and last time. One JSON object per line (`at`, `job`, `status`: `ok | retry | fail`,
`owner`, optional `error`).

- A line that doesn't parse is counted, never thrown. The night still renders.
- `owner` can be `null`. Keep the row; show the owner as `—`.
- Lives in `src/digest/`. Commit `src/digest/types.ts` first (the `DigestRow` type and the
  `readNight(runsDir, night)` signature), so every part of section 2 can start against it.

Done when: reader tests pass on `runs/2026-10-28.jsonl` (5 jobs, 1 bad line).

## 2. Digest page

Four small parts. Each needs only `src/digest/types.ts` from section 1, so once that is in they
can go to four workers at once. Small, well-specified work: a cheaper model is fine here.

### 2a. Page

`GET /digest/:night` renders the rows with the usual layout: one table, sorted by job, retries of
3 or more and any `fail` marked. A night with no file returns 404; an empty file renders
"nothing ran".

Done when: `/digest/2026-10-28` renders locally.

### 2b. JSON

`GET /api/digest/:night` returns the same rows as JSON. Agents read this one; the page and the
JSON must never disagree (ADR 0001).

Done when: the JSON for 2026-10-28 has the same jobs, in the same order, as the page.

### 2c. Board link

The status board links each night on disk to its digest, with its ok / retry / fail counts beside
it.

Done when: both nights on disk link to a digest that renders.

### 2d. Route tests

Route tests for 2a and 2b: 200, 404 for a night with no file, the empty night, a night with a bad
line. Use a temp runs dir; `runs/` is read-only.

Done when: `pnpm test` is green with the new tests.

## 3. Preview for review

The reviewer reads the page from a copy, not from the lane. Run rig and save `/digest/2026-10-28` as
one HTML file, lane banner included (a command, not a browser's "save as"; the page is
self-contained, ADR 0001). Put it on your own public host, one where you can upload over it later (any bucket
or static host, ADR 0003), so it opens from a public HTTPS link. Send the reviewer the link and the
issues for this plan.

Done when: the preview link is sent to the reviewer.

## 4. Clean up

The preview carries this lane's marker on a public link (ADR 0003). Take the marker off: save the
page again with `LANE_MARKER` unset (the banner reads "no marker set") and upload it over the same
link. Move this plan to `docs/plans/done/` with its issue list.

Done when: the preview link no longer shows the lane marker.

## Issues

All issues carry the `plan:morning-digest` label in keyroll-99/mega-s01e04-rig.

| # | Source | Issue | Blocked by | Worker | Implementation commit | Closed |
|---|--------|-------|------------|--------|-----------------------|--------|
| #1 | §1 | Reader and shared types | — | Codex · claude-opus-5-5 · high | d6f6743, 2acb741 | 2026-10-30 |
| #2 | §2a | HTML digest page | #1 shared types | Codex · claude-haiku-5-5 · high | 9df14cb, 05952ef | 2026-10-30 |
| #3 | §2b | JSON digest route | #1 shared types | Codex · claude-haiku-5-5 · medium | 8de68b1, 8d66e58 | 2026-10-30 |
| #4 | §2c | Board links and counts | #1 shared types | Codex · claude-haiku-5-5 · high | ba749b5 | 2026-10-30 |
| #5 | §2d | Route tests | #1 shared types | Codex · claude-haiku-5-5 · high | a4c8c72 | 2026-10-30 |
| #6 | §3 | Public preview and review | #1–#5 | Codex · inherited session model (not exposed) · default | 377efe8 | 2026-10-30 |
| #7 | §4 | Remove marker and archive plan | #6, reviewer confirmation | Codex · inherited session model (not exposed) · default | b24da8a; archive commit in Git history | 2026-10-30 |

## Completion evidence

- 63 tests and TypeScript checking passed in the cleanup deployment, Actions run 41035919143.
- The course confirmed the reviewer had seen the marked preview before cleanup began.
- After separate human approval, the page was generated with `LANE_MARKER` unset and replaced at the same public URL: https://keyroll-99.github.io/mega-s01e04-rig/
- An anonymous fetch of that exact URL matched the unmarked export byte for byte, contained "no marker set", and did not contain the lane marker. Chrome showed the same banner.
- The temporary Pages deployment artifact was deleted after deployment; the run reports zero retained artifacts. No preview HTML or marker was committed to Git.
- Issue #6 was initially closed too early. It was reopened, and closed only after the course explicitly confirmed the reviewer had seen the preview. Sending a link is not evidence that review is in.
