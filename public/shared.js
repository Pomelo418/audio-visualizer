// Shared across index.html and index-images.html: accounts, playlists, and the UI for both.

// ---------- Auth ----------
const Auth = {
  TOKEN_KEY: 'av_token',
  currentUser: null,
  getToken() { return localStorage.getItem(this.TOKEN_KEY); },
  setToken(t) { localStorage.setItem(this.TOKEN_KEY, t); },
  clearToken() { localStorage.removeItem(this.TOKEN_KEY); },

  async request(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  async register(username, password) {
    const data = await this.request('/api/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    this.setToken(data.token);
    this.currentUser = data.username;
    window.dispatchEvent(new Event('auth-changed'));
    return data;
  },

  async login(username, password) {
    const data = await this.request('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    this.setToken(data.token);
    this.currentUser = data.username;
    window.dispatchEvent(new Event('auth-changed'));
    return data;
  },

  logout() {
    this.clearToken();
    this.currentUser = null;
    window.dispatchEvent(new Event('auth-changed'));
  },

  async restoreSession() {
    if (!this.getToken()) return null;
    try {
      const data = await this.request('/api/me');
      this.currentUser = data.username;
      window.dispatchEvent(new Event('auth-changed'));
      return data.username;
    } catch {
      this.clearToken();
      return null;
    }
  },
};

// ---------- Playlists ----------
const Playlists = {
  list() { return Auth.request('/api/playlists'); },
  get(id) { return Auth.request(`/api/playlists/${id}`); },
  async create(name) {
    const data = await Auth.request('/api/playlists', { method: 'POST', body: JSON.stringify({ name }) });
    window.dispatchEvent(new Event('playlists-changed'));
    return data;
  },
  async remove(id) {
    const data = await Auth.request(`/api/playlists/${id}`, { method: 'DELETE' });
    window.dispatchEvent(new Event('playlists-changed'));
    return data;
  },
  async addTrack(id, track) {
    const data = await Auth.request(`/api/playlists/${id}/tracks`, { method: 'POST', body: JSON.stringify(track) });
    window.dispatchEvent(new Event('playlists-changed'));
    // Player.queue is a snapshot taken when playback started, not a live view of the playlist —
    // if this playlist is the one currently playing, splice the new track in so it actually plays
    // this session instead of only showing up after the page is reloaded and replayed.
    // NB: Player is declared with `const` in the page's own <script>, so it's reachable as a bare
    // identifier (script-tags share one global lexical scope) but is NOT a property of `window`.
    if (typeof Player !== 'undefined' && Player.currentPlaylistId === id) {
      Player.appendToQueue({ ...track, id: data.id });
    }
    return data;
  },
  async removeTrack(id, trackRowId) {
    const data = await Auth.request(`/api/playlists/${id}/tracks/${trackRowId}`, { method: 'DELETE' });
    window.dispatchEvent(new Event('playlists-changed'));
    return data;
  },
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Login/register modal (built once, reused) ----------
let modalEl = null;
function ensureModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement('div');
  modalEl.className = 'modal-backdrop hidden';
  modalEl.innerHTML = `
    <div class="modal-card">
      <button class="modal-close" type="button">✕ Close</button>
      <div class="modal-tabs">
        <button type="button" data-tab="login" class="active">Log in</button>
        <button type="button" data-tab="register">Sign up</button>
      </div>
      <input type="text" class="modal-username" placeholder="Username" autocomplete="username" />
      <input type="password" class="modal-password" placeholder="Password" autocomplete="current-password" />
      <div class="modal-error"></div>
      <button type="button" class="modal-submit">Log in</button>
    </div>
  `;
  document.body.appendChild(modalEl);

  let mode = 'login';
  const tabs = modalEl.querySelectorAll('.modal-tabs button');
  const usernameInput = modalEl.querySelector('.modal-username');
  const passwordInput = modalEl.querySelector('.modal-password');
  const errorEl = modalEl.querySelector('.modal-error');
  const submitBtn = modalEl.querySelector('.modal-submit');

  function setMode(next) {
    mode = next;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === mode));
    submitBtn.textContent = mode === 'login' ? 'Log in' : 'Create account';
    passwordInput.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    errorEl.textContent = '';
  }
  tabs.forEach(t => { t.onclick = () => setMode(t.dataset.tab); });

  modalEl.querySelector('.modal-close').onclick = () => modalEl.classList.add('hidden');
  modalEl.onclick = (e) => { if (e.target === modalEl) modalEl.classList.add('hidden'); };

  async function submit() {
    errorEl.textContent = '';
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    try {
      if (mode === 'login') await Auth.login(username, password);
      else await Auth.register(username, password);
      modalEl.classList.add('hidden');
      usernameInput.value = '';
      passwordInput.value = '';
    } catch (err) {
      errorEl.textContent = err.message;
    }
  }
  submitBtn.onclick = submit;
  passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

  modalEl._setMode = setMode;
  return modalEl;
}

function openAuthModal(mode = 'login') {
  const el = ensureModal();
  el._setMode(mode);
  el.classList.remove('hidden');
}

// ---------- Auth bar ----------
function initAuthUI(container) {
  function render() {
    container.innerHTML = '';
    if (Auth.currentUser) {
      const wrap = document.createElement('div');
      wrap.className = 'auth-user';
      wrap.innerHTML = `<span>👤 ${Auth.currentUser}</span>`;
      const logoutBtn = document.createElement('button');
      logoutBtn.textContent = 'Log out';
      logoutBtn.onclick = () => Auth.logout();
      wrap.appendChild(logoutBtn);
      container.appendChild(wrap);
    } else {
      const btn = document.createElement('button');
      btn.className = 'auth-pill';
      btn.type = 'button';
      btn.textContent = 'Sign in';
      btn.onclick = () => openAuthModal('login');
      container.appendChild(btn);
    }
  }
  window.addEventListener('auth-changed', render);
  render();
}

// ---------- Playlist panel ----------
function initPlaylistPanel(container, { onPlay }) {
  const expanded = new Set();

  async function render() {
    container.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'playlist-panel';
    const heading = document.createElement('h3');
    heading.textContent = 'My Playlists';
    card.appendChild(heading);

    if (!Auth.currentUser) {
      const locked = document.createElement('div');
      locked.className = 'playlist-locked';
      locked.textContent = 'Sign in to create and play your own playlists.';
      card.appendChild(locked);
      container.appendChild(card);
      return;
    }

    const createRow = document.createElement('div');
    createRow.className = 'playlist-create';
    createRow.innerHTML = `<input type="text" placeholder="New playlist name" /><button type="button">+ Create</button>`;
    const nameInput = createRow.querySelector('input');
    createRow.querySelector('button').onclick = async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      await Playlists.create(name); // triggers 'playlists-changed', which re-renders this panel
    };
    card.appendChild(createRow);

    const playlists = await Playlists.list();
    const list = document.createElement('ul');
    list.className = 'playlist-list';

    for (const pl of playlists) {
      const li = document.createElement('li');
      li.className = 'playlist-row';
      li.innerHTML = `
        <div class="playlist-row-head">
          <span class="playlist-row-title">${pl.name} <span class="playlist-row-count">(${pl.trackCount})</span></span>
          <div class="playlist-row-actions">
            <button type="button" data-action="play">▶ Play</button>
            <button type="button" data-action="shuffle">🔀 Shuffle</button>
            <button type="button" data-action="delete">✕</button>
          </div>
        </div>
      `;
      const tracksHolder = document.createElement('ul');
      tracksHolder.className = 'playlist-tracks';
      tracksHolder.style.display = expanded.has(pl.id) ? 'flex' : 'none';
      li.appendChild(tracksHolder);

      async function loadTracks() {
        const full = await Playlists.get(pl.id);
        tracksHolder.innerHTML = '';
        full.tracks.forEach((t, trackIndex) => {
          const trackLi = document.createElement('li');
          trackLi.style.cursor = 'pointer';
          trackLi.title = 'Play from this track';
          trackLi.innerHTML = `<span>${t.title} — ${t.artist}</span>`;
          trackLi.onclick = () => onPlay(full.tracks, trackIndex, pl.id);
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.textContent = '✕';
          removeBtn.onclick = async (e) => {
            e.stopPropagation();
            await Playlists.removeTrack(pl.id, t.id);
          };
          trackLi.appendChild(removeBtn);
          tracksHolder.appendChild(trackLi);
        });
      }

      li.querySelector('.playlist-row-title').onclick = async () => {
        if (expanded.has(pl.id)) {
          expanded.delete(pl.id);
          tracksHolder.style.display = 'none';
        } else {
          expanded.add(pl.id);
          tracksHolder.style.display = 'flex';
          await loadTracks();
        }
      };
      li.querySelector('[data-action="play"]').onclick = async () => {
        const full = await Playlists.get(pl.id);
        onPlay(full.tracks, 0, pl.id);
      };
      li.querySelector('[data-action="shuffle"]').onclick = async () => {
        const full = await Playlists.get(pl.id);
        onPlay(shuffle(full.tracks), 0, pl.id);
      };
      li.querySelector('[data-action="delete"]').onclick = async () => {
        await Playlists.remove(pl.id);
      };

      list.appendChild(li);
      if (expanded.has(pl.id)) loadTracks();
    }

    card.appendChild(list);
    container.appendChild(card);
  }

  window.addEventListener('auth-changed', render);
  window.addEventListener('playlists-changed', render);
  render();
}

