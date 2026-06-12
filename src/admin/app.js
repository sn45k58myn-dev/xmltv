const tokenInput = () => document.getElementById('token');
const content = () => document.getElementById('content');
const cardsEl = () => document.getElementById('cards');

tokenInput().value = localStorage.adminToken || '';

function saveToken() {
  localStorage.adminToken = tokenInput().value.trim();
  tokenInput().value = localStorage.adminToken;
  showNotice('Admin token saved.');
  loadDashboard();
}

function hasAdminToken() {
  return Boolean(tokenInput().value.trim());
}

function showAuthRequired() {
  cardsEl().innerHTML = '';
  content().innerHTML = `
    <h2>Admin token required</h2>
    <p class="muted">Enter your admin token above and click Save to load the dashboard.</p>
  `;
}

async function api(path, opts = {}) {
  if (!hasAdminToken()) {
    showAuthRequired();
    throw new Error('Admin token required. Enter your admin token above and click Save.');
  }

  const url = path.startsWith('/') ? path : '/api/admin/' + path;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      'x-admin-token': tokenInput().value.trim(),
      ...opts.headers
    }
  });

  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }

  if (res.status === 204) {
    return null;
  }

  return res.json();
}

async function errorMessage(res) {
  const text = await res.text();

  try {
    const data = JSON.parse(text);
    return data.error || data.message || text;
  } catch {
    return text;
  }
}

function showNotice(message) {
  content().innerHTML = `<p class="notice">${escapeHtml(message)}</p>`;
}

