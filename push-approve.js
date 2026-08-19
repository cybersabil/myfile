/* CYBERSABIL_PUSH_APPROVE_V1_1_AUTO_CLOSE */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const status = $('status');
  const choicesBox = $('choices');

  const params = new URLSearchParams(
    location.hash.replace(/^#/, '')
  );

  const challengeId =
    params.get('c') || '';

  const choices =
    String(params.get('n') || '')
      .split(',')
      .map(Number)
      .filter(
        n =>
          Number.isInteger(n) &&
          n >= 10 &&
          n <= 99
      );

  const expiresAt =
    Number(params.get('e') || 0);

  let busy = false;
  let terminal = false;
  let expiryTimer = null;

  function message(text, tone = '') {
    status.className =
      'push-status' +
      (tone ? ` ${tone}` : '');

    status.textContent = text;
  }

  function disableChoices() {
    [
      ...choicesBox.querySelectorAll('button')
    ].forEach(button => {
      button.disabled = true;
    });
  }

  function tryClosePage() {
    try {
      window.open('', '_self');
    } catch {}

    try {
      window.close();
    } catch {}

    // Browsers may refuse window.close() if they decide this is not a
    // script-opened browsing context. In that case leave only a tiny,
    // inert completion state instead of the approval controls.
    setTimeout(() => {
      if (window.closed) return;

      try {
        document.body.innerHTML = `
          <main class="push-card">
            <div class="push-badge">✓</div>
            <h1>Done</h1>
            <div class="push-status success">
              Approval page complete. Aap is tab ko close kar sakte hain.
            </div>
          </main>
        `;
      } catch {}
    }, 450);
  }

  function autoClose(delay = 650) {
    if (terminal) return;

    terminal = true;
    busy = true;

    disableChoices();

    if (expiryTimer) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }

    setTimeout(
      tryClosePage,
      Math.max(0, Number(delay) || 0)
    );
  }

  function expireNow() {
    if (terminal) return;

    message(
      'Sign-in request expire ho gayi. Page automatically close ho raha hai…',
      'error'
    );

    autoClose(650);
  }

  function scheduleExpiry() {
    if (!expiresAt) return;

    const remaining =
      (expiresAt * 1000) - Date.now();

    if (remaining <= 0) {
      expireNow();
      return;
    }

    // Slight grace so laptop/backend and phone clocks do not race on the
    // exact millisecond boundary.
    expiryTimer = setTimeout(
      expireNow,
      remaining + 250
    );
  }

  async function updateServiceWorker() {
    try {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register(
          './push-sw.js?v=push2',
          { scope: './' }
        );
      }
    } catch {}
  }

  async function pick(choice) {
    if (busy || terminal) return;

    busy = true;
    disableChoices();

    message(
      'Secure approval verify ho rahi hai…',
      'busy'
    );

    try {
      const result =
        await self.CyberPushCommon.signedFetch(
          '/auth/push/approve',
          {
            challengeId,
            choice,
          }
        );

      if (result.approved) {
        message(
          'Approved ✓ Computer automatically login ho jayega. Page close ho raha hai…',
          'success'
        );

        autoClose(650);
        return;
      }

      message(
        'Wrong number selected — request denied. Page close ho raha hai…',
        'error'
      );

      autoClose(900);

    } catch (e) {
      message(
        'Request expire ya verify nahi ho saka. Page close ho raha hai…',
        'error'
      );

      autoClose(900);
    }
  }

  // Upgrade the already-enrolled phone to the new SW script URL without
  // requiring re-enrollment or a new QR.
  updateServiceWorker();

  const invalid =
    challengeId.length < 20 ||
    choices.length !== 3 ||
    new Set(choices).size !== 3;

  if (invalid) {
    message(
      'Ye sign-in request invalid hai. Page close ho raha hai…',
      'error'
    );

    autoClose(650);

  } else if (
    expiresAt &&
    Math.floor(Date.now() / 1000) > expiresAt
  ) {
    expireNow();

  } else {
    message(
      'Computer par jo number dikh raha hai, wahi tap karein.',
      'ready'
    );

    for (const n of choices) {
      const button =
        document.createElement('button');

      button.type = 'button';
      button.className = 'number-choice';
      button.textContent = String(n);

      button.addEventListener(
        'click',
        () => pick(n)
      );

      choicesBox.appendChild(button);
    }

    scheduleExpiry();
  }

  window.addEventListener(
    'pagehide',
    () => {
      if (expiryTimer) {
        clearTimeout(expiryTimer);
      }
    },
    { once: true }
  );
})();
