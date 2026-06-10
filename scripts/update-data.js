#!/usr/bin/env node
// Fetches weekly npm download counts for coolhand-cli and writes data.json.
// Zero dependencies — uses Node 20+ global fetch. Run: node scripts/update-data.js
//
// Week definition matches Coolhand's internal admin chart: ISO weeks
// (Monday -> Sunday), and the current partial week is dropped so we only
// report complete weeks. This keeps the public number in agreement with
// the internal package_weekly_stats numbers.

const fs = require("fs");
const path = require("path");

const PACKAGE = "coolhand-cli";
const NPM_EARLIEST = "2015-01-10"; // npm download stats do not exist before this date
const OUTPUT = path.join(__dirname, "..", "data.json");

// Format a Date as YYYY-MM-DD in UTC (npm reports days in UTC).
function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

// Monday (UTC) of the ISO week containing the given YYYY-MM-DD string.
function isoMonday(dayString) {
  const date = new Date(`${dayString}T00:00:00Z`);
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const daysSinceMonday = (dayOfWeek + 6) % 7; // Mon -> 0, Sun -> 6
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return toISODate(date);
}

async function main() {
  const today = new Date();
  const end = toISODate(today);

  // ~18 months back (npm's per-query history limit), clamped to the earliest available date.
  const startDate = new Date(today);
  startDate.setUTCMonth(startDate.getUTCMonth() - 18);
  let start = toISODate(startDate);
  if (start < NPM_EARLIEST) start = NPM_EARLIEST;

  const url = `https://api.npmjs.org/downloads/range/${start}:${end}/${PACKAGE}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`npm API returned ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const days = Array.isArray(payload.downloads) ? payload.downloads : [];

  // Bucket daily counts into ISO-week (Monday) totals.
  const weekTotals = new Map();
  for (const { day, downloads } of days) {
    const weekStart = isoMonday(day);
    weekTotals.set(weekStart, (weekTotals.get(weekStart) || 0) + downloads);
  }

  // Drop the current partial week — only report complete Monday->Sunday weeks.
  weekTotals.delete(isoMonday(end));

  const sortedWeeks = [...weekTotals.entries()]
    .map(([weekStart, downloads]) => ({ weekStart, downloads }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  // Trim the long run of leading zero-weeks from before the package existed.
  // Any zero week after the first real download is kept — it is a real signal.
  const firstActive = sortedWeeks.findIndex((week) => week.downloads > 0);
  const weeks = firstActive === -1 ? [] : sortedWeeks.slice(firstActive);

  const data = {
    package: PACKAGE,
    lastUpdated: new Date().toISOString(),
    weeks,
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(data, null, 2)}\n`);

  const latest = weeks[weeks.length - 1];
  const summary = latest ? `${latest.weekStart} = ${latest.downloads}` : "none";
  console.log(`Wrote ${weeks.length} complete weeks to data.json. Latest: ${summary}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
