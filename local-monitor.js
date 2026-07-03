const WEBHOOK_URL = 'https://discord.com/api/webhooks/1522598923108356202/JNkQEPN0HEja5i9m_MyYlDC2ZCH6ZSfOgYmtXXPAos1yaG8-dfSHs3IQjaRIs5d2XJyv';
const MONITORS = [
  { name: 'DQCasio', url: 'https://google.com', type: 'http' },
  { name: 'Example', url: 'https://example.com', type: 'http' },
];
const SLOW_THRESHOLD = 5000;
const TIMEOUT = 10000;
const COLORS = { UP: 0x57F287, DOWN: 0xED4245, SLOW: 0xFEE75C, WARN: 0xFFA500 };
const STATE_FILE = 'monitor-state.json';
const fs = require('fs');

function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } }
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

async function main() {
  console.log('UptimeBot started — checking every 30s');
  const state = loadState();
  while (true) {
    for (const spec of MONITORS) {
      try { await checkOne(spec, state); } catch (e) { console.error(`[${spec.name}] Error:`, e.message); }
    }
    saveState(state);
    await new Promise(r => setTimeout(r, 30000));
  }
}

async function checkOne(spec, state) {
  const { name, url, type, keyword } = spec;
  const prev = state[name];
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
  const current = { status, latency: result.latency || 0, error: result.error || null, checkedAt: now, downtimeStart: prev?.downtimeStart };

  if ((status === 'DOWN' || status === 'SSL_EXPIRING') && prevStatus !== status) current.downtimeStart = now;
  if (status === 'UP' && (prevStatus === 'DOWN' || prevStatus === 'SSL_EXPIRING' || prevStatus === 'KEYWORD_MISSING') && prev?.downtimeStart) {
    const d = Math.floor((now - prev.downtimeStart) / 1000);
    current.lastDowntime = d < 60 ? `${d}s` : `${Math.floor(d/60)}m ${d%60}s`;
  }

  state[name] = current;

  if (status !== prevStatus) {
    const embed = buildEmbed(name, url, prevStatus, status, current, spec);
    if (embed) await sendDiscord(embed);
    console.log(`[${name}] ${prevStatus} -> ${status}`);
  }
}

async function checkHTTP(url) {
  const start = Date.now();
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: c.signal, redirect: 'follow' });
    clearTimeout(t);
    return { ok: res.status < 400, status: res.status, latency: Date.now() - start, body: await res.text(), error: null };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, status: 0, latency: Date.now() - start, body: '', error: e.name === 'AbortError' ? 'TIMEOUT' : e.message };
  }
}

async function checkSSL(url) {
  try { await fetch(`https://${new URL(url).hostname}`, { method: 'HEAD' }); return { ok: true, daysLeft: 30, error: null }; }
  catch (e) { return { ok: false, daysLeft: 0, error: e.message }; }
}

async function sendDiscord(embed) {
  try { await fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds: [embed] }) }); }
  catch (e) { console.error('Discord send failed:', e.message); }
}

function buildEmbed(name, url, prev, status, d, spec) {
  const ts = new Date().toISOString();
  const f = (n, v, i = true) => ({ name: n, value: String(v), inline: i });
  if (status === 'UP') return { title: `${name} is UP`, color: COLORS.UP, description: prev === 'DOWN' ? `Back online! ${d.lastDowntime || ''}` : 'OK', fields: [f('URL', url, false), f('Latency', `${d.latency}ms`), f('Previous', prev)], timestamp: ts };
  if (status === 'DOWN') return { title: `${name} is DOWN`, color: COLORS.DOWN, description: 'Unreachable', fields: [f('URL', url, false), f('Error', d.error)], timestamp: ts };
  if (status === 'SLOW') return { title: `${name} is SLOW`, color: COLORS.SLOW, description: `${d.latency}ms`, fields: [f('URL', url, false), f('Latency', `${d.latency}ms`)], timestamp: ts };
  if (status === 'KEYWORD_MISSING') return { title: `${name} — Missing Keyword`, color: COLORS.WARN, description: `"${spec.keyword}" not found`, fields: [f('URL', url, false), f('Keyword', spec.keyword)], timestamp: ts };
  if (status === 'SSL_EXPIRING') return { title: `${name} — SSL Expiring`, color: COLORS.WARN, description: 'Certificate expires soon', fields: [f('URL', url, false), f('Days Left', `${d.daysLeft}`)], timestamp: ts };
  return null;
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
