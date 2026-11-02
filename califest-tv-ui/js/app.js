/* =========================================
   CALIFEST TV — App Engine
   Player · Routing · Views · Modal
   ========================================= */

const ROUTES = {
  watch: 'Home',
  live: 'Live Channels',
  shows: 'Shows',
  events: 'Events',
  about: 'About',
  contact: 'Contact',
  advertise: 'Advertise',
  privacy: 'Privacy Policy'
};

const ICON = {
  play: '<i class="fa-solid fa-play"></i>',
  pause: '<i class="fa-solid fa-pause"></i>',
  sound: '<i class="fa-solid fa-volume-high"></i>',
  muted: '<i class="fa-solid fa-volume-xmark"></i>',
  globe: '<i class="fa-solid fa-globe"></i>',
  check: '<i class="fa-solid fa-circle-check"></i>',
  warn: '<i class="fa-solid fa-triangle-exclamation"></i>',
  bolt: '<i class="fa-solid fa-bolt"></i>',
  clock: '<i class="fa-regular fa-clock"></i>',
  pin: '<i class="fa-solid fa-location-dot"></i>',
  video: '<i class="fa-solid fa-video"></i>',
  tower: '<i class="fa-solid fa-tower-broadcast"></i>'
};

const state = {
  config: null,
  content: null,
  route: 'watch',
  scrolledOut: false,
  dismissed: false,
  saver: false,
  tzLocal: false,
  category: 'All',
  activeChannelId: null,
  currentUrl: null,
  liveMutedBeforeVod: true
};

let hls = null;
let vodHls = null;
let video = null;
let shell = null;

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

/* =========================================
   1. PERSISTENT PLAYER
   ========================================= */
function initPlayer() {
  video = $('califest-video');
  shell = $('player-shell');
  video.muted = true;
  video.poster = state.content.nowPlaying.thumbnail;

  $('play-btn').addEventListener('click', () => {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  });

  $('mute-btn').addEventListener('click', () => {
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 1;
    syncUI();
  });

  $('watch-now-btn').addEventListener('click', () => {
    video.muted = false;
    video.volume = 1;
    video.play().catch(() => {});
    syncUI();
  });

  $('saver-btn').addEventListener('click', toggleSaver);
  $('fs-btn').addEventListener('click', toggleFullscreen);
  $('retry-btn').addEventListener('click', () => loadStream(state.currentUrl));
  $('mini-expand').addEventListener('click', goHome);
  $('mini-close').addEventListener('click', () => {
    state.dismissed = true;
    video.pause();
    updateDock();
  });

  video.addEventListener('play', syncUI);
  video.addEventListener('pause', syncUI);
  video.addEventListener('volumechange', syncUI);

  setupDockObserver();
  setNow(state.content.nowPlaying.title, state.content.nowPlaying.subtitle);
  loadStream(state.config.streamConfig.hlsUrl);
}

function loadStream(url) {
  if (!url) return;
  state.currentUrl = url;
  $('fallback').hidden = true;

  if (hls) {
    hls.destroy();
    hls = null;
  }

  if (state.config.liveStatus === false) {
    $('fallback').hidden = false;
    syncUI();
    return;
  }

  if (window.Hls && window.Hls.isSupported() && url.includes('.m3u8')) {
    hls = new window.Hls({ enableWorker: true, lowLatencyMode: true });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      applySaver();
      video.play().catch(syncUI);
      syncUI();
    });
    hls.on(window.Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) $('fallback').hidden = false;
    });
  } else {
    // Native HLS (iPhone / Safari) or plain video files
    video.src = url;
    video.play().catch(syncUI);
  }

  syncUI();
}

function applySaver() {
  if (!hls) return;
  if (state.saver && hls.levels && hls.levels.length) {
    let lowest = 0;
    hls.levels.forEach((level, i) => {
      if (level.bitrate < hls.levels[lowest].bitrate) lowest = i;
    });
    hls.autoLevelCapping = lowest;
  } else {
    hls.autoLevelCapping = -1;
  }
}