// ---------- Add-to-playlist button (attached to each search result row) ----------
function renderAddToPlaylistButton(track) {
  const wrap = document.createElement('div');
  wrap.className = 'add-to-playlist';
  const btn = document.createElement('button');
  btn.className = 'add-to-playlist-btn';
  btn.type = 'button';
  btn.title = 'Add to playlist';
  btn.textContent = '+';
  const menu = document.createElement('div');
  menu.className = 'add-to-playlist-menu hidden';
  wrap.appendChild(btn);
  wrap.appendChild(menu);

  btn.onclick = async (e) => {
    e.stopPropagation();
    if (!Auth.currentUser) { openAuthModal('login'); return; }
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    if (!willOpen) return;
    menu.innerHTML = 'Loading…';
    const playlists = await Playlists.list();
    menu.innerHTML = '';
    if (playlists.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No playlists yet — create one below';
      empty.style.padding = '8px 10px';
      empty.style.fontSize = '12px';
      empty.style.color = 'var(--text-dim)';
      menu.appendChild(empty);
    }
    playlists.forEach(pl => {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = pl.name;
      item.onclick = async (ev) => {
        ev.stopPropagation();
        await Playlists.addTrack(pl.id, track);
        menu.classList.add('hidden');
      };
      menu.appendChild(item);
    });
  };

  document.addEventListener('click', () => menu.classList.add('hidden'));
  wrap.addEventListener('click', (e) => e.stopPropagation());

  return wrap;
}

Auth.restoreSession();