function showError(error) {
  const message = error.message || String(error);

  if (message.includes('Admin token required')) {
    showAuthRequired();
    return;
  }

  content().innerHTML = `<pre class="error">${escapeHtml(message)}</pre>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return `<code>${escapeHtml(JSON.stringify(value)).slice(0, 180)}</code>`;
  return escapeHtml(String(value)).slice(0, 220);
}

function table(rows) {
  if (!rows || rows.length === 0) return '<p class="muted">No rows</p>';

  const keys = Object.keys(rows[0]).slice(0, 8);

  return `
    <table>
      <thead><tr>${keys.map((key) => `<th>${escapeHtml(key)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map((row) => `<tr>${keys.map((key) => `<td>${fmt(row[key])}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `;
}

function cards(data) {
  cardsEl().innerHTML = `
    <div class="grid">
      ${Object.entries(data).map(([key, value]) => `
        <div class="card">
          <h3>${escapeHtml(key)}</h3>
          <strong>${fmt(value)}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

async function load(name) {
  cardsEl().innerHTML = '';

  if (name === 'sources') return loadSourcesUI();
  if (name === 'export-tokens') return loadTokensUI();
  if (name === 'profiles') return loadProfilesUI();
  if (name === 'summary') return loadDashboard();

  try {
    const data = await api(name);

    content().innerHTML = `<h2>${escapeHtml(name)}</h2>${table(Array.isArray(data) ? data : data.items || [data])}`;
  } catch (error) {
    showError(error);
  }
}

async function fetchJson(path, opts = {}) {
  if (!hasAdminToken()) {
    showAuthRequired();
    throw new Error('Admin token required. Enter your admin token above and click Save.');
  }

  const res = await fetch(path, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      'x-admin-token': tokenInput().value.trim(),
      ...opts.headers
    }
  });

  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }

  return res.json();
}

async function loadDashboard() {
  cardsEl().innerHTML = '';
  content().innerHTML = '<p class="muted">Loading dashboard...</p>';

  try {
    const analytics = await api('analytics');

    cards({
      Channels: analytics.channels,
      Programs: analytics.programs,
      Sources: analytics.sources,
      'Enabled sources': analytics.enabledSources,
      Downloads: analytics.totalDownloads,
      'Cache size': `${fmt(analytics.cacheSizeMB)} MB`,
      'Recent failed imports': analytics.recentFailures
    });
    content().innerHTML = `
      <h2>Dashboard</h2>
      <div class="actions">
        <button onclick="loadDashboardMetadata()">Load metadata</button>
        <button onclick="loadDashboardValidation()">Run validation</button>
        <button onclick="runDashboardImports()">Run imports</button>
      </div>
      <h3>Top Feeds</h3>
      ${table(analytics.topFeeds)}
      <h3>Cached Feeds</h3>
      ${table(analytics.feeds)}
      <h3>Recent Imports</h3>
      ${table(analytics.recentImports)}
      <h3>Recent Failed Imports</h3>
      ${table(analytics.recentFailedImports)}
      <div id="dashboard-detail"></div>
    `;
  } catch (error) {
    showError(error);
  }
}

async function loadDashboardMetadata() {
  const target = document.getElementById('dashboard-detail');
  target.innerHTML = '<p class="muted">Loading metadata...</p>';

  try {
    const metadata = await api('metadata');
    target.innerHTML = `
      <h3>Metadata</h3>
      <p class="muted">Total cache: ${fmt(metadata.totalCacheMegabytes ?? 0)} MB</p>
      ${table(metadata.cachedFeeds)}
      <h3>Country Coverage</h3>
      ${table(metadata.countries)}
    `;
  } catch (error) {
    target.innerHTML = `<pre class="error">${escapeHtml(error.message || String(error))}</pre>`;
  }
}

async function loadDashboardValidation() {
  const target = document.getElementById('dashboard-detail');
  target.innerHTML = '<p class="muted">Running validation...</p>';

  try {
    const validation = await api('validation');
    target.innerHTML = `
      <h3>Validation</h3>
      ${table([{
        valid: validation.valid,
        checked: validation.checked,
        invalid: validation.invalid,
        generatedAt: validation.generatedAt
      }])}
      ${table(validation.feeds)}
    `;
  } catch (error) {
    target.innerHTML = `<pre class="error">${escapeHtml(error.message || String(error))}</pre>`;
  }
}

async function runDashboardImports() {
  const target = document.getElementById('dashboard-detail') || document.getElementById('analytics-detail');
  target.innerHTML = '<p class="muted">Running enabled imports...</p>';

  try {
    const result = await api('imports/run', {
      method: 'POST'
    });
    target.innerHTML = `
      <h3>Import Results</h3>
      ${table(result)}
    `;
  } catch (error) {
    target.innerHTML = `<pre class="error">${escapeHtml(error.message || String(error))}</pre>`;
  }
}

async function loadSourcesUI() {
  cardsEl().innerHTML = '';
  content().innerHTML = `
    <h2>Sources</h2>
    <div class="card">
      <button onclick="runAllImports()">Run All Enabled Imports</button>
    </div>
    <div class="card">
      <h3 id="form-title">Add Source</h3>
      <form id="source-form" onsubmit="saveSource(event)">
        <input type="hidden" id="source-id">
        <label>Name <input type="text" id="source-name" required></label>
        <label>Type
          <select id="source-type" required>
            <option value="url">URL</option>
            <option value="schedules-direct">Schedules Direct</option>
            <option value="iptv-org">IPTV-Org</option>
            <option value="epg.pw">epg.pw</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label>URL <input type="text" id="source-url"></label>
        <label>Priority <input type="number" id="source-priority" value="100"></label>
        <label>Merge Weight <input type="number" id="source-weight" value="100"></label>
        <label class="inline"><input type="checkbox" id="source-enabled" checked> Enabled</label>
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
  try {
    const data = await api('/api/sources');
    const list = document.getElementById('sources-list');

    if (!data.length) {
      list.innerHTML = '<p class="muted">No sources</p>';
      return;
    }

    list.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Type</th><th>Enabled</th><th>Priority</th><th>Weight</th><th>Actions</th></tr></thead>
        <tbody>
          ${data.map((source) => `
            <tr>
              <td>${fmt(source.name)}</td>
              <td>${fmt(source.type)}</td>
              <td>${fmt(source.enabled)}</td>
              <td>${fmt(source.priority)}</td>
              <td>${fmt(source.mergeWeight)}</td>
              <td>
                <button onclick="editSource('${source.id}')">Edit</button>
                <button onclick="toggleSource('${source.id}', ${!source.enabled})">${source.enabled ? 'Disable' : 'Enable'}</button>
                <button onclick="deleteSource('${source.id}')">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (error) {
    showError(error);
  }
}

async function saveSource(event) {
  event.preventDefault();

  const id = document.getElementById('source-id').value;
  const payload = {
    name: document.getElementById('source-name').value,
    type: document.getElementById('source-type').value,
    url: document.getElementById('source-url').value || null,
    priority: Number(document.getElementById('source-priority').value),
    mergeWeight: Number(document.getElementById('source-weight').value),
    enabled: document.getElementById('source-enabled').checked
  };
  const endpoint = id ? `/api/sources/${id}` : '/api/sources';

  try {
    await api(endpoint, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    loadSourcesUI();
  } catch (error) {
    showError(error);
  }
}

async function editSource(id) {
  const sources = await api('/api/sources');
  const source = sources.find((item) => item.id === id);

  if (!source) return;

  document.getElementById('source-id').value = source.id;
  document.getElementById('source-name').value = source.name;
  document.getElementById('source-type').value = source.type;
  document.getElementById('source-url').value = source.url || '';
  document.getElementById('source-priority').value = source.priority;
  document.getElementById('source-weight').value = source.mergeWeight;
  document.getElementById('source-enabled').checked = source.enabled;
  document.getElementById('form-title').innerText = 'Edit Source';
  document.getElementById('save-btn').innerText = 'Update Source';
}

async function toggleSource(id, enabled) {
  try {
    await api(`/api/sources/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled })
    });
    refreshSourcesList();
  } catch (error) {
    showError(error);
  }
}

async function deleteSource(id) {
  if (!confirm('Delete this source?')) return;

  try {
    await api(`/api/sources/${id}`, {
      method: 'DELETE'
    });
    refreshSourcesList();
  } catch (error) {
    showError(error);
  }
}

async function runAllImports() {
  try {
    const result = await api('imports/run', {
      method: 'POST'
    });
    content().innerHTML = `<h2>Imports Complete</h2>${table(result)}`;
  } catch (error) {
    showError(error);
  }
}

async function loadTokensUI() {
  cardsEl().innerHTML = '';
  content().innerHTML = `
    <h2>Export Tokens</h2>
    <div class="card">
      <h3>Create Token</h3>
      <form onsubmit="createToken(event)">
        <label>Name <input type="text" id="token-name" required></label>
        <label>Token <input type="text" id="token-value" placeholder="Leave blank for random"></label>
        <button type="submit">Create Token</button>
      </form>
    </div>
    <h3>Existing Tokens</h3>
    <div id="tokens-list">Loading...</div>
  `;

  refreshTokensList();
}

async function refreshTokensList() {
  try {
    const data = await api('/api/export-tokens');
    const list = document.getElementById('tokens-list');

    if (!data.length) {
      list.innerHTML = '<p class="muted">No tokens</p>';
      return;
    }

    list.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Token</th><th>Profile</th><th>Provider</th><th>Active</th><th>Requests</th><th>Actions</th></tr></thead>
        <tbody>
          ${data.map((token) => `
            <tr>
              <td>${fmt(token.name)}</td>
              <td><code>${escapeHtml(token.tokenPreview || '')}</code></td>
              <td>${fmt(token.profileId || '-')}</td>
              <td>${fmt(token.providerId || '-')}</td>
              <td>${fmt(token.active)}</td>
              <td>${fmt(token.requests)}</td>
              <td><button onclick="deleteExportToken('${token.id}')">Delete</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (error) {
    showError(error);
  }
}

async function loadAuditLog() {
  cardsEl().innerHTML = '';
  content().innerHTML = '<p class="muted">Loading audit log...</p>';

  try {
    const events = await api('audit');

    content().innerHTML = `
      <h2>Audit Log</h2>
      ${table(events.map((event) => ({
        createdAt: event.createdAt,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId || '-',
        actor: event.actor || '-',
        metadata: event.metadata || '-'
      })))}
    `;
  } catch (error) {
    showError(error);
  }
}

function generateRandomToken() {
  const array = new Uint8Array(24);
  window.crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function createToken(event) {
  event.preventDefault();

  try {
    await api('/api/export-tokens', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('token-name').value,
        token: document.getElementById('token-value').value || generateRandomToken()
      })
    });
    loadTokensUI();
  } catch (error) {
    showError(error);
  }
}

async function deleteExportToken(id) {
  if (!confirm('Delete this token?')) return;

  try {
    await api(`/api/export-tokens/${id}`, {
      method: 'DELETE'
    });
    refreshTokensList();
  } catch (error) {
    showError(error);
  }
}

async function loadAnalytics() {
  cardsEl().innerHTML = '';

  try {
    const analytics = await api('analytics');

    cards({
      Channels: analytics.channels,
      Programs: analytics.programs,
      Sources: analytics.sources,
      'Enabled sources': analytics.enabledSources,
      Downloads: analytics.totalDownloads,
      'Cache size': `${fmt(analytics.cacheSizeMB)} MB`,
      'Recent failed imports': analytics.recentFailures
    });
    content().innerHTML = `
      <h2>Analytics</h2>
      <div class="actions">
        <button onclick="loadFeedMetadata()">Load metadata</button>
        <button onclick="loadFeedValidation()">Run validation</button>
        <button onclick="loadFeedQuality()">Score quality</button>
        <button onclick="loadFeedQualityHistory()">Quality history</button>
        <button onclick="runDashboardImports()">Run imports</button>
      </div>
      <h3>Top Feeds</h3>
      ${table(analytics.topFeeds)}
      <h3>Cached Feeds</h3>
      ${table(analytics.feeds)}
      <h3>Recent Imports</h3>
      ${table(analytics.recentImports)}
      <h3>Recent Failed Imports</h3>
      ${table(analytics.recentFailedImports)}
      <div id="analytics-detail"></div>
    `;
  } catch (error) {
    showError(error);
  }
}

async function loadSourceCategories() {
  cardsEl().innerHTML = '';
  content().innerHTML = '<p class="muted">Loading source categories...</p>';

  try {
    const data = await api('source-categories');
    const totalCategories = data.sources.reduce(
      (sum, source) => sum + source.categories,
      0
    );
    const totalPrograms = data.sources.reduce(
      (sum, source) => sum + source.programs,
      0
    );

    cards({
      sources: data.sources.length,
      categoryRows: totalCategories,
      categorizedPrograms: totalPrograms
    });
    content().innerHTML = `
      <h2>Categories By Source</h2>
      <h3>Source Summary</h3>
      ${table(data.sources)}
      <h3>Category Details</h3>
      ${table(data.categories)}
    `;
  } catch (error) {
    showError(error);
  }
}

async function loadFeedMetadata() {
  const target = document.getElementById('analytics-detail');
  target.innerHTML = '<p class="muted">Loading feed metadata...</p>';

  try {
    const metadata = await api('metadata');
    target.innerHTML = `
      <h3>Cached Feed Metadata</h3>
      ${table(metadata.cachedFeeds)}
      <h3>Country Coverage</h3>
      ${table(metadata.countries)}
    `;
  } catch (error) {
    target.innerHTML = `<pre class="error">${escapeHtml(error.message || String(error))}</pre>`;
  }
}

async function loadFeedValidation() {
  const target = document.getElementById('analytics-detail');
  target.innerHTML = '<p class="muted">Validating cached feeds...</p>';

  try {
    const validation = await api('validation');
    target.innerHTML = `
      <h3>Feed Validation</h3>
      ${table(validation.feeds)}
    `;
  } catch (error) {
    target.innerHTML = `<pre class="error">${escapeHtml(error.message || String(error))}</pre>`;
  }
}

async function loadFeedQuality() {
  const target = document.getElementById('analytics-detail');
  target.innerHTML = '<p class="muted">Scoring feed quality...</p>';

  try {
    const quality = await api('quality?snapshot=true');

    target.innerHTML = `
      <h3>Feed Quality</h3>
      ${table([{
        feedCount: quality.feedCount,
        averageScore: quality.averageScore,
        validFeeds: quality.validFeeds,
        invalidFeeds: quality.invalidFeeds,
        generatedAt: quality.generatedAt
      }])}
      ${table(quality.feeds)}
    `;
  } catch (error) {
    target.innerHTML = `<pre class="error">${escapeHtml(error.message || String(error))}</pre>`;
  }
}

async function loadFeedQualityHistory() {
  const target = document.getElementById('analytics-detail');
  target.innerHTML = '<p class="muted">Loading quality history...</p>';

  try {
    const history = await api('quality/history');

    target.innerHTML = `
      <h3>Feed Quality History</h3>
      ${table(history.map((row) => ({
        createdAt: row.createdAt,
        feedKey: row.feedKey,
        score: row.score,
        grade: row.grade,
        valid: row.valid,
        channels: row.channels,
        programs: row.programs,
        bytes: row.bytes,
        reasons: row.reasons || '-'
      })))}
    `;
  } catch (error) {
    target.innerHTML = `<pre class="error">${escapeHtml(error.message || String(error))}</pre>`;
  }
}

async function loadProfilesUI() {
  cardsEl().innerHTML = '';

  try {
    const profiles = await api('profiles');
    content().innerHTML = `
      <h2>Profiles</h2>
      <div class="card">
        <h3>Create Export Profile</h3>
        <form onsubmit="createProfile(event)">
          <label>Name <input id="profile-name" required></label>
          <label>Slug <input id="profile-slug" required></label>
          <label>Country <input id="profile-country" placeholder="US, GB, CA"></label>
          <label>Category <input id="profile-category" placeholder="sports, movies"></label>
          <button type="submit">Create Profile</button>
        </form>
      </div>
      <h3>Existing Profiles</h3>
      ${table(profiles)}
    `;
  } catch (error) {
    showError(error);
  }
}

async function createProfile(event) {
  event.preventDefault();

  try {
    await api('profiles', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('profile-name').value,
        slug: document.getElementById('profile-slug').value,
        country: document.getElementById('profile-country').value || null,
        category: document.getElementById('profile-category').value || null
      })
    });
    loadProfilesUI();
  } catch (error) {
    showError(error);
  }
}

