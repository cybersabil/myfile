/* CYBERSABIL_PUSH_COMMON_V1 */
(() => {
  'use strict';

  const API = 'https://cybersabil-myfile-gateway.multi4u121.workers.dev';
  const DB_NAME = 'cybersabil-push-mfa';
  const STORE = 'state';
  const KEY_ID = 'approval-key-v1';
  const DEVICE_ID = 'device-id-v1';
  const VAPID_ID = 'vapid-public-v1';

  function b64urlBytes(buf) {
    const a = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < a.length; i += 0x8000) {
      s += String.fromCharCode(...a.subarray(i, i + 0x8000));
    }
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function b64urlToBytes(value) {
    let s = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const raw = atob(s);
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function get(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(id);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(r.error);
    });
  }

  async function put(id, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function ensureApprovalKey() {
    const existing = await get(KEY_ID);
    if (existing?.privateKey && existing?.publicKey) return existing;

    const kp = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify']
    );

    const value = { privateKey: kp.privateKey, publicKey: kp.publicKey };
    await put(KEY_ID, value);
    return value;
  }

  async function publicJwk() {
    const kp = await ensureApprovalKey();
    return crypto.subtle.exportKey('jwk', kp.publicKey);
  }

  async function setDeviceId(value) {
    await put(DEVICE_ID, String(value || ''));
  }

  async function getDeviceId() {
    return String((await get(DEVICE_ID)) || '');
  }

  async function setVapidPublic(value) {
    await put(VAPID_ID, String(value || ''));
  }

  async function getVapidPublic() {
    return String((await get(VAPID_ID)) || '');
  }

  async function signedHeaders(path, bodyText) {
    const deviceId = await getDeviceId();
    if (!deviceId) throw new Error('PUSH_DEVICE_NOT_ENROLLED');

    const kp = await ensureApprovalKey();
    const ts = Math.floor(Date.now() / 1000);
    const nonceBytes = crypto.getRandomValues(new Uint8Array(18));
    const nonce = b64urlBytes(nonceBytes);
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bodyText))
    );
    const bodyHash = bytesToHex(digest);
    const canonical = `POST\n${path}\n${ts}\n${nonce}\n${bodyHash}`;
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      kp.privateKey,
      new TextEncoder().encode(canonical)
    );

    return {
      'Content-Type': 'application/json',
      'X-Push-Device-Id': deviceId,
      'X-Push-Timestamp': String(ts),
      'X-Push-Nonce': nonce,
      'X-Push-Signature': b64urlBytes(sig),
    };
  }

  async function signedFetch(path, body) {
    const bodyText = JSON.stringify(body || {});
    const headers = await signedHeaders(path, bodyText);
    const r = await fetch(API + path, {
      method: 'POST',
      headers,
      body: bodyText,
      cache: 'no-store',
    });
    let data = {};
    try { data = await r.json(); } catch {}
    if (!r.ok) {
      const e = new Error(data.error || ('HTTP_' + r.status));
      e.code = data.error || ('HTTP_' + r.status);
      e.status = r.status;
      throw e;
    }
    return data;
  }

  self.CyberPushCommon = {
    API,
    b64urlToBytes,
    ensureApprovalKey,
    publicJwk,
    setDeviceId,
    getDeviceId,
    setVapidPublic,
    getVapidPublic,
    signedFetch,
  };
})();
