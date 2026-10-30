# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

## Review preview

Save the sample digest as one HTML file **outside this repository**:

```sh
node --env-file=.env --import tsx scripts/export-preview.ts /tmp/rig-preview/index.html
```

GitHub Pages uses the manual `Publish digest preview` workflow. It renders only
the template's sample night, never commits the HTML, and deletes the temporary
Actions artifact after deployment. The first review uses the repository's
`LANE_MARKER` secret and `include_marker=true`.

Ask the human before that first public upload. Once review is in, ask again
before running the same workflow with `include_marker=false`. This replaces the
same URL with the banner `no marker set`. To make an unmarked copy locally:

```sh
env -u LANE_MARKER pnpm preview /tmp/rig-preview/index.html
```

Disable GitHub Pages in repository settings to unpublish the site. Do not put
previews, `.env`, or the marker in Git, issues, or chat attachments.