function toggleSaver() {
  state.saver = !state.saver;
  applySaver();
  const btn = $('saver-btn');
  btn.classList.toggle('is-on', state.saver);
  btn.innerHTML = `${ICON.bolt} ${state.saver ? 'Low Data: On' : 'Data Saver'}`;
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else if (shell.requestFullscreen) {
    shell.requestFullscreen();
  } else if (video.webkitEnterFullscreen) {
    video.webkitEnterFullscreen();
  }
}

function syncUI() {
  if (!video) return;
  const silent = video.muted || video.volume === 0;
  $('play-btn').innerHTML = video.paused ? ICON.play : ICON.pause;
  $('mute-btn').innerHTML = silent ? ICON.muted : ICON.sound;
  $('watch-now-btn').innerHTML = silent
    ? `${ICON.play} <span>Watch Now</span>`
    : `${ICON.sound} <span>Playing with Sound</span>`;
}

function setNow(title, subtitle) {
  $('now-title').textContent = title || '';
  $('now-sub').textContent = subtitle || '';
}

function playSource(id) {
  const c = state.content;

  if (id === 'main') {
    state.activeChannelId = null;
    setNow(c.nowPlaying.title, c.nowPlaying.subtitle);
    loadStream(state.config.streamConfig.hlsUrl);
  } else {
    const ch = c.channels.find((x) => x.id === id);
    if (!ch) return;
    state.activeChannelId = id;
    setNow(ch.name, ch.description);
    loadStream(ch.streamUrl);
  }

  document.querySelectorAll('[data-channel]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.channel === state.activeChannelId);
  });

  video.muted = false;
  video.volume = 1;
  syncUI();
  goHome();
}

function goHome() {
  if (state.route === 'watch') {
    state.dismissed = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    updateDock();
  } else {
    location.hash = '#/watch';
  }
}

/* Auto-dock into the floating mini player when the hero scrolls out of view */
function setupDockObserver() {
  if (!('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      state.scrolledOut = !entry.isIntersecting;
      if (entry.isIntersecting && state.route === 'watch') state.dismissed = false;
      updateDock();
    },
    { threshold: 0.3 }
  );

  observer.observe($('player-placeholder'));
}

function updateDock() {
  const onHome = state.route === 'watch';
  const mini = !onHome || state.scrolledOut;

  $('broadcast-stage').classList.toggle('stage--subpage', !onHome);
  shell.classList.toggle('is-mini', mini);
  shell.classList.toggle('is-dismissed', mini && state.dismissed);
  $('hero-card').classList.toggle('is-docked', mini);
}

/* =========================================
   2. ROUTING
   ========================================= */
function currentRoute() {
  const key = location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  return ROUTES[key] ? key : 'watch';
}

const VIEWS = {
  watch: viewHome,
  live: viewLive,
  shows: viewShows,
  events: viewEvents,
  about: viewAbout,
  contact: viewContact,
  advertise: viewAdvertise,
  privacy: viewPrivacy
};

function route() {
  state.route = currentRoute();
  state.dismissed = false;

  document.body.classList.toggle('is-subpage', state.route !== 'watch');
  document.title = state.route === 'watch'
    ? 'Califest TV — Watch Live 24/7'
    : `${ROUTES[state.route]} — Califest TV`;

  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === state.route);
  });

  renderView();
  updateDock();
  updateHeader();

  if (state.route !== 'watch') window.scrollTo(0, 0);
}

function renderView() {
  $('app-view').innerHTML = VIEWS[state.route]();
}

function updateHeader() {
  $('site-header').classList.toggle('is-solid', state.route !== 'watch' || window.scrollY > 40);
}

/* =========================================
   3. FORMATTING HELPERS
   ========================================= */
function updateClock() {
  $('calabar-clock').textContent =
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Lagos',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(new Date()) + ' WAT';
}

