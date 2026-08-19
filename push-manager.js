/* CYBERSABIL_PUSH_MANAGER_V1 */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  function secureApi(path, opts = {}) {
    if (typeof window.CyberSabilSecureApi !== 'function') throw new Error('SECURE_API_NOT_READY');
    return window.CyberSabilSecureApi(path, opts);
  }

  function focusNow(input) {
    const run = () => { try { input.focus({ preventScroll: true }); } catch {} };
    requestAnimationFrame(run); setTimeout(run, 80); setTimeout(run, 180);
  }

  function onlyDigits(v) { return String(v || '').replace(/\D+/g, '').slice(0, 6); }

  function makeModal() {
    const overlay = document.createElement('div');
    overlay.className = 'cy-push-manager-overlay';
    const card = document.createElement('div');
    card.className = 'cy-push-manager-card';
    const badge = document.createElement('div'); badge.className = 'cy-push-manager-badge'; badge.textContent = '🔔';
    const title = document.createElement('h2'); title.textContent = 'Phone Alerts';
    const desc = document.createElement('p');
    desc.textContent = 'Ek baar phone enroll karein. Uske baad password login par computer number dikhayega aur phone par notification aayegi.';
    const status = document.createElement('div'); status.className = 'cy-push-manager-status'; status.textContent = 'Checking status…';
    const code = document.createElement('input');
    code.type = 'text'; code.inputMode = 'numeric'; code.autocomplete = 'one-time-code'; code.maxLength = 6;
    code.placeholder = 'Fresh 6-digit authenticator code'; code.className = 'cy-push-manager-code';
    const start = document.createElement('button'); start.type = 'button'; start.className = 'cy-push-manager-btn primary'; start.textContent = 'Create Phone Enrollment QR';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'cy-push-manager-btn secondary'; cancel.textContent = 'Close';
    const qr = document.createElement('div'); qr.className = 'cy-push-manager-qr hidden';
    card.append(badge, title, desc, status, code, start, qr, cancel); overlay.appendChild(card); document.body.appendChild(overlay);
    return { overlay, card, status, code, start, cancel, qr };
  }

  async function openManager() {
    const ui = makeModal();
    let busy = false;
    let timer = null;
    let pollTimer = null;

    const setStatus = (text, tone = '') => {
      ui.status.className = 'cy-push-manager-status' + (tone ? ` ${tone}` : '');
      ui.status.textContent = text;
    };

    const setBusy = on => {
      busy = on;
      ui.code.disabled = on;
      ui.start.disabled = on;
      ui.cancel.disabled = on;
    };

    async function loadStatus() {
      try {
        const s = await secureApi('/api/push/status', { method: 'GET' });
        setStatus(
          s.activeDevices > 0
            ? `${s.activeDevices} phone notification device active ✓`
            : 'Abhi koi phone notification device enrolled nahi hai.',
          s.activeDevices > 0 ? 'success' : ''
        );
      } catch {
        setStatus('Phone alert status load nahi hua.', 'error');
      }
    }

    async function poll(enrollToken) {
      clearTimeout(pollTimer);
      try {
        const s = await secureApi('/api/push/enroll/status', {
          method: 'POST',
          body: JSON.stringify({ enrollToken })
        });
        if (s.status === 'complete') {
          setStatus('Phone notifications enabled ✓ Ab next login par number-match notification aayegi.', 'success');
          ui.code.style.display = 'none';
          ui.start.style.display = 'none';
          ui.qr.classList.add('hidden');
          ui.cancel.disabled = false;
          ui.cancel.textContent = 'Done';
          return;
        }
        if (s.status === 'expired') {
          setBusy(false);
          ui.qr.classList.add('hidden');
          setStatus('Enrollment QR expire ho gaya. Fresh code ke saath naya QR banayein.', 'error');
          focusNow(ui.code);
          return;
        }
        pollTimer = setTimeout(() => poll(enrollToken), 2000);
      } catch {
        pollTimer = setTimeout(() => poll(enrollToken), 2500);
      }
    }

    async function startEnrollment() {
      if (busy) return;
      clearTimeout(timer);
      ui.code.value = onlyDigits(ui.code.value);
      if (!/^\d{6}$/.test(ui.code.value)) {
        setStatus('Fresh 6-digit authenticator code enter karein.', 'error');
        focusNow(ui.code); return;
      }

      try {
        setBusy(true);
        setStatus('Secure enrollment link create ho raha hai…', 'busy');
        const r = await secureApi('/api/push/enroll/start', {
          method: 'POST',
          body: JSON.stringify({ code: ui.code.value })
        });

        ui.code.value = '';
        ui.qr.replaceChildren();
        ui.qr.classList.remove('hidden');
        const canvas = document.createElement('canvas');
        const note = document.createElement('div');
        note.className = 'cy-push-manager-qr-note';
        note.textContent = 'Phone se QR scan karein. Ye sirf initial enrollment ke liye hai; daily login me QR nahi hoga.';
        ui.qr.append(canvas, note);

        if (window.QRCode?.toCanvas) {
          await window.QRCode.toCanvas(canvas, r.enrollUrl, { width: 240, margin: 2 });
        } else {
          const link = document.createElement('a'); link.href = r.enrollUrl; link.textContent = 'Open enrollment link';
          ui.qr.appendChild(link);
        }

        setStatus('QR ready. Phone par page kholkar “Enable Phone Notifications” tap karein.', 'ready');
        ui.cancel.disabled = false;
        poll(r.enrollToken);
      } catch (e) {
        setBusy(false);
        const code = String(e?.message || '');
        if (code === 'MFA_DENIED' || code === 'MFA_CODE_REPLAY') {
          setStatus('Code incorrect, expired, ya already used hai. Fresh code aane ka wait karke retry karein.', 'error');
          ui.code.value = ''; focusNow(ui.code);
        } else {
          setStatus('Enrollment start nahi hua: ' + code, 'error');
        }
      }
    }

    ui.code.addEventListener('input', () => {
      ui.code.value = onlyDigits(ui.code.value);
      clearTimeout(timer);
      if (ui.code.value.length === 6) timer = setTimeout(startEnrollment, 240);
    });
    ui.code.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); startEnrollment(); }
    });
    ui.start.onclick = startEnrollment;
    ui.cancel.onclick = () => { clearTimeout(pollTimer); if (!busy || !ui.cancel.disabled) ui.overlay.remove(); };

    await loadStatus();
    focusNow(ui.code);
  }

  function installButton() {
    const logout = $('logoutBtn');
    if (!logout || $('pushAlertsBtn')) return;

    const oldPasskeyButton = $('addPhonePasskeyBtn');
    if (oldPasskeyButton) oldPasskeyButton.remove();

    const b = document.createElement('button');
    b.id = 'pushAlertsBtn'; b.type = 'button'; b.className = logout.className;
    b.textContent = 'Phone Alerts'; b.title = 'Set up number-match phone notifications';
    b.addEventListener('click', () => openManager().catch(console.error));

    const change = $('changePasswordBtn');
    if (change && change.parentNode === logout.parentNode) logout.parentNode.insertBefore(b, change);
    else logout.parentNode.insertBefore(b, logout);
  }

  function boot() {
    installButton();
    new MutationObserver(installButton).observe(document.documentElement, { subtree: true, childList: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
