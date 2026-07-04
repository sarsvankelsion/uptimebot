import { useState, useEffect } from 'react';

const BASE = 'https://raw.githubusercontent.com/sarsvankelsion/uptimebot/main';
const API = 'https://api.github.com/repos/sarsvankelsion/uptimebot';

function getSha(url) {
  return fetch(url, { cache: 'no-store' }).then(r => r.json()).then(d => d.sha);
}

export default function App() {
  const [page, setPage] = useState('status');
  const [monitors, setMonitors] = useState([]);
  const [states, setStates] = useState({});
  const [token, setToken] = useState(sessionStorage.getItem('uptoken') || '');
  const [loggedIn, setLoggedIn] = useState(!!token);
  const [form, setForm] = useState({ name: '', url: '', type: 'http', keyword: '' });
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch(`${BASE}/monitors.json`).then(r => r.json()).then(setMonitors).catch(() => {});
    fetch(`${BASE}/state.json`).then(r => r.json()).then(setStates).catch(() => {});
  }, []);

  const statusCounts = monitors.reduce((acc, m) => {
    const s = states[m.name]?.status || 'UNKNOWN';
    if (s === 'UP') acc.up++; else if (s === 'DOWN') acc.down++; else if (['SLOW','KEYWORD_MISSING','SSL_EXPIRING'].includes(s)) acc.issue++;
    else acc.unknown++;
    return acc;
  }, { up: 0, down: 0, issue: 0, unknown: 0 });

  function handleLogin(e) {
    e.preventDefault();
    sessionStorage.setItem('uptoken', token);
    setLoggedIn(true);
    setMsg('');
  }

  function handleLogout() {
    sessionStorage.removeItem('uptoken');
    setToken('');
    setLoggedIn(false);
  }

  async function saveMonitor(e) {
    e.preventDefault();
    setMsg('');
    const list = editing !== null ? monitors.map((m, i) => i === editing ? form : m) : [...monitors, form];
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(list, null, 2))));
    try {
      const sha = await getSha(`${API}/contents/monitors.json`);
      const res = await fetch(`${API}/contents/monitors.json`, {
        method: 'PUT',
        headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `update monitors`, content, sha }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      setMonitors(list);
      setForm({ name: '', url: '', type: 'http', keyword: '' });
      setEditing(null);
      setMsg('Saved!');
    } catch (err) { setMsg('Error: ' + err.message); }
  }

  function editMonitor(idx) {
    setForm(monitors[idx]);
    setEditing(idx);
  }

  async function deleteMonitor(idx) {
    if (!confirm(`Delete ${monitors[idx].name}?`)) return;
    const list = monitors.filter((_, i) => i !== idx);
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(list, null, 2))));
    try {
      const sha = await getSha(`${API}/contents/monitors.json`);
      await fetch(`${API}/contents/monitors.json`, {
        method: 'PUT',
        headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `delete monitor`, content, sha }),
      });
      setMonitors(list);
      setMsg('Deleted!');
    } catch (err) { setMsg('Error: ' + err.message); }
  }

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-in">
          <span className="brand">📡 UptimeBot</span>
          <div className="nav-links">
            <button className={page === 'status' ? 'active' : ''} onClick={() => setPage('status')}>Status</button>
            {loggedIn && <button className={page === 'admin' ? 'active' : ''} onClick={() => setPage('admin')}>Admin</button>}
            {loggedIn ? <button onClick={handleLogout} className="logout">Logout</button> :
              <button onClick={() => setPage('login')}>Login</button>}
          </div>
        </div>
      </nav>

      <main className="main">
        {page === 'status' && (
          <div>
            <h1>System Status</h1>
            <p className="sub">Real-time monitoring of {monitors.length} services</p>
            <div className="sums">
              <div className="sum up"><div className="num">{statusCounts.up}</div><div className="lbl">Operational</div></div>
              <div className="sum down"><div className="num">{statusCounts.down}</div><div className="lbl">Down</div></div>
              <div className="sum issue"><div className="num">{statusCounts.issue}</div><div className="lbl">Issues</div></div>
            </div>
            {monitors.map((m, i) => {
              const s = states[m.name] || {};
              const cls = s.status === 'UP' ? 'up' : s.status === 'DOWN' ? 'down' : s.status === 'SLOW' ? 'slow' : 'warn';
              return (
                <div key={i} className="card">
                  <div><div className="card-n">{m.name}</div><div className="card-u">{m.url}</div><div className="card-m">⏱ {s.latency || '—'}ms · {s.checkedAt ? new Date(s.checkedAt).toLocaleString() : '—'}</div></div>
                  <div className={`badge ${cls}`}><span className="dot"></span>{s.status || 'UNKNOWN'}</div>
                </div>
              );
            })}
          </div>
        )}

        {page === 'login' && !loggedIn && (
          <div className="login-c">
            <div className="login-card">
              <h2>Admin Login</h2>
              <form onSubmit={handleLogin}>
                <input type="password" placeholder="GitHub Personal Access Token" value={token} onChange={e => setToken(e.target.value)} required /><br/><br/>
                <button type="submit" className="btn">Login</button>
              </form>
            </div>
          </div>
        )}

        {page === 'admin' && loggedIn && (
          <div>
            <div className="ah"><h2>Admin Dashboard</h2>
              <button className="btn" onClick={() => { setForm({ name: '', url: '', type: 'http', keyword: '' }); setEditing(null); setPage('edit'); }}>+ Add Monitor</button>
            </div>
            {msg && <div className="msg">{msg}</div>}
            <table className="table">
              <thead><tr><th>Name</th><th>URL</th><th>Type</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {monitors.map((m, i) => {
                  const s = states[m.name]?.status || 'UNKNOWN';
                  return (
                    <tr key={i}>
                      <td>{m.name}</td><td className="url-c">{m.url}</td><td>{m.type}</td>
                      <td><span className={'badge ' + (s === 'UP' ? 'up' : 'down')}>{s}</span></td>
                      <td className="acts">
                        <button className="btn sm" onClick={() => { editMonitor(i); setPage('edit'); }}>Edit</button>
                        <button className="btn sm danger" onClick={() => deleteMonitor(i)}>Del</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {page === 'edit' && loggedIn && (
          <div className="login-c">
            <div className="login-card">
              <h2>{editing !== null ? 'Edit Monitor' : 'Add Monitor'}</h2>
              <form onSubmit={saveMonitor}>
                <label>Name</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="My Service" required /><br/>
                <label>URL</label>
                <input value={form.url} onChange={e => setForm({...form, url: e.target.value})} placeholder="https://" required /><br/>
                <label>Type</label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                  <option value="http">HTTP</option><option value="keyword">Keyword</option><option value="ssl">SSL</option>
                </select><br/>
                {form.type === 'keyword' && <><label>Keyword</label><input value={form.keyword} onChange={e => setForm({...form, keyword: e.target.value})} placeholder="expected text" required /><br/></>}
                <div className="acts" style={{marginTop:16}}>
                  <button type="button" className="btn sm" onClick={() => setPage('admin')}>Cancel</button>
                  <button type="submit" className="btn">{editing !== null ? 'Update' : 'Create'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">UptimeBot &mdash; Powered by GitHub Actions</footer>
    </div>
  );
}