function sortedEvents() {
  return (state.content.events || [])
    .filter((e) => !isNaN(new Date(e.start)))
    .sort((a, b) => new Date(a.start) - new Date(b.start));
}

function formatEventTime(iso) {
  const d = new Date(iso);
  const zone = state.tzLocal ? undefined : 'Africa/Lagos';
  const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: zone }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: zone
  }).format(d) + (state.tzLocal ? ' local' : ' WAT');
  return { date, time };
}

function eventRow(ev, detailed) {
  const { date, time } = formatEventTime(ev.start);
  return `
    <div class="event-row">
      <div><span class="ev-date">${esc(date)}</span><span class="ev-dash">-</span>${esc(ev.title)}</div>
      ${detailed
        ? `<span class="ev-meta">${ICON.clock} ${esc(time)} &nbsp;·&nbsp; ${ICON.pin} ${esc(ev.location)}</span>`
        : ''}
    </div>`;
}

function tile(item, tag) {
  const tagClass = tag === 'ON DEMAND' ? 'is-ondemand' : '';
  return `
    <button class="tile" type="button" data-open-vod="${esc(item.id)}">
      <img src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy" />
      ${tag ? `<span class="tile-tag ${tagClass}">${esc(tag)}</span>` : ''}
      <span class="tile-label">${esc(item.title)}</span>
    </button>`;
}

function channelTile(ch) {
  const active = state.activeChannelId === ch.id ? 'is-active' : '';
  return `
    <button class="tile ${active}" type="button" data-channel="${esc(ch.id)}">
      <img src="${esc(ch.image)}" alt="${esc(ch.name)}" loading="lazy" />
      <span class="tile-tag">LIVE</span>
      <span class="tile-label">${esc(ch.name)}</span>
    </button>`;
}

function findItem(id) {
  return [...state.content.shows, ...state.content.highlights].find((i) => i.id === id);
}

/* =========================================
   4. PAGE VIEWS
   ========================================= */
function viewHome() {
  const c = state.content;
  const featured = c.shows.filter((s) => s.featured);
  const featuredShows = (featured.length ? featured : c.shows).slice(0, 2);
  const highlights = c.highlights.slice(0, 2);
  const cutoff = Date.now() - 86400000;
  const upcoming = sortedEvents()
    .filter((e) => new Date(e.start).getTime() >= cutoff)
    .slice(0, 3);

  return `
    <section class="section split">
      <div>
        <div class="section-head"><h3 class="section-title">Featured Shows</h3></div>
        <div class="grid-2">${featuredShows.map((s) => tile(s, s.badge)).join('')}</div>
      </div>
      <div>
        <div class="section-head"><h3 class="section-title">Highlights</h3></div>
        <div class="grid-2">${highlights.map((h) => tile(h)).join('')}</div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h3 class="section-title">Upcoming Events</h3></div>
      <div class="panel">
        ${upcoming.map((e) => eventRow(e, false)).join('') || '<div class="event-row">No upcoming events yet.</div>'}
        <div class="event-foot">
          <a class="btn btn-purple" href="#/events">View Full Schedule</a>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h3 class="section-title">Live Channels</h3></div>
      <div class="grid-4">${c.channels.map(channelTile).join('')}</div>
    </section>

    <div class="go-live">
      <a class="btn btn-red btn-go" href="#/live">${ICON.video} Go Live</a>
    </div>
  `;
}

function viewLive() {
  return `
    <section class="page-hero">
      <h1>Live Festival Feeds</h1>
      <p>Join any channels and jon the festival now</p>
    </section>
    <div class="grid-tiles">${state.content.channels.map(channelTile).join('')}</div>
    <div class="go-live">
      <button class="btn btn-purple" type="button" data-channel="main">${ICON.tower} Back to Califest TV</button>
    </div>`;
}

