/* CYBERSABIL_MFA_FRONTEND_SHIM_V1 */

(() => {
  'use strict';

  const realFetch = window.fetch.bind(window);

  async function post(origin, path, body) {
    const r = await realFetch(origin + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      cache: 'no-store'
    });

    let data = {};

    try {
      data = await r.json();
    } catch {}

    if (!r.ok) {
      const msg =
        data.error ||
        data.message ||
        ('HTTP_' + r.status);

      throw new Error(msg);
    }

    return data;
  }

  function synthetic(original, data) {
    const headers = new Headers(original.headers);
    headers.set(
      'Content-Type',
      'application/json; charset=utf-8'
    );
    headers.set('Cache-Control', 'no-store');

    return new Response(JSON.stringify(data), {
      status: 200,
      headers
    });
  }

  window.fetch = async function(input, init) {
    const original = await realFetch(input, init);

    let u;

    try {
      const raw =
        input instanceof Request
          ? input.url
          : String(input);

      u = new URL(raw, window.location.href);
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
      data = await original.clone().json();
    } catch {
      return original;
    }

    if (!data?.mfaRequired || !data?.mfaToken) {
      return original;
    }

    try {
      let entered;

      if (!data.mfaEnrolled) {
        const setup = await post(
          u.origin,
          '/auth/mfa/enroll',
          { mfaToken: data.mfaToken }
        );

        entered = window.prompt(
          'CyberSabil MFA setup required.\n\n' +
          'Authenticator app me naya account add karein.\n\n' +
          'Issuer: ' + setup.issuer + '\n' +
          'Account: ' + setup.account + '\n\n' +
          'Secret key:\n' + setup.secret + '\n\n' +
          'Is secret ko authenticator app me enter karke ' +
          '6-digit code yahan enter karein:'
        );
      } else {
        entered = window.prompt(
          'CyberSabil MFA\n\n' +
          '6-digit authenticator code enter karein.\n\n' +
          'Authenticator available nahi hai to apna ' +
          'recovery code bhi yahin paste kar sakte hain:'
        );
      }

      if (!entered) {
        throw new Error('MFA_CANCELLED');
      }

      entered = entered.trim();

      let verified;

      if (/^\d{6}$/.test(entered)) {
        verified = await post(
          u.origin,
          '/auth/mfa/verify',
          {
            mfaToken: data.mfaToken,
            code: entered
          }
        );
      } else {
        verified = await post(
          u.origin,
          '/auth/mfa/recovery',
          {
            mfaToken: data.mfaToken,
            code: entered
          }
        );
      }

      if (Array.isArray(verified.recoveryCodes)) {
        const codes = verified.recoveryCodes.join('\n');

        window.prompt(
          'IMPORTANT — Recovery Codes\n\n' +
          'Ye 10 single-use recovery codes sirf ab dikh rahe hain.\n' +
          'Inko secure jagah save karein.\n\n' +
          'Click inside box, Ctrl+A, Ctrl+C:',
          codes
        );
      }

      return synthetic(original, {
        verified: true,
        sessionToken: verified.sessionToken,
        expiresAt: verified.expiresAt
      });

    } catch (e) {
      window.alert(
        'MFA verification failed: ' +
        (e?.message || 'UNKNOWN_ERROR')
      );

      const headers = new Headers(original.headers);
      headers.set(
        'Content-Type',
        'application/json; charset=utf-8'
      );

      return new Response(JSON.stringify({
        error: 'MFA_FAILED',
        message: e?.message || 'MFA_FAILED'
      }), {
        status: 401,
        headers
      });
    }
  };
})();