async function mergeChannelsUI() {
  cardsEl().innerHTML = '';

  try {
    const channels = await api('channels');
    const options = channels.map((channel) => `
      <option value="${channel.id}">${escapeHtml(channel.displayName)} (${escapeHtml(channel.xmltvId)})</option>
    `).join('');

    content().innerHTML = `
      <h2>Merge Channels</h2>
      <div class="card">
        <form onsubmit="mergeChannelsSubmit(event)">
          <label>Target Channel
            <select id="merge-target" required>${options}</select>
          </label>
          <label>Channel IDs to merge into target
            <textarea id="merge-ids" rows="5" placeholder="One channel id per line, or comma-separated"></textarea>
          </label>
          <button type="submit">Merge Channels</button>
        </form>
      </div>
      <h3>Channel Reference</h3>
      ${table(channels.map((channel) => ({
        id: channel.id,
        name: channel.displayName,
        xmltvId: channel.xmltvId,
        country: channel.country
      })))}
    `;
  } catch (error) {
    showError(error);
  }
}

async function mergeChannelsSubmit(event) {
  event.preventDefault();

  const channelIdsToMerge = document.getElementById('merge-ids').value
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  try {
    const result = await api('channels/merge', {
      method: 'POST',
      body: JSON.stringify({
        targetChannelId: document.getElementById('merge-target').value,
        channelIdsToMerge
      })
    });
    content().innerHTML = `<h2>Merge Complete</h2>${table([result])}`;
  } catch (error) {
    showError(error);
  }
}

