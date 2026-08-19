/* CYBERSABIL_PHONE_PASSKEY_MANAGER_V2 */

(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  function secureApi(path, opts = {}) {
    if (
      typeof window.CyberSabilSecureApi !==
      'function'
    ) {
      throw new Error(
        'SECURE_API_NOT_READY'
      );
    }

    return window.CyberSabilSecureApi(
      path,
      opts
    );
  }

  function onlyDigits(value) {
    return String(value || '')
      .replace(/\D+/g, '');
  }

  function focusNow(input) {
    const run = () => {
      try {
        input.focus({
          preventScroll: true
        });
      } catch {}
    };

    requestAnimationFrame(run);
    setTimeout(run, 60);
    setTimeout(run, 170);
  }

  function shake(card) {
    card.classList.remove(
      'cy-passkey-manager-shake'
    );

    void card.offsetWidth;

    card.classList.add(
      'cy-passkey-manager-shake'
    );

    setTimeout(
      () => card.classList.remove(
        'cy-passkey-manager-shake'
      ),
      430
    );
  }

  function modal() {
    const overlay =
      document.createElement('div');

    overlay.className =
      'cy-passkey-manager-overlay';

    const card =
      document.createElement('div');

    card.className =
      'cy-passkey-manager-card';

    const icon =
      document.createElement('div');

    icon.className =
      'cy-passkey-manager-icon';

    icon.textContent = '📱';

    const title =
      document.createElement('h2');

    title.textContent =
      'Add Phone Passkey';

    const desc =
      document.createElement('p');

    desc.textContent =
      'Verify with one fresh authenticator code. Then your browser will open its secure phone/device registration prompt. Choose your phone or “another device”, scan the QR if shown, and approve with fingerprint/face/PIN.';

    const status =
      document.createElement('div');

    status.className =
      'cy-passkey-manager-status';

    status.textContent =
      'Checking current passkeys…';

    const code =
      document.createElement('input');

    code.className =
      'cy-passkey-manager-code';

    code.type = 'text';
    code.inputMode = 'numeric';
    code.autocomplete = 'one-time-code';
    code.placeholder = '6-digit authenticator code';
    code.maxLength = 6;

    const primary =
      document.createElement('button');

    primary.type = 'button';
    primary.className =
      'cy-passkey-manager-btn primary';

    primary.textContent =
      'Verify & Add Phone';

    const cancel =
      document.createElement('button');

    cancel.type = 'button';
    cancel.className =
      'cy-passkey-manager-btn secondary';

    cancel.textContent = 'Cancel';

    card.append(
      icon,
      title,
      desc,
      status,
      code,
      primary,
      cancel
    );

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    return {
      overlay,
      card,
      status,
      code,
      primary,
      cancel
    };
  }

  async function openManager() {
    const ui = modal();

    let pending = false;
    let timer = null;

    const setStatus = (
      text,
      tone = ''
    ) => {
      ui.status.className =
        'cy-passkey-manager-status' +
        (tone ? ` ${tone}` : '');

      ui.status.textContent = text;
    };

    const setBusy = text => {
      pending = true;
      ui.code.disabled = true;
      ui.primary.disabled = true;
      ui.cancel.disabled = true;
      setStatus(text, 'busy');
    };

    const setIdle = () => {
      pending = false;
      ui.code.disabled = false;
      ui.primary.disabled = false;
      ui.cancel.disabled = false;
    };

    const fail = (
      text,
      clear = true
    ) => {
      setIdle();

      if (clear) {
        ui.code.value = '';
      }

      setStatus(text, 'error');
      shake(ui.card);
      focusNow(ui.code);
    };

    async function refreshStatus() {
      try {
        const s =
          await secureApi(
            '/api/passkeys/status',
            { method: 'GET' }
          );

        setStatus(
          `${s.count || 0} passkey registered` +
          `${Number(s.count || 0) === 1 ? '' : 's'}` +
          (s.hybridReady
            ? ' • phone/hybrid capable credential detected'
            : '')
        );
      } catch {
        setStatus(
          'Current passkey status could not be loaded.',
          'error'
        );
      }
    }

    async function submit() {
      if (pending) return;

      clearTimeout(timer);

      ui.code.value =
        onlyDigits(ui.code.value)
          .slice(0, 6);

      if (
        !/^\d{6}$/.test(
          ui.code.value
        )
      ) {
        fail(
          'Enter a valid fresh 6-digit authenticator code.',
          false
        );
        return;
      }

      try {
        setBusy(
          'Verifying MFA and preparing remote-device registration…'
        );

        const options =
          await secureApi(
            '/api/passkeys/add/options',
            {
              method: 'POST',
              body:
                JSON.stringify({
                  code:
                    ui.code.value
                })
            }
          );

        setStatus(
          'Browser prompt opening… Choose your phone / another device. Scan the QR if shown.',
          'busy'
        );

        if (
          !window.SimpleWebAuthnBrowser ||
          typeof window
            .SimpleWebAuthnBrowser
            .startRegistration !==
            'function'
        ) {
          throw new Error(
            'PASSKEY_LIBRARY_UNAVAILABLE'
          );
        }

        const response =
          await window
            .SimpleWebAuthnBrowser
            .startRegistration({
              optionsJSON:
                options.options
            });

        setStatus(
          'Phone approved. Verifying and saving the passkey…',
          'busy'
        );

        const verified =
          await secureApi(
            '/api/passkeys/add/verify',
            {
              method: 'POST',
              body:
                JSON.stringify({
                  challengeId:
                    options.challengeId,
                  response
                })
            }
          );

        setIdle();
        ui.code.value = '';
        ui.code.style.display =
          'none';
        ui.primary.style.display =
          'none';

        setStatus(
          `Phone passkey added successfully. Total passkeys: ${verified.count}.` +
          (verified.hybridCapable
            ? ' Hybrid phone transport confirmed.'
            : ' Credential saved; browser/device controls the available transport UI.'),
          'success'
        );

        ui.cancel.textContent =
          'Done';

      } catch (e) {
        const code =
          String(
            e?.code ||
            e?.name ||
            e?.message ||
            ''
          );

        if (
          code === 'MFA_DENIED' ||
          code === 'MFA_CODE_REPLAY' ||
          code === 'HTTP_401'
        ) {
          fail(
            'Incorrect, expired, or already-used authenticator code. Wait for a fresh code and type again.'
          );
          return;
        }

        if (
          code === 'MFA_LOCKED' ||
          code === 'RATE_LIMITED' ||
          code === 'HTTP_429'
        ) {
          fail(
            'Too many attempts. Please wait before trying again.',
            false
          );
          return;
        }

        if (
          code ===
            'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' ||
          code ===
            'PASSKEY_ALREADY_REGISTERED'
        ) {
          fail(
            'That passkey is already registered. Choose another phone/passkey, or simply use the existing registered passkey.',
            false
          );
          return;
        }

        if (
          code ===
            'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY' ||
          code ===
            'NotAllowedError'
        ) {
          fail(
            'Phone/device registration was cancelled or timed out. Press the button again and choose your phone / another device.',
            false
          );
          return;
        }

        fail(
          'Phone passkey registration did not complete. Try again with a fresh code.',
          false
        );
      }
    }

    ui.code.addEventListener(
      'input',
      () => {
        ui.code.value =
          onlyDigits(
            ui.code.value
          ).slice(0, 6);

        clearTimeout(timer);

        if (
          ui.code.value.length === 6
        ) {
          timer =
            setTimeout(
              submit,
              240
            );
        }
      }
    );

    ui.code.addEventListener(
      'keydown',
      e => {
        if (
          e.key !== 'Enter' ||
          e.isComposing
        ) return;

        e.preventDefault();
        submit();
      }
    );

    ui.primary.onclick = submit;

    ui.cancel.onclick = () => {
      if (pending) return;
      ui.overlay.remove();
    };

    await refreshStatus();
    focusNow(ui.code);
  }

  function installButton() {
    const logout = $('logoutBtn');

    if (
      !logout ||
      $('addPhonePasskeyBtn')
    ) {
      return;
    }

    const button =
      document.createElement('button');

    button.id =
      'addPhonePasskeyBtn';

    button.type =
      'button';

    button.className =
      logout.className;

    button.textContent =
      'Add Phone';

    button.title =
      'Add phone passkey';

    button.addEventListener(
      'click',
      () => {
        openManager()
          .catch(console.error);
      }
    );

    const change =
      $('changePasswordBtn');

    if (
      change &&
      change.parentNode ===
        logout.parentNode
    ) {
      logout.parentNode.insertBefore(
        button,
        change
      );
    } else {
      logout.parentNode.insertBefore(
        button,
        logout
      );
    }
  }

  function boot() {
    installButton();

    const observer =
      new MutationObserver(
        installButton
      );

    observer.observe(
      document.documentElement,
      {
        subtree: true,
        childList: true
      }
    );
  }

  if (
    document.readyState ===
      'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      boot
    );
  } else {
    boot();
  }
})();
