#!/usr/bin/env node
// Fetches npm metrics for coolhand-cli and writes data.json.
// Zero dependencies — uses Node 20+ global fetch. Run: node scripts/update-data.js
//
// Two data sources, both public, no auth:
//   1. npm downloads API  -> daily download counts (DEMAND: how many people use it)
//   2. npm registry doc   -> version + publish times (SUPPLY: how actively it ships)
//
// Week definition matches Coolhand's internal admin chart: ISO weeks (Mon -> Sun),
// current partial week dropped, so the public number agrees with the internal one.

const fs = require("fs");
const path = require("path");

const PACKAGE = "coolhand-cli";
const NPM_EARLIEST = "2015-01-10"; // npm download stats do not exist before this date
const OUTPUT = path.join(__dirname, "..", "data.json");
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}
function utc(dayString) {
  return new Date(`${dayString}T00:00:00Z`);
}
// Monday (UTC) of the ISO week containing the given YYYY-MM-DD string.
function isoMonday(dayString) {
  const date = utc(dayString);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7; // Mon -> 0, Sun -> 6
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return toISODate(date);
}

// ---- DEMAND: daily downloads -> weekly series + a couple of derived metrics ----

function weeklyFromDays(days) {
  const totals = new Map();
  for (const { day, downloads } of days) {
    const weekStart = isoMonday(day);
    totals.set(weekStart, (totals.get(weekStart) || 0) + downloads);
  }
  return totals;
}

// Sum of the trailing 30 days (rolling month).
function last30Days(days, endString) {
  const end = utc(endString);
  const cutoff = utc(endString);
  cutoff.setUTCDate(cutoff.getUTCDate() - 29);
  let sum = 0;
  for (const { day, downloads } of days) {
    const d = utc(day);
    if (d >= cutoff && d <= end) sum += downloads;
  }
  return sum;
}

// Which weekday gets the most downloads (weekday-heavy = real devs at work).
function busiestWeekday(days) {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  for (const { day, downloads } of days) totals[utc(day).getUTCDay()] += downloads;
  let best = 0;
  for (let i = 1; i < 7; i++) if (totals[i] > totals[best]) best = i;
  return { name: WEEKDAY_NAMES[best], downloads: totals[best] };
}

// ---- SUPPLY: registry doc -> version + release cadence ----

async function fetchRelease(pkg) {
  const res = await fetch(`https://registry.npmjs.org/${pkg}`);
  if (!res.ok) throw new Error(`registry returned ${res.status}`);
  const doc = await res.json();
  const latest = doc["dist-tags"] ? doc["dist-tags"].latest : null;
  const time = doc.time || {};
  const versionCount = doc.versions ? Object.keys(doc.versions).length : 0;
  return {
    version: latest,
    firstRelease: time.created || null,
    lastRelease: (latest && time[latest]) || time.modified || null,
    count: versionCount,
  };
}

async function main() {
  const today = new Date();
  const end = toISODate(today);
  const startDate = new Date(today);
  startDate.setUTCMonth(startDate.getUTCMonth() - 18); // npm's per-query history limit
  let start = toISODate(startDate);
  if (start < NPM_EARLIEST) start = NPM_EARLIEST;

  const res = await fetch(`https://api.npmjs.org/downloads/range/${start}:${end}/${PACKAGE}`);
  if (!res.ok) throw new Error(`npm downloads API returned ${res.status} ${res.statusText}`);
  const payload = await res.json();
  const days = Array.isArray(payload.downloads) ? payload.downloads : [];

  // weekly series, complete weeks only (current partial week filtered out), leading empty weeks trimmed
  const currentWeek = isoMonday(end);
  const sortedWeeks = [...weeklyFromDays(days).entries()]
    .filter(([weekStart]) => weekStart !== currentWeek)
    .map(([weekStart, downloads]) => ({ weekStart, downloads }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const firstActive = sortedWeeks.findIndex((w) => w.downloads > 0);
  const weeks = firstActive === -1 ? [] : sortedWeeks.slice(firstActive);

  // release/supply data — non-fatal if the registry call fails
  let release = null;
  try {
    release = await fetchRelease(PACKAGE);
  } catch (error) {
    console.error(`release fetch failed (continuing without it): ${error.message}`);
  }

  const data = {
    package: PACKAGE,
    lastUpdated: new Date().toISOString(),
    weeks,
    demand: {
      last30Days: last30Days(days, end),
      busiestWeekday: busiestWeekday(days),
    },
    release,
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(data, null, 2)}\n`);

  const latest = weeks[weeks.length - 1];
  console.log(
    `Wrote ${weeks.length} weeks. Latest: ${latest ? `${latest.weekStart} = ${latest.downloads}` : "none"}; ` +
    `last 30d = ${data.demand.last30Days}; version = ${release ? release.version : "n/a"}`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