async function generateAliases() {
  cardsEl().innerHTML = '';

  try {
    const channels = await api('channels');
    const options = channels.map((channel) => `
      <option value="${channel.id}">${escapeHtml(channel.displayName)} (${escapeHtml(channel.xmltvId)})</option>
    `).join('');

    content().innerHTML = `
      <h2>Generate Aliases</h2>
      <div class="card">
        <form onsubmit="generateAliasesSubmit(event)">
          <label>Channel
            <select id="alias-channel">
              <option value="">All channels</option>
              ${options}
            </select>
          </label>
          <button type="submit">Generate Aliases</button>
        </form>
      </div>
    `;
  } catch (error) {
    showError(error);
  }
}

async function generateAliasesSubmit(event) {
  event.preventDefault();

  const channelId = document.getElementById('alias-channel').value || undefined;

  try {
    const result = await api('aliases/generate', {
      method: 'POST',
      body: JSON.stringify({ channelId })
    });
    content().innerHTML = `<h2>Aliases Generated</h2>${table([result])}`;
  } catch (error) {
    showError(error);
  }
}

async function loadMonitoring() {
  cardsEl().innerHTML = '';

  try {
    const res = await fetch('/monitoring/metrics');

    if (!res.ok) throw new Error(await res.text());

    const metrics = await res.json();
    cards({
      ok: metrics.ok,
      channels: metrics.channels,
      programs: metrics.programs,
      failedRuns: metrics.failedRuns,
      uptimeSeconds: Math.round(metrics.uptimeSeconds),
      rssMB: Math.round((metrics.memory?.rss ?? 0) / 1024 / 1024)
    });
    content().innerHTML = `
      <h2>Monitoring</h2>
      <h3>Latest Import</h3>
      ${table(metrics.latestRun ? [metrics.latestRun] : [])}
      <h3>Memory</h3>
      ${table([metrics.memory || {}])}
    `;
  } catch (error) {
    showError(error);
  }
}

load('summary');
