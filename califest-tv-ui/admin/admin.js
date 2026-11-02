/* Califest TV — Admin dashboard
   Edits data/config.json and data/content.json through the server API. */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}`;

  const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const setPath = (obj, path, value) => {
    const keys = path.split('.');
    const last = keys.pop();
    const parent = keys.reduce((o, k) => {
      o[k] = o[k] || {};
      return o[k];
    }, obj);
    parent[last] = value;
  };

  let token = sessionStorage.getItem('cf_token') || '';
  let data = { config: null, content: null };
  let section = 'live';
  let dirty = false;

  const SECTIONS = {
    live: {
      title: 'Live Stream & Now Playing',
      intro: 'Controls the main 24/7 stream and the hero banner at the top of the home page.'
    },
    channels: {
      title: 'Live Channels',
      intro: 'Each channel appears on the Home and Live pages. Clicking one switches the main player to its stream.'
    },
    shows: {
      title: 'Shows',
      intro: 'Shows appear on the Shows page. Tick "Feature on the home page" to show a show on the home page.'
    },
    highlights: {
      title: 'Highlights',
      intro: 'Short clips and replays. They open in the replay lightbox when clicked.'
    },
    events: {
      title: 'Events',
      intro: 'Upcoming events on the home page and the Events page. Enter times in Calabar time (WAT). The site converts them for international viewers.'
    },
    packages: {
      title: 'Sponsor Packages',
      intro: 'Packages listed on the Advertise page. One feature per line in the features box.'
    }
  };

  const LIVE_FIELDS = [
    { root: 'config', path: 'liveStatus', label: 'Channel is on air (untick to show the off-air slate)', type: 'checkbox', full: true },
    { root: 'config', path: 'streamConfig.hlsUrl', label: '24/7 main stream URL (.m3u8)', full: true },
    { root: 'content', path: 'nowPlaying.title', label: 'Now playing title' },
    { root: 'content', path: 'nowPlaying.subtitle', label: 'Now playing subtitle' },
    { root: 'content', path: 'nowPlaying.thumbnail', label: 'Hero poster image URL', full: true }
  ];

  const COLLECTIONS = {
    channels: {
      singular: 'channel',
      titleKey: 'name',
      fields: [
        { key: 'name', label: 'Channel name' },
        { key: 'description', label: 'Short description', type: 'textarea', full: true },
        { key: 'image', label: 'Thumbnail image URL', full: true },
        { key: 'streamUrl', label: 'Stream URL (.m3u8)', full: true }
      ],
      make: () => ({ id: uid('ch'), name: 'New channel', description: '', image: '', streamUrl: '' })
    },
    shows: {
      singular: 'show',
      titleKey: 'title',
      fields: [
        { key: 'title', label: 'Title' },
        { key: 'category', label: 'Category (e.g. Pageant, Bands)' },
        { key: 'badge', label: 'Badge (e.g. ON DEMAND, or leave blank)' },
        { key: 'match', label: 'Match text (e.g. 98% Match)' },
        { key: 'duration', label: 'Duration (e.g. 42m)' },
        { key: 'image', label: 'Thumbnail image URL', full: true },
        { key: 'streamUrl', label: 'Video URL (.m3u8 or .mp4)', full: true },
        { key: 'description', label: 'Description', type: 'textarea', full: true },
        { key: 'featured', label: 'Feature on the home page', type: 'checkbox', full: true }
      ],
      make: () => ({
        id: uid('show'), title: 'New show', category: '', badge: '', match: '', duration: '',
        image: '', streamUrl: '', description: '', featured: false
      })
    },
    highlights: {
      singular: 'highlight',
      titleKey: 'title',
      fields: [
        { key: 'title', label: 'Title' },
        { key: 'category', label: 'Category' },
        { key: 'match', label: 'Match text (e.g. 99% Match)' },
        { key: 'duration', label: 'Duration (e.g. 12m)' },
        { key: 'image', label: 'Thumbnail image URL', full: true },
        { key: 'streamUrl', label: 'Video URL (.m3u8 or .mp4)', full: true },
        { key: 'description', label: 'Description', type: 'textarea', full: true }
      ],
      make: () => ({
        id: uid('hl'), title: 'New highlight', category: 'Highlights', match: '', duration: '',
        image: '', streamUrl: '', description: ''
      })
    },
    events: {
      singular: 'event',
      titleKey: 'title',
      fields: [
        { key: 'title', label: 'Event name' },
        { key: 'start', label: 'Start (Calabar time, WAT)', type: 'datetime' },
        { key: 'location', label: 'Location', full: true }
      ],
      make: () => ({ id: uid('ev'), title: 'New event', start: '', location: '' })
    },
    packages: {
      singular: 'package',
      titleKey: 'name',
      fields: [
        { key: 'name', label: 'Package name' },
        { key: 'badge', label: 'Badge (e.g. Most Popular)' },
        { key: 'description', label: 'Description', type: 'textarea', full: true },
        { key: 'features', label: 'Features (one per line)', type: 'lines', full: true }
      ],
      make: () => ({ name: 'New package', badge: '', description: '', features: [] })
    }
  };

  /* ---------- Auth & API ---------- */
  const $login = $('#login');
  const $app = $('#app');
  const $loginErr = $('#login-err');

  function showLogin(msg = '') {
    $login.hidden = false;
    $app.hidden = true;
    $loginErr.textContent = msg;
  }

  function showApp() {
    $login.hidden = true;
    $app.hidden = false;
  }

  function logout(msg = '') {
    token = '';
    sessionStorage.removeItem('cf_token');
    dirty = false;
    showLogin(msg);
  }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });

    if (res.status === 401 && url !== '/api/login') {
      logout('Your session has ended. Please log in again.');
      throw new Error('Session ended');
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  }

  async function enter() {
    data.config = await api('/api/data/config');
    data.content = await api('/api/data/content');
    showApp();
    render();
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const res = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ password: $('#login-pass').value })
      });
      token = res.token;
      sessionStorage.setItem('cf_token', token);
      $('#login-pass').value = '';
      await enter();
    } catch (err) {
      $loginErr.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  $('#logout').addEventListener('click', () => {
    if (dirty && !confirm('You have unsaved changes. Log out and discard them?')) return;
    logout();
  });

  /* ---------- Dirty state & feedback ---------- */
  function markDirty() {
    dirty = true;
    $('#dirty-note').hidden = false;
  }

  let flashTimer;
  function flash(msg, kind) {
    const el = $('#status');
    el.hidden = false;
    el.className = `status ${kind}`;
    el.textContent = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el.hidden = true; }, kind === 'ok' ? 4000 : 8000);
  }

  async function save() {
    const btn = $('#save-btn');
    btn.disabled = true;
    try {
      await api('/api/data/config', { method: 'PUT', body: JSON.stringify(data.config) });
      await api('/api/data/content', { method: 'PUT', body: JSON.stringify(data.content) });
      dirty = false;
      $('#dirty-note').hidden = true;
      flash('Changes saved and published. Refresh the website to see them.', 'ok');
    } catch (err) {
      flash(err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  }

  $('#save-btn').addEventListener('click', save);

  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* ---------- Rendering ---------- */
  function renderField(root, path, f) {
    const value = getPath(data[root], path);
    const attrs = `data-root="${root}" data-path="${path}" data-type="${f.type || 'text'}"${f.titleField ? ' data-title="1"' : ''}`;
    const cls = f.full ? ' full' : '';

    if (f.type === 'checkbox') {
      return `<label class="fld check${cls}">
        <input type="checkbox" ${attrs} ${value ? 'checked' : ''} />
        <span>${esc(f.label)}</span>
      </label>`;
    }

    let control;
    if (f.type === 'textarea') {
      control = `<textarea class="input" ${attrs}>${esc(value || '')}</textarea>`;
    } else if (f.type === 'lines') {
      control = `<textarea class="input" ${attrs} placeholder="One item per line">${esc((value || []).join('\n'))}</textarea>`;
    } else if (f.type === 'datetime') {
      control = `<input class="input" type="datetime-local" ${attrs} value="${esc(String(value || '').slice(0, 16))}" />`;
    } else {
      control = `<input class="input" type="text" ${attrs} value="${esc(value || '')}" />`;
    }

    return `<label class="fld${cls}"><span>${esc(f.label)}</span>${control}</label>`;
  }

  function renderList(name) {
    const meta = COLLECTIONS[name];
    const items = data.content[name] || [];

    const cards = items.map((item, i) => `
      <div class="item">
        <div class="item-head">
          <span class="item-no">#${i + 1}</span>
          <strong>${esc(item[meta.titleKey] || 'Untitled')}</strong>
          <button class="icon-btn danger" type="button" data-del="${name}" data-idx="${i}" title="Delete" aria-label="Delete">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
        <div class="grid">
          ${meta.fields.map((f) => renderField('content', `${name}.${i}.${f.key}`, {
            ...f,
            titleField: f.key === meta.titleKey
          })).join('')}
        </div>
      </div>`).join('');

    return `
      ${cards || `<div class="empty">No ${meta.singular}s yet.</div>`}
      <button class="btn btn-ghost" type="button" data-add="${name}">
        <i class="fa-solid fa-plus"></i> Add ${meta.singular}
      </button>`;
  }

  function render() {
    document.querySelectorAll('.side nav button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.sec === section);
    });

    const info = SECTIONS[section];
    $('#sec-title').textContent = info.title;

    let body = `<p class="intro">${esc(info.intro)}</p>`;
    if (section === 'live') {
      body += `<div class="card"><div class="grid">
        ${LIVE_FIELDS.map((f) => renderField(f.root, f.path, f)).join('')}
      </div></div>`;
    } else {
      body += renderList(section);
    }

    $('#sec-body').innerHTML = body;
  }

  /* ---------- Event handling ---------- */
  document.querySelectorAll('.side nav button').forEach((btn) => {
    btn.addEventListener('click', () => {
      section = btn.dataset.sec;
      render();
      window.scrollTo(0, 0);
    });
  });

  function onFieldChange(e) {
    const el = e.target;
    const root = el.dataset.root;
    if (!root) return;

    const type = el.dataset.type;
    let value;
    if (type === 'checkbox') value = el.checked;
    else if (type === 'lines') value = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
    else if (type === 'datetime') value = el.value ? `${el.value}:00+01:00` : '';
    else value = el.value;

    setPath(data[root], el.dataset.path, value);

    if (el.dataset.title) {
      const head = el.closest('.item')?.querySelector('.item-head strong');
      if (head) head.textContent = value || 'Untitled';
    }

    markDirty();
  }

  const $body = $('#sec-body');
  $body.addEventListener('input', onFieldChange);
  $body.addEventListener('change', onFieldChange);

  $body.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const name = add.dataset.add;
      data.content[name].push(COLLECTIONS[name].make());
      markDirty();
      render();
      return;
    }

    const del = e.target.closest('[data-del]');
    if (del) {
      const name = del.dataset.del;
      if (!confirm(`Delete this ${COLLECTIONS[name].singular}? This cannot be undone.`)) return;
      data.content[name].splice(Number(del.dataset.idx), 1);
      markDirty();
      render();
    }
  });

  /* ---------- Boot ---------- */
  async function boot() {
    if (token) {
      const ok = await fetch('/api/session', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok)
        .catch(() => false);

      if (ok) {
        try {
          await enter();
          return;
        } catch (err) {
          logout(err.message);
          return;
        }
      }
      logout();
      return;
    }
    showLogin();
  }

  boot();
})();