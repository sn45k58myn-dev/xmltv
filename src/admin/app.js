
const tokenInput=()=>document.getElementById('token');
tokenInput().value=localStorage.adminToken||'dev-admin-token';
function saveToken(){localStorage.adminToken=tokenInput().value;}
async function api(path, opts={}) {
  const url = path.startsWith('/') ? path : '/api/admin/' + path;
  const res=await fetch(url,{...opts,headers:{'content-type':'application/json','x-admin-token':tokenInput().value,...opts.headers}});
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}
function table(rows){if(!rows?.length)return '<p class="muted">No rows</p>'; const keys=Object.keys(rows[0]).slice(0,8); return `<table><thead><tr>${keys.map(k=>`<th>${k}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${keys.map(k=>`<td>${fmt(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`}
function fmt(v){if(v==null)return ''; if(typeof v==='object')return `<code>${JSON.stringify(v).slice(0,160)}</code>`; return String(v).slice(0,180)}
async function load(name){
  if (name === 'sources') { return loadSourcesUI(); }
  if (name === 'export-tokens') { return loadTokensUI(); }
  try{
    const data=await api(name);
    if(name==='summary'){cards(data); document.getElementById('content').innerHTML='';return}
    document.getElementById('content').innerHTML=`<h2>${name}</h2>`+table(Array.isArray(data)?data:data.items||[data]);
  }catch(e){
    document.getElementById('content').innerHTML='<pre>'+e.message+'</pre>'
  }
}

async function loadSourcesUI() {
  document.getElementById('content').innerHTML = `
    <h2>Sources Management</h2>
    <div class="card" style="margin-bottom: 2rem; background: white; padding: 1rem; border-radius: 8px;">
      <button onclick="runAllImports()">Run All Enabled Imports</button>
    </div>
    <div class="card" style="margin-bottom: 2rem; background: white; padding: 1rem; border-radius: 8px;">
      <h3 id="form-title">Add Source</h3>
      <form id="source-form" onsubmit="saveSource(event)">
        <input type="hidden" id="source-id">
        <div style="margin-bottom: 1rem;">
          <label>Name: <input type="text" id="source-name" required></label>
        </div>
        <div style="margin-bottom: 1rem;">
          <label>Type:
            <select id="source-type" required>
              <option value="url">URL</option>
              <option value="schedules-direct">Schedules Direct</option>
              <option value="iptv-org">IPTV-Org</option>
              <option value="epg.pw">epg.pw</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        </div>
        <div style="margin-bottom: 1rem;">
          <label>URL: <input type="text" id="source-url" style="width: 400px;"></label>
        </div>
        <div style="margin-bottom: 1rem;">
          <label>Priority: <input type="number" id="source-priority" value="100"></label>
        </div>
        <div style="margin-bottom: 1rem;">
          <label>Merge Weight: <input type="number" id="source-weight" value="100"></label>
        </div>
        <div style="margin-bottom: 1rem;">
          <label><input type="checkbox" id="source-enabled" checked> Enabled</label>
        </div>
        <button type="submit" id="save-btn">Save Source</button>
        <button type="button" onclick="loadSourcesUI()">Cancel</button>
      </form>
    </div>
    <h3>Existing Sources</h3>
    <div id="sources-list">Loading...</div>
  `;
  refreshSourcesList();
}

async function refreshSourcesList() {
  const data = await api('/api/sources');
  const list = document.getElementById('sources-list');
  if(!data.length) { list.innerHTML = '<p class="muted">No sources</p>'; return; }
  list.innerHTML = `<table><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Enabled</th><th>Priority</th><th>Weight</th><th>Actions</th></tr></thead><tbody>
    ${data.map(s => `<tr>
      <td>${s.id}</td><td>${s.name}</td><td>${s.type}</td><td>${s.enabled}</td><td>${s.priority}</td><td>${s.mergeWeight}</td>
      <td>
        <button onclick="editSource('${s.id}')">Edit</button>
        <button onclick="toggleSource('${s.id}', ${!s.enabled})">${s.enabled ? 'Disable' : 'Enable'}</button>
        <button onclick="deleteSource('${s.id}')">Delete</button>
      </td>
    </tr>`).join('')}
  </tbody></table>`;
}

async function saveSource(e) {
  e.preventDefault();
  const id = document.getElementById('source-id').value;
  const payload = {
    name: document.getElementById('source-name').value,
    type: document.getElementById('source-type').value,
    url: document.getElementById('source-url').value,
    priority: parseInt(document.getElementById('source-priority').value, 10),
    mergeWeight: parseInt(document.getElementById('source-weight').value, 10),
    enabled: document.getElementById('source-enabled').checked
  };
  const method = id ? 'PUT' : 'POST';
  const endpoint = id ? '/api/sources/' + id : '/api/sources';
  try {
    await api(endpoint, { method, body: JSON.stringify(payload) });
    loadSourcesUI();
  } catch (err) { alert('Error: ' + err.message); }
}

async function editSource(id) {
  const data = await api('/api/sources');
  const s = data.find(x => x.id === id);
  if (!s) return;
  document.getElementById('source-id').value = s.id;
  document.getElementById('source-name').value = s.name;
  document.getElementById('source-type').value = s.type;
  document.getElementById('source-url').value = s.url || '';
  document.getElementById('source-priority').value = s.priority;
  document.getElementById('source-weight').value = s.mergeWeight;
  document.getElementById('source-enabled').checked = s.enabled;
  document.getElementById('form-title').innerText = 'Edit Source';
  document.getElementById('save-btn').innerText = 'Update Source';
}

async function toggleSource(id, enabled) {
  try {
    await api('/api/sources/' + id, { method: 'PUT', body: JSON.stringify({ enabled }) });
    refreshSourcesList();
  } catch (err) { alert('Error: ' + err.message); }
}

async function deleteSource(id) {
  if (!confirm('Delete this source?')) return;
  try {
    await api('/api/sources/' + id, { method: 'DELETE' });
    refreshSourcesList();
  } catch (err) { alert('Error: ' + err.message); }
}

async function runAllImports() {
  try {
    const res = await api('imports/run', { method: 'POST' });
    alert('Imports finished: ' + JSON.stringify(res, null, 2));
    refreshSourcesList();
  } catch (err) { alert('Error running imports'); }
}

async function loadTokensUI() {
  document.getElementById('content').innerHTML = `
    <h2>Export Tokens</h2>
    <div class="card" style="margin-bottom: 2rem; background: white; padding: 1rem; border-radius: 8px;">
      <h3>Create New Token</h3>
      <form onsubmit="createToken(event)">
        <div style="margin-bottom: 1rem;">
          <label>Name: <input type="text" id="token-name" required></label>
        </div>
        <div style="margin-bottom: 1rem;">
          <label>Token (leave blank for random): <input type="text" id="token-value"></label>
        </div>
        <button type="submit">Create Token</button>
      </form>
    </div>
    <h3>Existing Tokens</h3>
    <div id="tokens-list">Loading...</div>
  `;
  refreshTokensList();
}

async function refreshTokensList() {
  const data = await api('/api/export-tokens');
  const list = document.getElementById('tokens-list');
  if(!data.length) { list.innerHTML = '<p class="muted">No tokens</p>'; return; }
  list.innerHTML = `<table><thead><tr><th>ID</th><th>Name</th><th>Token</th><th>Profile ID</th><th>Provider ID</th><th>Active</th><th>Requests</th><th>Actions</th></tr></thead><tbody>
    ${data.map(t => `<tr>
      <td>${t.id}</td><td>${t.name}</td><td><code>${t.tokenPreview || 'hidden'}</code></td><td>${t.profileId || '-'}</td><td>${t.providerId || '-'}</td><td>${t.active}</td><td>${t.requests}</td>
      <td><button onclick="deleteExportToken('${t.id}')">Delete</button></td>
    </tr>`).join('')}
  </tbody></table>`;
}

function generateRandomToken() {
  const array = new Uint8Array(12);
  window.crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function createToken(e) {
  e.preventDefault();
  const name = document.getElementById('token-name').value;
  const tokenValue = document.getElementById('token-value').value;
  const token = tokenValue || generateRandomToken();
  try {
    await api('/api/export-tokens', { method: 'POST', body: JSON.stringify({ name, token }) });
    loadTokensUI();
  } catch (err) { alert('Error: ' + err.message); }
}

async function deleteExportToken(id) {
  if (!confirm('Delete this token?')) return;
  try {
    await api('/api/export-tokens/' + id, { method: 'DELETE' });
    refreshTokensList();
  } catch (err) { alert('Error: ' + err.message); }
}
function cards(data){document.getElementById('cards').innerHTML='<div class="grid">'+Object.entries(data).map(([k,v])=>`<div class="card"><h3>${k}</h3><strong>${v}</strong></div>`).join('')+'</div>'}
async function generateAliases(){document.getElementById('content').innerHTML='<h2>Aliases</h2>'+fmt(await api('aliases/generate',{method:'POST',body:'{}'}));}
async function loadMonitoring(){const r=await fetch('/monitoring/metrics'); document.getElementById('content').innerHTML='<h2>Monitoring</h2><pre>'+JSON.stringify(await r.json(),null,2)+'</pre>'}
load('summary');
