# coolhand-metrics

A tiny public dashboard showing **weekly npm downloads of [`coolhand-cli`](https://www.npmjs.com/package/coolhand-cli)** —
a proxy for how many people are using the Coolhand skill.

**Live URL:** _(set after first deploy)_ `https://<username>.github.io/coolhand-metrics/`

## How it works

- A GitHub Action (`.github/workflows/update.yml`) runs **daily at 06:00 UTC**.
- It runs `scripts/update-data.js`, which fetches the public npm downloads API and groups
  downloads into complete **Monday→Sunday weeks** (matching Coolhand's internal admin chart),
  then writes `data.json`.
- The static `index.html` reads `data.json` and renders the latest weekly number,
  week-over-week change, and a trend chart (Chart.js via CDN).
- Hosted free on GitHub Pages. No backend, no database, no runtime dependencies.

## Run locally

```bash
node scripts/update-data.js   # refresh data.json from npm
npx serve .                   # then open the printed http://localhost URL
```

> Open it over `http://` (e.g. `npx serve`) — opening `index.html` as a file blocks the
> `data.json` fetch.
