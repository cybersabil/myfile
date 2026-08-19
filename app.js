(() => {
  'use strict';

  const API = 'https://cybersabil-myfile-gateway.multi4u121.workers.dev';
  const { startRegistration, startAuthentication } = SimpleWebAuthnBrowser;
  const $ = (id) => document.getElementById(id);

  const topbar = document.querySelector('.topbar');
  const authLayer = $('authLayer');
  const authText = $('authText');
  const authMsg = $('authMsg');
  const setupBox = $('setupBox');
  const setupCode = $('setupCode');
  const setupBtn = $('setupBtn');
  const loginBtn = $('loginBtn');
  const filesArea = $('filesArea');
  const main = $('main');
  const search = $('search');
  const breadcrumbs = $('breadcrumbs');
  const backBtn = $('backBtn');
  const refreshBtn = $('refreshBtn');
  const viewBtn = $('viewBtn');
  const logoutBtn = $('logoutBtn');
  const previewModal = $('previewModal');
  const previewFrame = $('previewFrame');
  const previewTitle = $('previewTitle');
  const downloadFrame = $('downloadFrame');

  let token = localStorage.getItem('myfile_session') || '';
  let currentPath = '';
  let currentItems = [];
  let stateView = localStorage.getItem('cybersabil-download-view') || 'grid';
  let loading = false;
  let currentSignature = '';

  let turnstileSitekey = '';
  let turnstileWidget = null;
  let turnstilePending = null;
  let deviceKeyPair = null;

  const DEVICE_DB = 'cybersabil-myfile-security';
  const DEVICE_STORE = 'keys';
  const DEVICE_KEY_ID = 'device-v1';

  function b64urlBytes(buf) {
    const a = new Uint8Array(buf); let s = '';
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  async function sha256Text(text) {
    return b64urlBytes(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  }

  function openDeviceDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DEVICE_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DEVICE_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getDeviceKey() {
    if (deviceKeyPair) return deviceKeyPair;
    const db = await openDeviceDB();
    const existing = await new Promise((resolve, reject) => {
      const tx = db.transaction(DEVICE_STORE, 'readonly');
      const r = tx.objectStore(DEVICE_STORE).get(DEVICE_KEY_ID);
      r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error);
    });
    if (existing?.privateKey && existing?.publicKey) { deviceKeyPair = existing; return existing; }
    const kp = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']
    );
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DEVICE_STORE, 'readwrite');
      tx.objectStore(DEVICE_STORE).put({ privateKey: kp.privateKey, publicKey: kp.publicKey }, DEVICE_KEY_ID);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    deviceKeyPair = { privateKey: kp.privateKey, publicKey: kp.publicKey };
    return deviceKeyPair;
  }

  async function devicePublicJwk() {
    const kp = await getDeviceKey();
    return crypto.subtle.exportKey('jwk', kp.publicKey);
  }

  async function addDeviceProof(path, opts, headers) {
    const kp = await getDeviceKey();
    const ts = Math.floor(Date.now() / 1000);
    const nonceBytes = crypto.getRandomValues(new Uint8Array(18));
    const nonce = b64urlBytes(nonceBytes);
    const body = opts.body ? String(opts.body) : '';
    const bh = await sha256Text(['GET','HEAD'].includes(String(opts.method || 'GET').toUpperCase()) ? '' : body);
    const method = String(opts.method || 'GET').toUpperCase();
    const u = new URL(API + path);
    const canonical = `${method}\n${u.pathname}${u.search}\n${ts}\n${nonce}\n${bh}`;
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(canonical)
    );
    headers.set('X-Device-Timestamp', String(ts));
    headers.set('X-Device-Nonce', nonce);
    headers.set('X-Device-Signature', b64urlBytes(sig));
  }

  function initTurnstile() {
    if (!turnstileSitekey || turnstileWidget !== null || !window.turnstile) return;
    turnstileWidget = window.turnstile.render('#turnstileBox', {
      sitekey: turnstileSitekey, size: 'invisible', execution: 'execute', appearance: 'interaction-only',
      callback: (t) => { if (turnstilePending) { const p = turnstilePending; turnstilePending = null; p.resolve(t); } },
      'error-callback': () => { if (turnstilePending) { const p = turnstilePending; turnstilePending = null; p.reject(new Error('TURNSTILE_FAILED')); } },
      'timeout-callback': () => { if (turnstilePending) { const p = turnstilePending; turnstilePending = null; p.reject(new Error('TURNSTILE_TIMEOUT')); } },
    });
  }

  async function turnstileToken() {
    initTurnstile();
    if (turnstileWidget === null || !window.turnstile) throw new Error('TURNSTILE_NOT_READY');
    if (turnstilePending) throw new Error('TURNSTILE_BUSY');
    window.turnstile.reset(turnstileWidget);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { if (turnstilePending) turnstilePending = null; reject(new Error('TURNSTILE_TIMEOUT')); }, 15000);
      turnstilePending = {
        resolve: (t) => { clearTimeout(timeout); resolve(t); },
        reject: (e) => { clearTimeout(timeout); reject(e); },
      };
      window.turnstile.execute('#turnstileBox');
    });
  }

  function setMsg(msg) { authMsg.textContent = msg || ''; }
  function cleanName(v) { return String(v || '').replace(/\/+$/g, ''); }
  function pathParts(path) { return String(path || '').split('/').map(cleanName).filter(Boolean); }
  function joinPath(base, name) { return [...pathParts(base), cleanName(name)].filter(Boolean).join('/'); }

  async function api(path, opts = {}, auth = true) {
    const headers = new Headers(opts.headers || {});
    if (opts.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (auth && token) {
      headers.set('Authorization', 'Bearer ' + token);
      await addDeviceProof(path, opts, headers);
    }
    const r = await fetch(API + path, { ...opts, headers, cache: 'no-store' });
    let data = {};
    try { data = await r.json(); } catch {}
    if (!r.ok) {
      const e = new Error(data.error || ('HTTP_' + r.status));
      e.status = r.status;
      throw e;
    }
    return data;
  }

  function saveSession(t) {
    token = t || '';
    if (token) localStorage.setItem('myfile_session', token);
    else localStorage.removeItem('myfile_session');
  }

  function showAuth(initialized) {
    topbar.classList.add('auth-mode');
    authLayer.classList.remove('hidden');
    filesArea.classList.add('hidden');
    setupBox.classList.toggle('hidden', initialized);
    loginBtn.classList.toggle('hidden', !initialized);
    authText.textContent = initialized
      ? 'Unlock this portal with your registered passkey.'
      : 'First-time setup: enter the one-time setup code.';
  }

  function showFiles() {
    topbar.classList.remove('auth-mode');
    authLayer.classList.add('hidden');
    filesArea.classList.remove('hidden');
  }

  function showSkeleton(count = 8) {
    main.className = 'cy-skeleton-grid';
    main.replaceChildren();
    for (let i = 0; i < count; i++) {
      const x = document.createElement('div');
      x.className = 'cy-skeleton';
      x.setAttribute('aria-hidden','true');
      main.append(x);
    }
  }

  async function status() { const s = await api('/auth/status', { method: 'GET' }, false); turnstileSitekey = s.turnstileSitekey || ''; initTurnstile(); return s; }

  setupBtn.addEventListener('click', async () => {
    setMsg('');
    const code = setupCode.value.trim();
    if (!code) return setMsg('Enter the one-time setup code.');
    setupBtn.disabled = true;
    try {
      const tsToken = await turnstileToken();
      const o = await api('/auth/register/options', {
        method: 'POST', headers: { 'X-Setup-Code': code, 'X-Turnstile-Token': tsToken }, body: '{}'
      }, false);
      const response = await startRegistration({ optionsJSON: o.options });
      const v = await api('/auth/register/verify', {
        method: 'POST', headers: { 'X-Setup-Code': code },
        body: JSON.stringify({ challengeId: o.challengeId, response, devicePublicKey: await devicePublicJwk() })
      }, false);
      if (!v.verified || !v.sessionToken) throw new Error('REGISTRATION_FAILED');
      saveSession(v.sessionToken);
      setupCode.value = '';
      showFiles();
      await load('');
    } catch (e) {
      setMsg('Passkey setup failed: ' + e.message);
    } finally { setupBtn.disabled = false; }
  });

  loginBtn.addEventListener('click', async () => {
    setMsg('');
    loginBtn.disabled = true;
    try {
      const tsToken = await turnstileToken();
      const o = await api('/auth/login/options', { method: 'POST', headers: { 'X-Turnstile-Token': tsToken }, body: '{}' }, false);
      const response = await startAuthentication({ optionsJSON: o.options });
      const v = await api('/auth/login/verify', {
        method: 'POST', body: JSON.stringify({ challengeId: o.challengeId, response, devicePublicKey: await devicePublicJwk() })
      }, false);
      if (!v.verified || !v.sessionToken) throw new Error('LOGIN_FAILED');
      saveSession(v.sessionToken);
      showFiles();
      await load(currentPath || '');
    } catch (e) {
      setMsg('Login failed: ' + e.message);
    } finally { loginBtn.disabled = false; }
  });

  logoutBtn.addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
    saveSession('');
    previewFrame.src = 'about:blank';
    previewModal.classList.add('hidden');
    const st = await status();
    showAuth(Boolean(st.initialized));
  });

  function formatBytes(bytes) {
    const n0 = Number(bytes || 0);
    if (n0 < 1024) return n0 + ' B';
    const units = ['KB','MB','GB','TB'];
    let n = n0, i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
    return (n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.00$/, '') + ' ' + units[i];
  }

  function iconFor(item) {
    if (item.isDir) return '📁';
    const n = String(item.name || '').toLowerCase();
    const e = n.includes('.') ? n.split('.').pop() : '';
    if (['png','jpg','jpeg','gif','webp','svg','bmp','ico'].includes(e)) return '🖼️';
    if (['mp4','mkv','mov','avi','webm','m4v'].includes(e)) return '🎬';
    if (['mp3','wav','m4a','aac','flac','ogg'].includes(e)) return '🎵';
    if (['zip','7z','rar','tar','gz','tgz','bz2','xz'].includes(e)) return '📦';
    if (e === 'pdf') return '📕';
    if (['json','xml','yaml','yml','csv'].includes(e)) return '🧾';
    if (['sh','py','js','ts','html','css','ps1','bat','cmd'].includes(e)) return '🧩';
    if (['doc','docx','odt'].includes(e)) return '📝';
    if (['xls','xlsx','ods'].includes(e)) return '📊';
    if (['ppt','pptx','odp'].includes(e)) return '📽️';
    return '📄';
  }

  function renderBreadcrumbs() {
    breadcrumbs.replaceChildren();
    const root = document.createElement('button');
    root.className = 'crumb'; root.type = 'button'; root.textContent = '🏠 Public Downloads';
    root.addEventListener('click', () => load(''));
    breadcrumbs.append(root);

    let acc = '';
    for (const seg of pathParts(currentPath)) {
      const sep = document.createElement('span'); sep.className = 'sep'; sep.textContent = '›';
      breadcrumbs.append(sep);
      acc = joinPath(acc, seg);
      const b = document.createElement('button');
      b.className = 'crumb'; b.type = 'button'; b.textContent = seg;
      const p = acc; b.addEventListener('click', () => load(p));
      breadcrumbs.append(b);
    }
    backBtn.disabled = !currentPath;
  }

  async function ticket(kind, path) {
    return api('/api/ticket', { method: 'POST', body: JSON.stringify({ kind, path }) });
  }

  async function openFile(path, name) {
    try {
      const t = await ticket('open', path);
      previewTitle.textContent = name;
      previewFrame.src = API + '/stream?t=' + encodeURIComponent(t.ticket);
      previewModal.classList.remove('hidden');
    } catch (e) { alert('Open failed: ' + e.message); }
  }

  async function download(kind, path) {
    try {
      const t = await ticket(kind, path);
      downloadFrame.src = API + '/stream?t=' + encodeURIComponent(t.ticket);
    } catch (e) { alert('Download failed: ' + e.message); }
  }

  function render() {
    renderBreadcrumbs();
    const term = search.value.trim().toLowerCase();
    const items = [...currentItems]
      .sort((a,b) => {
        if (Boolean(a.isDir) !== Boolean(b.isDir)) return a.isDir ? -1 : 1;
        return String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' });
      })
      .filter(x => !term || String(x.name || '').toLowerCase().includes(term));

    if (!items.length) {
      main.className = 'empty';
      main.textContent = term ? 'No matching files or folders.' : 'This folder is empty.';
      updateViewButton();
      return;
    }

    main.className = 'grid' + (stateView === 'list' ? ' list' : '');
    main.replaceChildren();

    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'item' + (item.isDir ? ' folder' : '');
      card.tabIndex = 0;
      card.setAttribute('role','group');

      const icon = document.createElement('div');
      icon.className = 'icon'; icon.textContent = iconFor(item);
      const name = document.createElement('div');
      name.className = 'name'; name.textContent = cleanName(item.name) || '(unnamed)'; name.title = cleanName(item.name);
      const size = document.createElement('div');
      size.className = 'sub size'; size.textContent = item.isDir ? 'Folder' : formatBytes(item.size);
      const modified = document.createElement('div');
      modified.className = 'sub modified'; modified.textContent = '';
      const actions = document.createElement('div');
      actions.className = 'actions';
      const path = joinPath(currentPath, item.name);

      card.append(icon, name, size, modified);

      if (item.isDir) {
        const openBtn = document.createElement('button');
        openBtn.className = 'action secondary'; openBtn.type = 'button'; openBtn.textContent = 'Open';
        openBtn.addEventListener('click', e => { e.stopPropagation(); load(path); });
        const zipBtn = document.createElement('button');
        zipBtn.className = 'action'; zipBtn.type = 'button'; zipBtn.textContent = 'Download ZIP';
        zipBtn.addEventListener('click', e => { e.stopPropagation(); download('folder', path); });
        actions.append(openBtn, zipBtn); card.append(actions);
        card.title = 'Open folder'; card.addEventListener('click', () => load(path));
      } else {
        const openBtn = document.createElement('button');
        openBtn.className = 'action secondary'; openBtn.type = 'button'; openBtn.textContent = 'Open';
        openBtn.addEventListener('click', e => { e.stopPropagation(); openFile(path, item.name); });
        const dlBtn = document.createElement('button');
        dlBtn.className = 'action'; dlBtn.type = 'button'; dlBtn.textContent = 'Download'; dlBtn.title = 'Download file';
        dlBtn.addEventListener('click', e => { e.stopPropagation(); download('file', path); });
        actions.append(openBtn, dlBtn); card.append(actions);
      }
      card.addEventListener('keydown', e => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        if (item.isDir) load(path);
        else openFile(path, item.name);
      });
      main.append(card);
    }
    updateViewButton();
  }

  function updateViewButton() { viewBtn.textContent = stateView === 'grid' ? '☷ List' : '▦ Grid'; }

  async function load(path, silent = false) {
    if (loading) return;
    loading = true;
    if (!silent) showSkeleton();
    try {
      const d = await api('/api/list?path=' + encodeURIComponent(path || ''), { method: 'GET' });
      const nextPath = d.path || '';
      const nextItems = Array.isArray(d.items) ? d.items : [];
      const nextSignature = JSON.stringify([nextPath,nextItems]);
      if (silent && nextSignature === currentSignature) return;
      currentPath = nextPath;
      currentItems = nextItems;
      currentSignature = nextSignature;
      showFiles(); render();
    } catch (e) {
      if (e.status === 401) {
        saveSession('');
        const st = await status();
        showAuth(Boolean(st.initialized));
      } else if (!silent) {
        main.className = 'error';
        main.textContent = 'Could not load this folder: ' + e.message;
      }
    } finally { loading = false; }
  }

  backBtn.addEventListener('click', () => {
    const p = pathParts(currentPath); p.pop(); search.value = ''; load(p.join('/'));
  });
  refreshBtn.addEventListener('click', () => load(currentPath));
  search.addEventListener('input', render);
  search.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      search.value = '';
      render();
      search.blur();
      return;
    }
    if (e.key !== 'Enter') return;
    const term = search.value.trim().toLowerCase();
    const matches = currentItems.filter(x => !term || String(x.name || '').toLowerCase().includes(term));
    if (matches.length !== 1) return;
    e.preventDefault();
    const item = matches[0];
    const p = joinPath(currentPath, item.name);
    if (item.isDir) load(p);
    else openFile(p, item.name);
  });
  viewBtn.addEventListener('click', () => {
    stateView = stateView === 'grid' ? 'list' : 'grid';
    localStorage.setItem('cybersabil-download-view', stateView); render();
  });
  $('closePreview').addEventListener('click', () => { previewFrame.src = 'about:blank'; previewModal.classList.add('hidden'); });
  previewModal.addEventListener('click', e => {
    if (e.target === previewModal) { previewFrame.src = 'about:blank'; previewModal.classList.add('hidden'); }
  });


  window.addEventListener('cybersabil:session-ready', async (e) => {
    const sessionToken = e?.detail?.sessionToken || '';
    if (!sessionToken) return;
    saveSession(sessionToken);
    document.documentElement.classList.add('cy-auth-handoff');
    showFiles();
    showSkeleton();
    try {
      await load(currentPath || '');
    } finally {
      requestAnimationFrame(() => {
        document.documentElement.classList.remove('cy-auth-handoff');
      });
    }
  });

  async function boot() {
    try {
      const st = await status();
      if (token) {
        try { await api('/api/me', { method: 'GET' }); showFiles(); await load(''); return; }
        catch { saveSession(''); }
      }
      showAuth(Boolean(st.initialized));
    } catch (e) {
      setMsg('Backend unavailable: ' + e.message); showAuth(true);
    }
  }

  setInterval(() => { if (!authLayer.classList.contains('hidden')) return; load(currentPath, true); }, 20000);
  boot();
})();
