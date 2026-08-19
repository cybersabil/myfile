/* CYBERSABIL_GLOBAL_KEYBOARD_UX_V1 */

(() => {
  'use strict';

  const API =
    'https://cybersabil-myfile-gateway.multi4u121.workers.dev';

  const SESSION_KEY='myfile_session';
  const MODE_KEY='myfile_auth_mode';
  const USER_KEY='myfile_username';

  const chainedFetch=window.fetch.bind(window);
  const te=new TextEncoder();

  let sitekey='';
  let loginTurnstileId=null;
  let loginTurnstileToken='';
  let turnstileLoadPromise=null;

  function injectStyles() {
    if (document.getElementById('cybersabilKeyboardUxStyle')) return;

    const style=document.createElement('style');
    style.id='cybersabilKeyboardUxStyle';
    style.textContent=`
      .cy-inline-note{
        margin-top:10px;
        font-size:11px;
        line-height:1.45;
        min-height:16px;
      }
      .cy-inline-note.error{ color:#b14646; }
      .cy-inline-note.success{ color:#1f7a57; }
      .cy-inline-note.muted{ color:#8b96a8; }

      .cy-input-error{
        border-color:#e36b6b !important;
        box-shadow:0 0 0 3px rgba(227,107,107,.10) !important;
      }

      .cy-shake{
        animation:cyshake .35s ease;
      }

      @keyframes cyshake{
        0%{transform:translateX(0)}
        20%{transform:translateX(-7px)}
        40%{transform:translateX(7px)}
        60%{transform:translateX(-5px)}
        80%{transform:translateX(5px)}
        100%{transform:translateX(0)}
      }
    `;
    document.head.appendChild(style);
  }

  function visible(el) {
    return Boolean(
      el &&
      el.isConnected &&
      el.offsetParent !== null &&
      getComputedStyle(el).visibility !== 'hidden'
    );
  }

  function b64url(bytes) {
    let s='';
    for (const b of new Uint8Array(bytes))
      s+=String.fromCharCode(b);

    return btoa(s)
      .replace(/\+/g,'-')
      .replace(/\//g,'_')
      .replace(/=+$/g,'');
  }

  function randomNonce() {
    const b=new Uint8Array(18);
    crypto.getRandomValues(b);
    return b64url(b);
  }

  async function sha256(text) {
    return b64url(
      await crypto.subtle.digest(
        'SHA-256',
        te.encode(text)
      )
    );
  }

  function onlyDigits(v) {
    return String(v || '').replace(/\D+/g,'');
  }

  function shake(el) {
    if (!el) return;
    el.classList.remove('cy-shake');
    void el.offsetWidth;
    el.classList.add('cy-shake');
    setTimeout(() => el.classList.remove('cy-shake'), 420);
  }

  function setNote(node, text='', tone='muted') {
    if (!node) return;
    node.className='cy-inline-note ' + tone;
    node.textContent=text || '';
  }

  function clearInputError(...inputs) {
    inputs.flat().forEach(x => x?.classList?.remove('cy-input-error'));
  }

  function markInputError(input) {
    input?.classList?.add('cy-input-error');
  }

  function focusInputNow(input) {
    if (!input || !visible(input)) return;

    input.autofocus=true;

    const run = () => {
      try {
        input.focus({preventScroll:true});
        if (typeof input.setSelectionRange === 'function') {
          const n = input.value?.length || 0;
          input.setSelectionRange(n,n);
        }
      } catch {}
    };

    requestAnimationFrame(run);
    setTimeout(run, 50);
    setTimeout(run, 160);
  }

  function enterSubmits(input, callback) {
    if (!input || !callback) return;

    input.addEventListener('keydown', e => {
      if (
        e.key !== 'Enter' ||
        e.shiftKey ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        e.isComposing
      ) return;

      e.preventDefault();
      callback();
    });
  }

  function autoSubmitSixDigits(input, callback) {
    if (!input || !callback) return;

    let timer=null;

    input.addEventListener('input', () => {
      input.value = onlyDigits(input.value).slice(0,6);
      clearTimeout(timer);

      if (input.value.length === 6) {
        timer = setTimeout(() => {
          callback();
        }, 240);
      }
    });
  }

  function openDeviceDB() {
    return new Promise((resolve,reject)=>{
      const r=indexedDB.open(
        'cybersabil-password-device-v1',
        1
      );

      r.onupgradeneeded=()=>{
        r.result.createObjectStore('keys');
      };

      r.onsuccess=()=>resolve(r.result);
      r.onerror=()=>reject(r.error);
    });
  }

  async function getPasswordDevice() {
    const db=await openDeviceDB();

    const existing=await new Promise((resolve,reject)=>{
      const tx=db.transaction('keys','readonly');
      const r=tx.objectStore('keys').get('device');

      r.onsuccess=()=>resolve(r.result || null);
      r.onerror=()=>reject(r.error);
    });

    if (existing?.privateKey && existing?.publicJwk)
      return existing;

    const pair=await crypto.subtle.generateKey(
      {
        name:'ECDSA',
        namedCurve:'P-256'
      },
      true,
      ['sign','verify']
    );

    const publicJwk=
      await crypto.subtle.exportKey(
        'jwk',
        pair.publicKey
      );

    const privateJwk=
      await crypto.subtle.exportKey(
        'jwk',
        pair.privateKey
      );

    const privateKey=
      await crypto.subtle.importKey(
        'jwk',
        privateJwk,
        {
          name:'ECDSA',
          namedCurve:'P-256'
        },
        false,
        ['sign']
      );

    const value={privateKey,publicJwk};

    await new Promise((resolve,reject)=>{
      const tx=db.transaction('keys','readwrite');

      tx.objectStore('keys').put(
        value,
        'device'
      );

      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
    });

    return value;
  }

  async function signPasswordRequest(req) {
    const device=await getPasswordDevice();

    const body=
      ['GET','HEAD'].includes(req.method)
        ? ''
        : await req.clone().text();

    const ts=String(
      Math.floor(Date.now()/1000)
    );

    const nonce=randomNonce();

    const canonical=[
      req.method.toUpperCase(),
      new URL(req.url).pathname,
      ts,
      nonce,
      await sha256(body)
    ].join('\n');

    const sig=await crypto.subtle.sign(
      {
        name:'ECDSA',
        hash:'SHA-256'
      },
      device.privateKey,
      te.encode(canonical)
    );

    const h=new Headers(req.headers);

    const token=
      localStorage.getItem(SESSION_KEY) || '';

    if (token)
      h.set('Authorization','Bearer '+token);

    h.set('X-Password-Device-Timestamp',ts);
    h.set('X-Password-Device-Nonce',nonce);
    h.set(
      'X-Password-Device-Signature',
      b64url(sig)
    );

    return new Request(req,{headers:h});
  }

  window.fetch=async function(input,init) {
    let req;

    try {
      req=new Request(input,init);
    } catch {
      return chainedFetch(input,init);
    }

    const u=new URL(req.url);

    const passwordMode=
      localStorage.getItem(MODE_KEY)==='password';

    if (
      passwordMode &&
      u.origin===new URL(API).origin &&
      (
        u.pathname.startsWith('/api/') ||
        u.pathname==='/auth/logout'
      )
    ) {
      req=await signPasswordRequest(req);
    }

    const response=await chainedFetch(req);

    if (
      (
        u.pathname.endsWith('/auth/login/verify') ||
        u.pathname.endsWith('/auth/register/verify')
      ) &&
      response.ok
    ) {
      try {
        const d=await response.clone().json();

        if (d?.verified && d?.sessionToken)
          localStorage.setItem(MODE_KEY,'passkey');
      } catch {}
    }

    if (
      u.pathname==='/auth/logout' &&
      response.ok
    ) {
      localStorage.removeItem(MODE_KEY);
    }

    return response;
  };

  async function post(path,body,turnstileToken='') {
    const h={
      'Content-Type':'application/json'
    };

    if (turnstileToken)
      h['X-Turnstile-Token']=turnstileToken;

    const r=await chainedFetch(API+path,{
      method:'POST',
      headers:h,
      body:JSON.stringify(body),
      cache:'no-store'
    });

    let d={};

    try { d=await r.json(); } catch {}

    if (!r.ok) {
      const err=new Error(
        d.error || d.message || ('HTTP_'+r.status)
      );
      err.code = d.error || ('HTTP_'+r.status);
      err.status = r.status;
      err.payload = d;
      throw err;
    }

    return d;
  }

  function makeOverlay(title) {
    const bg=document.createElement('div');
    bg.className='cy-mfa-overlay';

    bg.style.cssText=
      'position:fixed;inset:0;z-index:2147483647;'+
      'display:flex;align-items:center;justify-content:center;'+
      'background:rgba(8,12,18,.52);padding:18px;';

    const box=document.createElement('div');
    box.className='cy-mfa-card';

    box.style.cssText=
      'box-sizing:border-box;width:min(420px,100%);max-height:92vh;'+
      'overflow:auto;background:#fff;color:#111;'+
      'border-radius:16px;padding:22px;'+
      'font-family:system-ui,sans-serif;'+
      'box-shadow:0 22px 60px rgba(0,0,0,.18);';

    const h=document.createElement('h2');
    h.textContent=title;
    h.style.cssText=
      'margin:0 0 12px;font-size:22px;'+
      'line-height:1.2;color:#182132;';

    box.appendChild(h);
    bg.appendChild(box);
    document.body.appendChild(bg);

    return {bg,box};
  }

  function field(type,placeholder,value='') {
    const x=document.createElement('input');
    x.className='cy-modal-input';

    x.type=type;
    x.placeholder=placeholder;
    x.value=value;

    x.style.cssText=
      'box-sizing:border-box;width:100%;padding:12px;'+
      'margin:7px 0;border:1px solid #d9e0ea;border-radius:10px;'+
      'font-size:15px;background:#fff;color:#172033;outline:none;';

    return x;
  }

  function btn(label,secondary=false) {
    const b=document.createElement('button');
    b.className='cy-modal-btn '+(secondary?'secondary':'primary');

    b.type='button';
    b.textContent=label;

    b.style.cssText=
      'box-sizing:border-box;width:100%;padding:12px;'+
      'margin-top:10px;border:0;border-radius:10px;'+
      'cursor:pointer;font-weight:700;font-size:13px;'+
      (secondary
        ? 'background:#eef2f7;color:#243149;'
        : 'background:#111;color:#fff;');

    return b;
  }

  function findSearchInput() {
    const selectors = [
      '#searchInput',
      '#search',
      'input[type="search"]',
      'input[placeholder*="search" i]',
      'input[aria-label*="search" i]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (visible(el)) return el;
    }
    return null;
  }

  function installGlobalSearchHotkeys() {
    if (window.__cySearchHotkeysInstalled) return;
    window.__cySearchHotkeysInstalled = true;

    document.addEventListener('keydown', e => {
      const active = document.activeElement;
      const typing =
        active &&
        (active.tagName === 'INPUT' ||
         active.tagName === 'TEXTAREA' ||
         active.isContentEditable);

      if (
        !typing &&
        (
          (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) ||
          ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')
        )
      ) {
        const input = findSearchInput();
        if (input) {
          e.preventDefault();
          focusInputNow(input);
        }
      }

      if (
        active &&
        active === findSearchInput() &&
        e.key === 'Escape'
      ) {
        active.value = '';
        active.dispatchEvent(new Event('input',{bubbles:true}));
      }
    });
  }

  function ensureTurnstile() {
    if (
      window.turnstile &&
      typeof window.turnstile.render === 'function'
    ) {
      return Promise.resolve();
    }

    if (turnstileLoadPromise)
      return turnstileLoadPromise;

    turnstileLoadPromise = new Promise((resolve,reject) => {
      const started = Date.now();

      let script = Array.from(document.scripts).find(x =>
        String(x.src || '').includes(
          'challenges.cloudflare.com/turnstile/v0/api.js'
        )
      );

      if (!script) {
        script=document.createElement('script');
        script.src=
          'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.defer=true;
        document.head.appendChild(script);
      }

      script.addEventListener(
        'error',
        () => reject(
          new Error('TURNSTILE_SCRIPT_BLOCKED')
        ),
        {once:true}
      );

      const poll=() => {
        if (
          window.turnstile &&
          typeof window.turnstile.render === 'function'
        ) {
          resolve();
          return;
        }

        if (Date.now()-started > 15000) {
          reject(
            new Error('TURNSTILE_NOT_READY')
          );
          return;
        }

        setTimeout(poll,100);
      };

      poll();
    });

    return turnstileLoadPromise;
  }

  async function getSitekey() {
    if (sitekey) return sitekey;

    const r=await chainedFetch(
      API+'/auth/status',
      {cache:'no-store'}
    );

    if (!r.ok)
      throw new Error('TURNSTILE_STATUS_FAILED');

    const d=await r.json();

    sitekey=d.turnstileSitekey || '';

    if (!sitekey)
      throw new Error('TURNSTILE_SITEKEY_MISSING');

    return sitekey;
  }

  async function addTurnstile(container,onToken) {
    container.innerHTML='';

    container.style.cssText=
      'box-sizing:border-box;width:100%;min-height:65px;margin:10px 0 12px;';

    const loading=document.createElement('div');
    loading.textContent='Loading security check…';
    loading.style.cssText=
      'box-sizing:border-box;width:100%;min-height:56px;'+
      'display:flex;align-items:center;justify-content:center;'+
      'border:1px solid #e6eaf0;border-radius:10px;'+
      'background:#fafbfd;color:#8a95a6;font-size:11px;';

    container.appendChild(loading);

    try {
      await ensureTurnstile();
      const key=await getSitekey();

      container.innerHTML='';

      const width=
        container.getBoundingClientRect().width;

      const size=
        width > 0 && width < 300
          ? 'compact'
          : 'flexible';

      const widgetId=window.turnstile.render(
        container,
        {
          sitekey:key,
          theme:'light',
          size:size,
          appearance:'always',

          callback:token => {
            onToken(token || '');
          },

          'expired-callback':() => onToken(''),
          'timeout-callback':() => onToken(''),
          'error-callback':() => onToken('')
        }
      );

      return widgetId;

    } catch(e) {
      container.innerHTML='';

      const err=document.createElement('div');
      err.textContent=
        'Security check could not load. Refresh the page and try again.';
      err.style.cssText=
        'box-sizing:border-box;width:100%;padding:11px 12px;'+
        'border:1px solid #f0d5d5;border-radius:10px;'+
        'background:#fff8f8;color:#a24949;font-size:11px;line-height:1.45;';

      container.appendChild(err);
      throw e;
    }
  }

  async function recoveryScreen(codes) {
    const {bg,box}=makeOverlay('Save Recovery Codes');

    const p=document.createElement('p');
    p.textContent=
      'Ye 10 single-use recovery codes hain. Inko secure offline jagah save karein.';
    p.style.cssText='margin:0 0 12px;color:#5a6679;font-size:13px;line-height:1.55;';
    box.appendChild(p);

    const ta=document.createElement('textarea');
    ta.readOnly=true;
    ta.value=codes.join('\n');
    ta.style.cssText=
      'box-sizing:border-box;width:100%;height:220px;'+
      'padding:10px;font-family:monospace;font-size:14px;'+
      'border:1px solid #dbe2ec;border-radius:10px;';
    box.appendChild(ta);

    const copy=btn('Copy Codes');
    const done=btn('I Saved Them');

    box.appendChild(copy);
    box.appendChild(done);

    copy.onclick=async()=>{
      try {
        await navigator.clipboard.writeText(ta.value);
        copy.textContent='Copied';
      } catch {
        ta.select();
      }
    };

    return await new Promise(resolve=>{
      done.onclick=()=>{
        bg.remove();
        resolve();
      };
    });
  }

  async function mfaFlow(login) {
    let setup=null;

    if (!login.mfaEnrolled) {
      setup=await post(
        '/auth/mfa/enroll',
        {mfaToken:login.mfaToken}
      );
    }

    return await new Promise((resolve,reject) => {
      const {bg,box}=makeOverlay(
        login.mfaEnrolled ? 'Authenticator' : 'Set up Authenticator'
      );

      const intro=document.createElement('p');
      intro.style.cssText='margin:0 0 12px;color:#5a6679;font-size:13px;line-height:1.55;';
      intro.textContent = login.mfaEnrolled
        ? 'Authenticator ka 6-digit code enter karein. Recovery code use karna ho to neeche toggle karein.'
        : 'Authenticator app se QR scan karein aur 6-digit code enter karein.';
      box.appendChild(intro);

      if (!login.mfaEnrolled && setup?.otpauthUri) {
        const qrWrap=document.createElement('div');
        qrWrap.style.cssText='display:flex;justify-content:center;margin:10px 0 12px;';
        const canvas=document.createElement('canvas');
        qrWrap.appendChild(canvas);
        box.appendChild(qrWrap);

        if (
          window.QRCode &&
          typeof window.QRCode.toCanvas==='function'
        ) {
          window.QRCode.toCanvas(canvas, setup.otpauthUri, {width:220,margin:2});
        }

        const manualLabel=document.createElement('div');
        manualLabel.textContent='Manual setup key';
        manualLabel.style.cssText='margin:2px 0 6px;font-size:11px;color:#748094;font-weight:600;';
        box.appendChild(manualLabel);

        const manual=document.createElement('input');
        manual.readOnly=true;
        manual.value=setup.secret || '';
        manual.style.cssText=
          'box-sizing:border-box;width:100%;padding:10px;'+
          'font-family:monospace;font-size:13px;'+
          'border:1px solid #dbe2ec;border-radius:10px;margin-bottom:8px;';
        box.appendChild(manual);
      }

      let mode='totp';

      const modeToggle=document.createElement('button');
      modeToggle.type='button';
      modeToggle.style.cssText=
        'width:100%;padding:8px 0;margin:0 0 8px;'+
        'border:0;background:transparent;color:#5b6df5;'+
        'font-size:12px;font-weight:600;cursor:pointer;';

      if (login.mfaEnrolled) {
        modeToggle.textContent='Use recovery code instead';
        box.appendChild(modeToggle);
      }

      const input=field('text','6-digit code');
      input.inputMode='numeric';
      input.autocomplete='one-time-code';
      input.classList.add('cy-mfa-code');
      box.appendChild(input);

      const note=document.createElement('div');
      note.className='cy-inline-note muted';
      note.textContent='Enter the 6-digit code from your authenticator app.';
      box.appendChild(note);

      const verify=btn(
        login.mfaEnrolled ? 'Verify' : 'Verify & Enable MFA'
      );
      box.appendChild(verify);

      const cancel=btn('Cancel',true);
      box.appendChild(cancel);

      let pending=false;
      let autoTimer=null;

      function setMode(next) {
        mode=next;

        clearTimeout(autoTimer);
        input.value='';
        clearInputError(input);

        if (mode === 'totp') {
          input.placeholder='6-digit code';
          input.inputMode='numeric';
          note.textContent='Enter the 6-digit code from your authenticator app.';
          modeToggle.textContent='Use recovery code instead';
        } else {
          input.placeholder='Recovery code';
          input.inputMode='text';
          note.textContent='Enter one unused recovery code.';
          modeToggle.textContent='Use 6-digit code instead';
        }

        focusInputNow(input);
      }

      async function submit() {
        if (pending) return;

        clearTimeout(autoTimer);
        clearInputError(input);

        const raw=input.value.trim();

        if (mode === 'totp') {
          input.value = onlyDigits(raw).slice(0,6);

          if (!/^\d{6}$/.test(input.value)) {
            markInputError(input);
            setNote(note,'Enter a valid 6-digit code.','error');
            shake(box);
            focusInputNow(input);
            return;
          }
        } else {
          if (!raw) {
            markInputError(input);
            setNote(note,'Enter a recovery code.','error');
            shake(box);
            focusInputNow(input);
            return;
          }
        }

        pending=true;
        verify.disabled=true;
        cancel.disabled=true;
        modeToggle.disabled=true;
        input.disabled=true;
        setNote(note,'Verifying…','muted');

        try {
          let verified;

          if (mode === 'totp') {
            verified=await post(
              '/auth/mfa/verify',
              {
                mfaToken:login.mfaToken,
                code:input.value.trim()
              }
            );
          } else {
            verified=await post(
              '/auth/mfa/recovery',
              {
                mfaToken:login.mfaToken,
                code:raw
              }
            );
          }

          bg.remove();

          if (
            Array.isArray(verified.recoveryCodes) &&
            verified.recoveryCodes.length
          ) {
            await recoveryScreen(verified.recoveryCodes);
          }

          resolve(verified);

        } catch(e) {
          pending=false;
          verify.disabled=false;
          cancel.disabled=false;
          modeToggle.disabled=false;
          input.disabled=false;

          const code=String(e.code || '');

          if (
            code === 'MFA_DENIED' ||
            code === 'MFA_DENIED_OR_REPLAY' ||
            code === 'MFA_CODE_REPLAY' ||
            code === 'MFA_PENDING_INVALID' ||
            code === 'RECOVERY_DENIED' ||
            code === 'HTTP_401'
          ) {
            input.value='';
            markInputError(input);

            setNote(
              note,
              mode === 'totp'
                ? 'Incorrect or expired code. Try again.'
                : 'Recovery code invalid or already used.',
              'error'
            );

            shake(box);
            focusInputNow(input);
            return;
          }

          if (
            code === 'MFA_LOCKED' ||
            code === 'RATE_LIMITED' ||
            code === 'HTTP_429' ||
            code === 'LOGIN_LOCKED'
          ) {
            setNote(
              note,
              'Too many attempts. Please wait and try again.',
              'error'
            );
            shake(box);
            focusInputNow(input);
            return;
          }

          setNote(
            note,
            'Verification failed. Please try again.',
            'error'
          );
          shake(box);
          focusInputNow(input);
        }
      }

      if (login.mfaEnrolled) {
        modeToggle.onclick=()=>{
          setMode(mode === 'totp' ? 'recovery' : 'totp');
        };
      }

      input.addEventListener('input', () => {
        clearInputError(input);

        if (mode === 'totp') {
          input.value=onlyDigits(input.value).slice(0,6);

          clearTimeout(autoTimer);
          if (input.value.length === 6) {
            autoTimer=setTimeout(submit,240);
          }
        }
      });

      enterSubmits(input, submit);

      verify.onclick=submit;

      cancel.onclick=() => {
        bg.remove();
        reject(new Error('MFA_CANCELLED'));
      };

      focusInputNow(input);
    });
  }

  async function doPasswordLogin(
    username,
    password,
    turnstileToken
  ) {
    const device=await getPasswordDevice();

    const login=await post(
      '/auth/password/login',
      {
        username,
        password,
        devicePublicKey:device.publicJwk
      },
      turnstileToken
    );

    const verified=await mfaFlow(login);

    localStorage.setItem(
      SESSION_KEY,
      verified.sessionToken
    );

    localStorage.setItem(MODE_KEY,'password');
    localStorage.setItem(USER_KEY,username);

    window.dispatchEvent(new CustomEvent(
      'cybersabil:session-ready',
      { detail: { sessionToken: verified.sessionToken } }
    ));
  }

  async function showForgot() {
    const {bg,box}=makeOverlay('Forgot / Reset Password');

    const user=field(
      'text',
      'Username',
      localStorage.getItem(USER_KEY) || 'admin'
    );

    const recovery=field('text','Recovery code');
    const pass=field('password','New password (6+ characters)');

    const ts=document.createElement('div');
    let token='';

    const note=document.createElement('div');
    note.className='cy-inline-note muted';
    note.textContent='Complete the security check, then enter recovery code and a new password.';

    box.appendChild(user);
    box.appendChild(recovery);
    box.appendChild(pass);
    box.appendChild(ts);
    box.appendChild(note);

    await addTurnstile(ts,t=>token=t);

    const reset=btn('Reset Password');
    const cancel=btn('Cancel',true);

    box.appendChild(reset);
    box.appendChild(cancel);

    async function submit() {
      clearInputError(user,recovery,pass);

      if (!user.value.trim()) {
        markInputError(user); shake(box); focusInputNow(user); return;
      }
      if (!recovery.value.trim()) {
        markInputError(recovery); shake(box); focusInputNow(recovery); return;
      }
      if (!pass.value) {
        markInputError(pass); shake(box); focusInputNow(pass); return;
      }
      if (!token) {
        setNote(note,'Complete Turnstile first.','error');
        shake(box);
        return;
      }

      reset.disabled=true;
      cancel.disabled=true;
      setNote(note,'Resetting password…','muted');

      try {
        await post(
          '/auth/password/reset',
          {
            username:user.value.trim(),
            recoveryCode:recovery.value.trim(),
            newPassword:pass.value
          },
          token
        );

        setNote(note,'Password reset successful. Redirecting…','success');

        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(MODE_KEY);

        setTimeout(()=>location.reload(),500);

      } catch(e) {
        reset.disabled=false;
        cancel.disabled=false;

        const code=String(e.code || '');

        if (code === 'RECOVERY_DENIED' || code === 'HTTP_401') {
          markInputError(recovery);
          recovery.value='';
          setNote(note,'Recovery code invalid or already used.','error');
          shake(box);
          focusInputNow(recovery);
        } else if (code === 'NEW_PASSWORD_REJECTED' || code === 'HTTP_400') {
          markInputError(pass);
          setNote(note,'New password rejected. Use a stronger password.','error');
          shake(box);
          focusInputNow(pass);
        } else if (code === 'TURNSTILE_DENIED' || code === 'HTTP_403') {
          setNote(note,'Security check failed. Please complete it again.','error');
          shake(box);
        } else {
          setNote(note,'Reset failed. Please try again.','error');
          shake(box);
        }
      }
    }

    enterSubmits(recovery, submit);
    enterSubmits(pass, submit);

    cancel.onclick=()=>bg.remove();
    reset.onclick=submit;

    focusInputNow(recovery);
  }

  async function showChange() {
    const {bg,box}=makeOverlay('Change Password');

    const user=field(
      'text',
      'Username',
      localStorage.getItem(USER_KEY) || 'admin'
    );

    const current=field('password','Current password');
    const next=field('password','New password (6+ characters)');
    const code=field('text','Current 6-digit authenticator code');
    code.inputMode='numeric';
    code.autocomplete='one-time-code';

    const ts=document.createElement('div');
    let token='';

    const note=document.createElement('div');
    note.className='cy-inline-note muted';
    note.textContent='Enter current password, new password, and a fresh authenticator code.';

    box.appendChild(user);
    box.appendChild(current);
    box.appendChild(next);
    box.appendChild(code);
    box.appendChild(ts);
    box.appendChild(note);

    await addTurnstile(ts,t=>token=t);

    const change=btn('Change Password');
    const cancel=btn('Cancel',true);

    box.appendChild(change);
    box.appendChild(cancel);

    async function submit() {
      clearInputError(user,current,next,code);

      code.value = onlyDigits(code.value).slice(0,6);

      if (!current.value) {
        markInputError(current); shake(box); focusInputNow(current); return;
      }
      if (!next.value) {
        markInputError(next); shake(box); focusInputNow(next); return;
      }
      if (!/^\d{6}$/.test(code.value)) {
        markInputError(code);
        setNote(note,'Enter a valid 6-digit MFA code.','error');
        shake(box);
        focusInputNow(code);
        return;
      }
      if (!token) {
        setNote(note,'Complete Turnstile first.','error');
        shake(box);
        return;
      }

      change.disabled=true;
      cancel.disabled=true;
      setNote(note,'Changing password…','muted');

      try {
        await post(
          '/auth/password/change',
          {
            username:user.value.trim(),
            currentPassword:current.value,
            newPassword:next.value,
            code:code.value.trim()
          },
          token
        );

        setNote(note,'Password changed. Redirecting to login…','success');

        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(MODE_KEY);

        setTimeout(()=>location.reload(),500);

      } catch(e) {
        change.disabled=false;
        cancel.disabled=false;

        const err=String(e.code || '');

        if (err === 'CURRENT_PASSWORD_DENIED' || err === 'HTTP_401') {
          markInputError(current);
          current.value='';
          setNote(note,'Current password incorrect, or MFA code invalid/expired.','error');
          shake(box);
          focusInputNow(current);
        } else if (err === 'NEW_PASSWORD_REJECTED' || err === 'HTTP_400') {
          markInputError(next);
          setNote(note,'New password rejected. Use a stronger password.','error');
          shake(box);
          focusInputNow(next);
        } else if (err === 'MFA_DENIED_OR_REPLAY' || err === 'MFA_CODE_REPLAY') {
          markInputError(code);
          code.value='';
          setNote(note,'Incorrect or already-used MFA code. Try the next fresh code.','error');
          shake(box);
          focusInputNow(code);
        } else {
          setNote(note,'Change failed. Please try again.','error');
          shake(box);
        }
      }
    }

    enterSubmits(current, () => focusInputNow(next));
    enterSubmits(next, () => focusInputNow(code));
    enterSubmits(code, submit);

    cancel.onclick=()=>bg.remove();
    change.onclick=submit;

    focusInputNow(current);
  }

  async function installLoginUI() {
    const authLayer=
      document.getElementById('authLayer');

    if (!authLayer) return;

    if (
      document.getElementById(
        'cybersabilPasswordPanel'
      )
    ) return;

    const panel=document.createElement('div');
    panel.id='cybersabilPasswordPanel';

    panel.style.cssText=
      'margin:16px 0;padding:16px;'+
      'border:1px solid rgba(255,255,255,.16);'+
      'border-radius:14px;';

    const title=document.createElement('div');
    title.textContent='Password Login';
    title.style.cssText=
      'font-weight:800;font-size:18px;margin-bottom:8px;';

    const user=field(
      'text',
      'Username',
      localStorage.getItem(USER_KEY) || 'admin'
    );

    const pass=field('password','Password');

    const ts=document.createElement('div');
    ts.style.margin='10px 0';

    const note=document.createElement('div');
    note.className='cy-inline-note muted';
    note.textContent='Complete the security check to enable sign-in.';

    const login=btn('Sign in with Password');
    login.disabled=true;
    login.style.opacity='.68';
    login.style.cursor='not-allowed';

    const forgot=btn('Forgot / Reset Password',true);

    panel.appendChild(title);
    panel.appendChild(user);
    panel.appendChild(pass);
    panel.appendChild(ts);
    panel.appendChild(note);
    panel.appendChild(login);
    panel.appendChild(forgot);

    authLayer.prepend(panel);

    try {
      loginTurnstileId=await addTurnstile(
        ts,
        t=>{
          loginTurnstileToken=t || '';
          login.disabled=!loginTurnstileToken;
          login.style.opacity = login.disabled ? '.68' : '1';
          login.style.cursor = login.disabled ? 'not-allowed' : 'pointer';

          setNote(
            note,
            loginTurnstileToken
              ? 'Security check complete. Press Enter or Sign in.'
              : 'Complete the security check to enable sign-in.',
            loginTurnstileToken ? 'success' : 'muted'
          );
        }
      );
    } catch(e) {
      console.error('Turnstile load failed:',e);
      setNote(note,'Security check failed to load. Refresh the page.','error');
    }

    async function submitPasswordLogin() {
      if (login.disabled) return;

      clearInputError(user,pass);

      if (!user.value.trim()) {
        markInputError(user);
        setNote(note,'Enter username.','error');
        shake(panel);
        focusInputNow(user);
        return;
      }

      if (!pass.value) {
        markInputError(pass);
        setNote(note,'Enter password.','error');
        shake(panel);
        focusInputNow(pass);
        return;
      }

      login.disabled=true;
      forgot.disabled=true;
      user.disabled=true;
      pass.disabled=true;

      login.style.opacity='.68';
      login.style.cursor='not-allowed';

      setNote(note,'Signing in…','muted');

      try {
        await doPasswordLogin(
          user.value.trim(),
          pass.value,
          loginTurnstileToken
        );

      } catch(e) {
        login.disabled=false;
        forgot.disabled=false;
        user.disabled=false;
        pass.disabled=false;
        login.style.opacity='1';
        login.style.cursor='pointer';

        const code=String(e.code || e.message || '');

        if (
          code === 'LOGIN_DENIED' ||
          code === 'HTTP_401'
        ) {
          markInputError(pass);
          pass.value='';
          setNote(note,'Incorrect username or password.','error');
          shake(panel);
          focusInputNow(pass);

        } else if (
          code === 'LOGIN_LOCKED' ||
          code === 'HTTP_429'
        ) {
          setNote(note,'Too many attempts. Please wait and try again.','error');
          shake(panel);
          focusInputNow(pass);

        } else if (
          code === 'TURNSTILE_DENIED' ||
          code === 'HTTP_403'
        ) {
          setNote(note,'Security check failed. Please complete it again.','error');
          shake(panel);

        } else if (code === 'MFA_CANCELLED') {
          setNote(note,'MFA was cancelled. Sign in again when ready.','error');
          shake(panel);

        } else {
          setNote(note,'Login failed. Please try again.','error');
          shake(panel);
        }

        try {
          if (loginTurnstileId !== null && window.turnstile) {
            window.turnstile.reset(loginTurnstileId);
          }
        } catch {}

        loginTurnstileToken='';
        login.disabled=true;
        login.style.opacity='.68';
        login.style.cursor='not-allowed';
      }
    }

    enterSubmits(user, submitPasswordLogin);
    enterSubmits(pass, submitPasswordLogin);

    forgot.onclick=showForgot;
    login.onclick=submitPasswordLogin;

    if (!user.value.trim()) {
      focusInputNow(user);
    } else {
      focusInputNow(pass);
    }
  }

  function addChangePasswordButton() {
    const logout=
      document.getElementById('logoutBtn');

    if (
      !logout ||
      document.getElementById(
        'changePasswordBtn'
      )
    ) return;

    const b=document.createElement('button');

    b.id='changePasswordBtn';
    b.type='button';
    b.textContent='Change Password';
    b.className=logout.className;

    b.addEventListener('click',showChange);

    logout.parentNode?.insertBefore(b,logout);
  }

  function boot() {
    injectStyles();
    installGlobalSearchHotkeys();
    installLoginUI().catch(console.error);
    addChangePasswordButton();

    const observer=new MutationObserver(()=>{
      installLoginUI().catch(()=>{});
      addChangePasswordButton();
    });

    observer.observe(
      document.documentElement,
      {
        subtree:true,
        childList:true,
        attributes:true,
        attributeFilter:['class']
      }
    );
  }

  if (document.readyState==='loading')
    document.addEventListener(
      'DOMContentLoaded',
      boot
    );
  else
    boot();

})();