function viewShows() {
  const shows = state.content.shows;
  const cats = ['All', ...new Set(shows.map((s) => s.category).filter(Boolean))];
  const list = state.category === 'All' ? shows : shows.filter((s) => s.category === state.category);

  return `
    <section class="page-hero">
      <h1>All Shows</h1>
      <p>Pageants, bands, culture, concerts and specials, on demand and live.</p>
    </section>
    <div class="pills">
      ${cats.map((cat) => `
        <button class="pill ${cat === state.category ? 'is-active' : ''}" type="button" data-cat="${esc(cat)}">${esc(cat)}</button>
      `).join('')}
    </div>
    <div class="grid-tiles">${list.map((s) => tile(s, s.badge)).join('')}</div>`;
}

function viewEvents() {
  const events = sortedEvents();
  return `
    <section class="page-hero">
      <h1>Event Schedule</h1>
      <p>Times are shown in ${state.tzLocal ? 'your local timezone' : 'Calabar time (WAT, UTC+1)'}. International viewers can switch to local time in one tap.</p>
      <div class="tz-row">
        <button class="btn btn-purple" type="button" data-tz>
          ${ICON.globe} ${state.tzLocal ? 'Switch to Calabar Time (WAT)' : 'Switch to My Local Time'}
        </button>
      </div>
    </section>
    <div class="panel">
      ${events.map((e) => eventRow(e, true)).join('') || '<div class="event-row">No events scheduled yet.</div>'}
    </div>`;
}

function viewAbout() {
  return `
    <section class="prose">
      <h1>About Califest TV</h1>
      <p>Califest TV is a 24/7 live television channel bringing the Calabar Carnival to viewers in Nigeria and around the world. From the 12km parade route to the stadium stage, we broadcast the bands, the culture, the bikers and the pageants as they happen.</p>
      <h2>What we do</h2>
      <p>We stream live feeds from carnival routes using satellite uplinks, replay the best moments on demand, and publish the full event schedule in Calabar time with local-time conversion for diaspora viewers.</p>
    </section>`;
}

function viewContact() {
  return `
    <section class="page-hero">
      <h1>Contact Us</h1>
      <p>Questions, feedback, or a story from the street? Send us a message.</p>
    </section>
    <form class="form" data-form>
      <div class="form-row">
        <input class="input" name="name" placeholder="Your name" required />
        <input class="input" type="email" name="email" placeholder="Email address" required />
      </div>
      <textarea class="input" name="message" placeholder="Your message" required></textarea>
      <div><button class="btn btn-red" type="submit">Send Message</button></div>
      <p class="form-status" hidden></p>
    </form>`;
}

function viewAdvertise() {
  const pkgs = state.content.packages;
  return `
    <section class="page-hero">
      <h1>Advertise on Califest TV</h1>
      <p>Reach diaspora families, festival visitors and local viewers streaming the carnival 24/7.</p>
    </section>

    <div class="grid-pkg">
      ${pkgs.map((p) => `
        <article class="pkg">
          <span class="pkg-badge">${esc(p.badge)}</span>
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.description)}</p>
          <ul>${(p.features || []).map((f) => `<li>${ICON.check} ${esc(f)}</li>`).join('')}</ul>
          <a class="btn btn-red" href="#/contact">Enquire</a>
        </article>`).join('')}
    </div>

    <section class="section">
      <div class="section-head"><h3 class="section-title">Book a Sponsorship Slot</h3></div>
      <form class="form" data-form>
        <div class="form-row">
          <input class="input" name="brand" placeholder="Company / brand name" required />
          <input class="input" type="email" name="email" placeholder="Work email" required />
        </div>
        <select class="input" name="package">
          ${pkgs.map((p) => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('')}
        </select>
        <textarea class="input" name="notes" placeholder="Campaign goals or preferred dates"></textarea>
        <div><button class="btn btn-red" type="submit">Send Inquiry</button></div>
        <p class="form-status" hidden></p>
      </form>
    </section>`;
}

