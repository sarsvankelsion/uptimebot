const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'state.json');
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const MONITORS = JSON.parse(process.env.MONITORS_JSON || '[]');
const SLOW_THRESHOLD = 5000;
const TIMEOUT = 10000;
const COLORS = { UP: 0x57F287, DOWN: 0xED4245, SLOW: 0xFEE75C, WARN: 0xFFA500 };
const CYCLE_SLEEP = 30000; // 30s between cycles
const MAX_CYCLES = 9; // 9 cycles × ~33s = ~5 min (fits 5-min cron window)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  if (!WEBHOOK_URL) { console.error('Missing WEBHOOK_URL'); process.exit(1); }
  if (!MONITORS.length) { console.error('Missing MONITORS_JSON'); process.exit(1); }

  const state = loadState();

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    console.log(`=== Cycle ${cycle}/${MAX_CYCLES} ===`);
    for (const spec of MONITORS) {
      try {
        state[spec.name] = await checkOne(spec, state[spec.name]);
      } catch (err) {
        console.error(`[${spec.name}] Error:`, err.message);
      }
    }
    if (cycle < MAX_CYCLES) {
      console.log(`Sleeping 30s...`);
      await sleep(CYCLE_SLEEP);
    }
  }

  saveState(state);
  console.log('All cycles done');
}

async function checkOne(spec, prev) {
  const { name, url, type, keyword } = spec;
  const prevStatus = prev?.status || 'UNKNOWN';
  let result, status;

  if (type === 'ssl') {
    result = await checkSSL(url);
    status = result.ok ? 'UP' : 'SSL_EXPIRING';
  } else {
    result = await checkHTTP(url);
    if (!result.ok) status = 'DOWN';
    else if (type === 'keyword' && keyword && !result.body.includes(keyword)) status = 'KEYWORD_MISSING';
    else if (result.latency > SLOW_THRESHOLD) status = 'SLOW';
    else status = 'UP';
  }

  const now = Date.now();
  const current = { status, latency: result.latency || 0, error: result.error || null, checkedAt: now };

  if ((status === 'DOWN' || status === 'SSL_EXPIRING') && prevStatus !== 'DOWN' && prevStatus !== 'SSL_EXPIRING') {
    current.downtimeStart = now;
  } else if (prev?.downtimeStart) {
    current.downtimeStart = prev.downtimeStart;
  }
  if (status === 'UP' && (prevStatus === 'DOWN' || prevStatus === 'SSL_EXPIRING' || prevStatus === 'KEYWORD_MISSING')) {
    if (prev?.downtimeStart) current.lastDowntime = formatDuration(now - prev.downtimeStart);
  }

  if (status !== prevStatus) {
    const embed = buildEmbed(name, url, prevStatus, status, current, spec);
    if (embed) await sendDiscord(embed);
    console.log(`[${name}] ${prevStatus} -> ${status}`);
  } else {
    console.log(`[${name}] ${status} (${result.latency}ms)`);
  }

  return current;
}

async function checkHTTP(url) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    const body = await res.text();
    return { ok: res.status < 400, status: res.status, latency: Date.now() - start, body, error: null };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, latency: Date.now() - start, body: '', error: err.name === 'AbortError' ? 'TIMEOUT' : err.message };
  }
}

async function checkSSL(url) {
  try {
    const hostname = new URL(url).hostname;
    await fetch(`https://${hostname}`, { method: 'HEAD' });
    return { ok: true, daysLeft: 30, error: null };
  } catch (err) {
    return { ok: false, daysLeft: 0, error: err.message };
  }
}

async function sendDiscord(embed) {
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) console.error('Discord error:', await res.text());
  } catch (err) {
    console.error('Discord send failed:', err.message);
  }
}

function buildEmbed(name, url, prev, status, data, spec) {
  const ts = new Date().toISOString();
  const f = (n, v, i = true) => ({ name: n, value: String(v), inline: i });

  if (status === 'UP') {
    return { title: `${name} is UP`, color: COLORS.UP, description: prev === 'DOWN' ? `Back online! Downtime: ${data.lastDowntime || 'unknown'}` : 'Service is UP', fields: [f('URL', url, false), f('Latency', `${data.latency}ms`), f('Previous', prev)], timestamp: ts };
  }
  if (status === 'DOWN') {
    return { title: `${name} is DOWN`, color: COLORS.DOWN, description: 'Service unreachable', fields: [f('URL', url, false), f('Error', data.error), f('Latency', `${data.latency}ms`)], timestamp: ts };
  }
  if (status === 'SLOW') {
    return { title: `${name} is SLOW`, color: COLORS.SLOW, description: `${data.latency}ms > ${SLOW_THRESHOLD}ms`, fields: [f('URL', url, false), f('Latency', `${data.latency}ms`), f('Threshold', `${SLOW_THRESHOLD}ms`)], timestamp: ts };
  }
  if (status === 'KEYWORD_MISSING') {
    return { title: `${name} — Keyword Missing`, color: COLORS.WARN, description: `"${spec.keyword}" not found`, fields: [f('URL', url, false), f('Keyword', spec.keyword)], timestamp: ts };
  }
  if (status === 'SSL_EXPIRING') {
    return { title: `${name} — SSL Expiring`, color: COLORS.WARN, description: 'Certificate expires soon', fields: [f('URL', url, false), f('Days Left', `${data.daysLeft}`)], timestamp: ts };
  }
  return null;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return {}; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function formatDuration(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
