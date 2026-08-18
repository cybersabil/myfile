/* CYBERSABIL_MFA_FRONTEND_SHIM_V2_QR */

(() => {
  'use strict';

  const realFetch = window.fetch.bind(window);

  async function post(origin, path, body) {
    const r = await realFetch(origin + path, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body),
      cache: 'no-store'
    });

    let data = {};
    try { data = await r.json(); } catch {}

    if (!r.ok) {
      throw new Error(
        data.error || data.message || ('HTTP_' + r.status)
      );
    }

    return data;
  }

  function synthetic(original, data) {
    const h = new Headers(original.headers);
    h.set('Content-Type','application/json; charset=utf-8');
    h.set('Cache-Control','no-store');

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: h
    });
  }

  function overlay(title) {
    const o=document.createElement('div');

    o.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;' +
      'background:rgba(0,0,0,.68);display:flex;' +
      'align-items:center;justify-content:center;padding:18px;';

    const box=document.createElement('div');

    box.style.cssText =
      'width:min(420px,100%);max-height:90vh;overflow:auto;' +
      'background:#fff;color:#111;border-radius:16px;' +
      'padding:24px;font-family:system-ui,sans-serif;' +
      'box-shadow:0 20px 60px rgba(0,0,0,.35);';

    const h=document.createElement('h2');
    h.textContent=title;
    h.style.cssText='margin:0 0 16px;font-size:22px;';

    box.appendChild(h);
    o.appendChild(box);
    document.body.appendChild(o);

    return {o,box};
  }

  function text(box, value) {
    const p=document.createElement('p');
    p.textContent=value;
    p.style.cssText='line-height:1.5;margin:10px 0;';
    box.appendChild(p);
    return p;
  }

  function button(label) {
    const b=document.createElement('button');
    b.textContent=label;
    b.style.cssText =
      'width:100%;padding:12px;margin-top:12px;' +
      'border:0;border-radius:9px;font-weight:700;' +
      'cursor:pointer;background:#111;color:#fff;';
    return b;
  }

  function codeInput(placeholder) {
    const i=document.createElement('input');
    i.type='text';
    i.autocomplete='one-time-code';
    i.inputMode='numeric';
    i.placeholder=placeholder;
    i.style.cssText =
      'box-sizing:border-box;width:100%;padding:13px;' +
      'border:1px solid #aaa;border-radius:9px;' +
      'font-size:18px;margin-top:12px;';
    return i;
  }

  async function setupQR(setup) {
    return new Promise((resolve,reject) => {
      const {o,box}=overlay('Set up Authenticator');

      text(
        box,
        'Google Authenticator / Microsoft Authenticator / ' +
        '2FAS se QR code scan karein.'
      );

      const qrWrap=document.createElement('div');
      qrWrap.style.cssText=
        'display:flex;justify-content:center;' +
        'background:#fff;padding:12px;margin:10px 0;';

      const canvas=document.createElement('canvas');
      qrWrap.appendChild(canvas);
      box.appendChild(qrWrap);

      if (
        typeof window.QRCode !== 'undefined' &&
        typeof window.QRCode.toCanvas === 'function'
      ) {
        window.QRCode.toCanvas(
          canvas,
          setup.otpauthUri,
          {width:240,margin:2},
          err => {
            if (err) {
              qrWrap.textContent='QR generation failed — use manual key below.';
            }
          }
        );
      } else {
        qrWrap.textContent='QR library unavailable — use manual key below.';
      }

      text(box,'Manual backup key:');

      const secret=document.createElement('input');
      secret.value=setup.secret;
      secret.readOnly=true;
      secret.style.cssText=
        'box-sizing:border-box;width:100%;padding:10px;' +
        'font-family:monospace;border:1px solid #bbb;' +
        'border-radius:8px;';
      box.appendChild(secret);

      const input=codeInput('6-digit code');
      box.appendChild(input);

      const verify=button('Verify & Enable MFA');
      box.appendChild(verify);

      const cancel=button('Cancel');
      cancel.style.background='#666';
      box.appendChild(cancel);

      verify.onclick=() => {
        const v=input.value.trim();

        if (!/^\d{6}$/.test(v)) {
          alert('6-digit authenticator code enter karein.');
          return;
        }

        o.remove();
        resolve(v);
      };

      cancel.onclick=() => {
        o.remove();
        reject(new Error('MFA_CANCELLED'));
      };

      setTimeout(() => input.focus(),100);
    });
  }

  async function loginMFA() {
    return new Promise((resolve,reject) => {
      const {o,box}=overlay('CyberSabil MFA');

      text(
        box,
        'Authenticator ka 6-digit code enter karein. ' +
        'Emergency me single-use recovery code bhi use kar sakte hain.'
      );

      const input=codeInput('6-digit code or recovery code');
      box.appendChild(input);

      const verify=button('Verify');
      box.appendChild(verify);

      const cancel=button('Cancel');
      cancel.style.background='#666';
      box.appendChild(cancel);

      verify.onclick=() => {
        const v=input.value.trim();

        if (!v) return;

        o.remove();
        resolve(v);
      };

      cancel.onclick=() => {
        o.remove();
        reject(new Error('MFA_CANCELLED'));
      };

      setTimeout(() => input.focus(),100);
    });
  }

  async function recoveryScreen(codes) {
    return new Promise(resolve => {
      const {o,box}=overlay('Save Recovery Codes');

      text(
        box,
        'Ye 10 codes single-use emergency login codes hain. ' +
        'Inko offline secure jagah save karein.'
      );

      const ta=document.createElement('textarea');
      ta.readOnly=true;
      ta.value=codes.join('\n');
      ta.style.cssText=
        'box-sizing:border-box;width:100%;height:230px;' +
        'padding:12px;font-family:monospace;font-size:15px;' +
        'border:1px solid #aaa;border-radius:9px;';
      box.appendChild(ta);

      const copy=button('Copy Recovery Codes');
      box.appendChild(copy);

      copy.onclick=async () => {
        try {
          await navigator.clipboard.writeText(ta.value);
          copy.textContent='Copied';
        } catch {
          ta.focus();
          ta.select();
        }
      };

      const done=button('I Saved Them');
      box.appendChild(done);

      done.onclick=() => {
        o.remove();
        resolve();
      };
    });
  }

  window.fetch = async function(input, init) {
    const original=await realFetch(input,init);

    let u;
    try {
      const raw=input instanceof Request ? input.url : String(input);
      u=new URL(raw,window.location.href);
    } catch {
      return original;
    }

    if (
      original.status !== 200 ||
      !(
        u.pathname.endsWith('/auth/login/verify') ||
        u.pathname.endsWith('/auth/register/verify')
      )
    ) {
      return original;
    }

    let data;
    try {
      data=await original.clone().json();
    } catch {
      return original;
    }

    if (!data?.mfaRequired || !data?.mfaToken) {
      return original;
    }

    try {
      let entered;

      if (!data.mfaEnrolled) {
        const setup=await post(
          u.origin,
          '/auth/mfa/enroll',
          {mfaToken:data.mfaToken}
        );

        entered=await setupQR(setup);
      } else {
        entered=await loginMFA();
      }

      let verified;

      if (/^\d{6}$/.test(entered)) {
        verified=await post(
          u.origin,
          '/auth/mfa/verify',
          {
            mfaToken:data.mfaToken,
            code:entered
          }
        );
      } else {
        verified=await post(
          u.origin,
          '/auth/mfa/recovery',
          {
            mfaToken:data.mfaToken,
            code:entered
          }
        );
      }

      if (Array.isArray(verified.recoveryCodes)) {
        await recoveryScreen(verified.recoveryCodes);
      }

      return synthetic(original,{
        verified:true,
        sessionToken:verified.sessionToken,
        expiresAt:verified.expiresAt
      });

    } catch(e) {
      alert(
        'MFA verification failed: ' +
        (e?.message || 'UNKNOWN_ERROR')
      );

      return new Response(JSON.stringify({
        error:'MFA_FAILED',
        message:e?.message || 'MFA_FAILED'
      }),{
        status:401,
        headers:{'Content-Type':'application/json'}
      });
    }
  };
})();
