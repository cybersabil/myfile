/* CYBERSABIL_PASSWORD_PRIMARY_FRONTEND_V1 */

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

    if (!r.ok)
      throw new Error(
        d.error || ('HTTP_'+r.status)
      );

    return d;
  }

  function makeOverlay(title) {
    const bg=document.createElement('div');

    bg.style.cssText=
      'position:fixed;inset:0;z-index:2147483647;'+
      'display:flex;align-items:center;justify-content:center;'+
      'background:rgba(0,0,0,.72);padding:18px;';

    const box=document.createElement('div');

    box.style.cssText=
      'box-sizing:border-box;width:min(430px,100%);'+
      'max-height:92vh;overflow:auto;background:#fff;color:#111;'+
      'border-radius:16px;padding:24px;'+
      'font-family:system-ui,sans-serif;';

    const h=document.createElement('h2');
    h.textContent=title;
    h.style.margin='0 0 16px';

    box.appendChild(h);
    bg.appendChild(box);
    document.body.appendChild(bg);

    return {bg,box};
  }

  function field(type,placeholder,value='') {
    const x=document.createElement('input');

    x.type=type;
    x.placeholder=placeholder;
    x.value=value;

    x.style.cssText=
      'box-sizing:border-box;width:100%;padding:12px;'+
      'margin:7px 0;border:1px solid #bbb;border-radius:9px;'+
      'font-size:16px;';

    return x;
  }

  function btn(label,secondary=false) {
    const b=document.createElement('button');

    b.type='button';
    b.textContent=label;

    b.style.cssText=
      'box-sizing:border-box;width:100%;padding:12px;'+
      'margin-top:9px;border:0;border-radius:9px;'+
      'cursor:pointer;font-weight:700;'+
      (secondary
        ? 'background:#eee;color:#111;'
        : 'background:#111;color:#fff;');

    return b;
  }

  async function waitTurnstile() {
    for(let i=0;i<100;i++){
      if (
        window.turnstile &&
        typeof window.turnstile.render==='function'
      ) return;

      await new Promise(r=>setTimeout(r,100));
    }

    throw new Error('TURNSTILE_NOT_READY');
  }

  async function getSitekey() {
    if (sitekey) return sitekey;

    const r=await chainedFetch(
      API+'/auth/status',
      {cache:'no-store'}
    );

    const d=await r.json();

    sitekey=d.turnstileSitekey || '';

    if (!sitekey)
      throw new Error('TURNSTILE_SITEKEY_MISSING');

    return sitekey;
  }

  async function addTurnstile(container,onToken) {
    await waitTurnstile();

    const key=await getSitekey();

    return window.turnstile.render(
      container,
      {
        sitekey:key,
        callback:t=>onToken(t),
        'expired-callback':()=>onToken(''),
        'error-callback':()=>onToken('')
      }
    );
  }

  async function mfaFlow(login) {
    let entered='';

    if (!login.mfaEnrolled) {
      const setup=await post(
        '/auth/mfa/enroll',
        {mfaToken:login.mfaToken}
      );

      const {bg,box}=makeOverlay(
        'Set up Authenticator'
      );

      const p=document.createElement('p');
      p.textContent=
        'Authenticator app se QR scan karein.';
      box.appendChild(p);

      const canvas=document.createElement('canvas');
      canvas.style.cssText=
        'display:block;margin:12px auto;';
      box.appendChild(canvas);

      if (
        window.QRCode &&
        typeof window.QRCode.toCanvas==='function'
      ) {
        await window.QRCode.toCanvas(
          canvas,
          setup.otpauthUri,
          {width:240,margin:2}
        );
      }

      const manual=document.createElement('input');
      manual.readOnly=true;
      manual.value=setup.secret;
      manual.style.cssText=
        'box-sizing:border-box;width:100%;padding:10px;'+
        'font-family:monospace;margin:8px 0;';
      box.appendChild(manual);

      const code=field(
        'text',
        '6-digit authenticator code'
      );
      code.inputMode='numeric';
      box.appendChild(code);

      const verify=btn('Verify & Enable MFA');
      box.appendChild(verify);

      entered=await new Promise((resolve,reject)=>{
        verify.onclick=()=>{
          const v=code.value.trim();

          if (!/^\d{6}$/.test(v)) {
            alert('6-digit code enter karein.');
            return;
          }

          bg.remove();
          resolve(v);
        };
      });
    } else {
      const {bg,box}=makeOverlay('Authenticator');

      const code=field(
        'text',
        '6-digit code or recovery code'
      );
      box.appendChild(code);

      const verify=btn('Continue');
      box.appendChild(verify);

      entered=await new Promise(resolve=>{
        verify.onclick=()=>{
          const v=code.value.trim();
          if (!v) return;
          bg.remove();
          resolve(v);
        };
      });
    }

    let verified;

    if (/^\d{6}$/.test(entered)) {
      verified=await post(
        '/auth/mfa/verify',
        {
          mfaToken:login.mfaToken,
          code:entered
        }
      );
    } else {
      verified=await post(
        '/auth/mfa/recovery',
        {
          mfaToken:login.mfaToken,
          code:entered
        }
      );
    }

    if (
      Array.isArray(verified.recoveryCodes) &&
      verified.recoveryCodes.length
    ) {
      const {bg,box}=makeOverlay(
        'Save Recovery Codes'
      );

      const p=document.createElement('p');
      p.textContent=
        'Ye 10 single-use recovery codes hain. Secure offline jagah save karein.';
      box.appendChild(p);

      const ta=document.createElement('textarea');
      ta.readOnly=true;
      ta.value=verified.recoveryCodes.join('\n');
      ta.style.cssText=
        'box-sizing:border-box;width:100%;height:230px;'+
        'font-family:monospace;padding:10px;';
      box.appendChild(ta);

      const copy=btn('Copy Codes');
      const done=btn('I Saved Them');

      box.appendChild(copy);
      box.appendChild(done);

      copy.onclick=async()=>{
        try {
          await navigator.clipboard.writeText(
            ta.value
          );
          copy.textContent='Copied';
        } catch {
          ta.select();
        }
      };

      await new Promise(resolve=>{
        done.onclick=()=>{
          bg.remove();
          resolve();
        };
      });
    }

    return verified;
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

    location.reload();
  }

  async function showForgot() {
    const {bg,box}=makeOverlay(
      'Forgot / Reset Password'
    );

    const user=field(
      'text',
      'Username',
      localStorage.getItem(USER_KEY) || 'admin'
    );

    const recovery=field(
      'text',
      'Recovery code'
    );

    const pass=field(
      'password',
      'New password (6+ characters)'
    );

    const ts=document.createElement('div');

    let token='';

    box.appendChild(user);
    box.appendChild(recovery);
    box.appendChild(pass);
    box.appendChild(ts);

    await addTurnstile(ts,t=>token=t);

    const reset=btn('Reset Password');
    const cancel=btn('Cancel',true);

    box.appendChild(reset);
    box.appendChild(cancel);

    cancel.onclick=()=>bg.remove();

    reset.onclick=async()=>{
      try {
        if (!token)
          throw new Error(
            'Complete Turnstile first'
          );

        await post(
          '/auth/password/reset',
          {
            username:user.value.trim(),
            recoveryCode:recovery.value.trim(),
            newPassword:pass.value
          },
          token
        );

        alert(
          'Password reset successful. All old sessions revoked.'
        );

        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(MODE_KEY);

        location.reload();
      } catch(e) {
        alert('Reset failed: '+e.message);
      }
    };
  }

  async function showChange() {
    const {bg,box}=makeOverlay(
      'Change Password'
    );

    const user=field(
      'text',
      'Username',
      localStorage.getItem(USER_KEY) || 'admin'
    );

    const current=field(
      'password',
      'Current password'
    );

    const next=field(
      'password',
      'New password (6+ characters)'
    );

    const code=field(
      'text',
      'Current 6-digit authenticator code'
    );

    const ts=document.createElement('div');
    let token='';

    box.appendChild(user);
    box.appendChild(current);
    box.appendChild(next);
    box.appendChild(code);
    box.appendChild(ts);

    await addTurnstile(ts,t=>token=t);

    const change=btn('Change Password');
    const cancel=btn('Cancel',true);

    box.appendChild(change);
    box.appendChild(cancel);

    cancel.onclick=()=>bg.remove();

    change.onclick=async()=>{
      try {
        if (!token)
          throw new Error(
            'Complete Turnstile first'
          );

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

        alert(
          'Password changed. Please login again.'
        );

        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(MODE_KEY);

        location.reload();
      } catch(e) {
        alert(
          'Change failed: '+e.message+
          '\nIf MFA code was just used for login, wait for the next 30-second code.'
        );
      }
    };
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

    const pass=field(
      'password',
      'Password'
    );

    const ts=document.createElement('div');
    ts.style.margin='10px 0';

    const login=btn('Sign in with Password');

    const forgot=btn(
      'Forgot / Reset Password',
      true
    );

    panel.appendChild(title);
    panel.appendChild(user);
    panel.appendChild(pass);
    panel.appendChild(ts);
    panel.appendChild(login);
    panel.appendChild(forgot);

    authLayer.prepend(panel);

    await addTurnstile(
      ts,
      t=>loginTurnstileToken=t
    );

    login.onclick=async()=>{
      login.disabled=true;

      try {
        if (!loginTurnstileToken)
          throw new Error(
            'Complete Turnstile first'
          );

        await doPasswordLogin(
          user.value.trim(),
          pass.value,
          loginTurnstileToken
        );
      } catch(e) {
        alert('Login failed: '+e.message);

        login.disabled=false;

        try {
          if (loginTurnstileId!==null)
            window.turnstile.reset(
              loginTurnstileId
            );
        } catch {}

        loginTurnstileToken='';
      }
    };

    forgot.onclick=showForgot;

    const passkey=
      document.getElementById('loginBtn');

    if (passkey) {
      passkey.textContent='Use Passkey Instead';
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