function viewPrivacy() {
  return `
    <section class="prose">
      <h1>Privacy Policy</h1>
      <p>This page explains how Califest TV handles visitor information. Replace this placeholder text with your final legal wording before launch.</p>
      <h2>Information we collect</h2>
      <p>When you contact us or send a sponsorship inquiry, we receive the details you provide, such as your name, email address and message.</p>
      <h2>How we use it</h2>
      <p>We use this information only to respond to your enquiry and improve the viewing experience.</p>
    </section>`;
}

/* =========================================
   5. REPLAY / SHOW MODAL
   ========================================= */
function openVod(item) {
  const modal = $('vod-modal');
  const vodVideo = $('vod-modal-video');

  $('vod-modal-title').textContent = item.title;
  $('vod-meta').innerHTML = `
    <span class="meta-match">${esc(item.match || '')}</span>
    <span>${esc(item.category || '')}</span>
    <span class="chip">HD</span>
    <span>${esc(item.duration || '')}</span>`;
  $('vod-desc').textContent = item.description || '';
  modal.hidden = false;

  // Mute live TV while a replay plays
  state.liveMutedBeforeVod = video.muted;
  video.muted = true;
  syncUI();

  if (vodHls) {
    vodHls.destroy();
    vodHls = null;
  }

  if (window.Hls && window.Hls.isSupported() && item.streamUrl.includes('.m3u8')) {
    vodHls = new window.Hls();
    vodHls.loadSource(item.streamUrl);
    vodHls.attachMedia(vodVideo);
    vodHls.on(window.Hls.Events.MANIFEST_PARSED, () => vodVideo.play().catch(() => {}));
  } else {
    vodVideo.src = item.streamUrl;
    vodVideo.play().catch(() => {});
  }
}

function closeVod() {
  const vodVideo = $('vod-modal-video');
  vodVideo.pause();
  vodVideo.removeAttribute('src');
  vodVideo.load();

  if (vodHls) {
    vodHls.destroy();
    vodHls = null;
  }

  $('vod-modal').hidden = true;

  if (!state.liveMutedBeforeVod) {
    video.muted = false;
    syncUI();
  }
}

/* =========================================
   6. GLOBAL EVENT DELEGATION
   ========================================= */
document.addEventListener('click', (e) => {
  const vod = e.target.closest('[data-open-vod]');
  if (vod) {
    const item = findItem(vod.dataset.openVod);
    if (item) openVod(item);
    return;
  }

  const channel = e.target.closest('[data-channel]');
  if (channel) {
    playSource(channel.dataset.channel);
    return;
  }

  const cat = e.target.closest('[data-cat]');
  if (cat) {
    state.category = cat.dataset.cat;
    renderView();
    return;
  }

  const tz = e.target.closest('[data-tz]');
  if (tz) {
    state.tzLocal = !state.tzLocal;
    renderView();
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  if (!form.matches('[data-form]')) return;
  e.preventDefault();

  const status = form.querySelector('.form-status');
  status.hidden = false;
  status.innerHTML = `${ICON.check} Thank you! Our team will get back to you shortly.`;
  form.reset();
});

/* =========================================
   7. BOOT
   ========================================= */
async function loadJson(path) {
  const res = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return res.json();
}

async function boot() {
  try {
    const [config, content] = await Promise.all([
      loadJson('data/config.json'),
      loadJson('data/content.json')
    ]);

    state.config = config;
    state.content = content;

    initPlayer();

    updateClock();
    setInterval(updateClock, 30000);

    $('vod-close').addEventListener('click', closeVod);
    $('vod-modal').addEventListener('click', (e) => {
      if (e.target.id === 'vod-modal') closeVod();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('vod-modal').hidden) closeVod();
    });

    window.addEventListener('hashchange', route);
    window.addEventListener('scroll', updateHeader, { passive: true });

    route();
  } catch (err) {
    console.error(err);
    $('app-view').innerHTML = `
      <div class="panel" style="padding: 30px; text-align: center;">
        <h2>${ICON.warn} Califest TV could not load its data</h2>
        <p style="color: var(--muted); margin-top: 8px;">Start the site with <code>node server.js</code> and open http://localhost:3000.</p>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', boot);
