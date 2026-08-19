/* CYBERSABIL_PUSH_SETUP_V1 */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const status = $('status');
  const enable = $('enableBtn');
  const token = new URLSearchParams(location.hash.replace(/^#/, '')).get('t') || '';
  let info = null;

  function setStatus(text, tone = '') {
    status.className = 'push-status' + (tone ? ` ${tone}` : '');
    status.textContent = text;
  }

  async function post(path, body) {
    const r = await fetch(self.CyberPushCommon.API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      cache: 'no-store',
    });
    let data = {};
    try { data = await r.json(); } catch {}
    if (!r.ok) {
      const e = new Error(data.error || ('HTTP_' + r.status));
      e.code = data.error || ('HTTP_' + r.status);
      throw e;
    }
    return data;
  }

  async function load() {
    if (!token || token.length < 30) {
      enable.disabled = true;
      setStatus('Enrollment link invalid hai. Computer se naya Phone Alerts QR banayein.', 'error');
      return;
    }

    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (ios && !standalone) {
      $('iosHelp').classList.remove('hidden');
    }

    try {
      info = await post('/auth/push/enroll/info', { enrollToken: token });
      if (!info.vapidPublicKey) throw new Error('VAPID_NOT_READY');
      setStatus('Ready. “Enable Phone Notifications” tap karein.', 'ready');
      enable.disabled = false;
    } catch (e) {
      enable.disabled = true;
      setStatus('Enrollment link expired ya invalid hai. Computer se naya QR banayein.', 'error');
    }
  }

  async function enroll() {
    enable.disabled = true;
    setStatus('Notification permission aur secure phone key prepare ho rahi hai…', 'busy');

    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('PUSH_UNSUPPORTED');
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('NOTIFICATION_PERMISSION_DENIED');

      await navigator.serviceWorker.register('./push-sw.js?v=push2', { scope: './' });
      const reg = await navigator.serviceWorker.ready;
      let subscription = await reg.pushManager.getSubscription();

      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: self.CyberPushCommon.b64urlToBytes(info.vapidPublicKey),
        });
      }

      await self.CyberPushCommon.ensureApprovalKey();
      const publicJwk = await self.CyberPushCommon.publicJwk();

      const result = await post('/auth/push/enroll/finish', {
        enrollToken: token,
        subscription: subscription.toJSON(),
        publicJwk,
        label: navigator.platform || 'Phone',
      });

      await self.CyberPushCommon.setDeviceId(result.deviceId);
      await self.CyberPushCommon.setVapidPublic(info.vapidPublicKey);

      setStatus(
        result.testPushSent
          ? 'Phone notifications enabled ✓ Test notification bhej di gayi hai.'
          : 'Phone enroll ho gaya ✓ Test push abhi deliver nahi hua; notification permission/settings check karein.',
        result.testPushSent ? 'success' : 'warn'
      );
      enable.textContent = 'Phone Enabled ✓';
    } catch (e) {
      enable.disabled = false;
      const code = String(e?.code || e?.name || e?.message || '');
      if (code.includes('permission') || code.includes('DENIED') || code === 'NotAllowedError') {
        setStatus('Notification permission allow karna zaroori hai. Phone settings/browser permission check karein.', 'error');
      } else if (code === 'PUSH_UNSUPPORTED') {
        setStatus('Is browser mode me Web Push available nahi hai. iPhone/iPad par page ko Home Screen web app ke roop me kholna pad sakta hai.', 'error');
      } else {
        setStatus('Phone enrollment complete nahi hua: ' + code, 'error');
      }
    }
  }

  enable.addEventListener('click', enroll);
  load();
})();
