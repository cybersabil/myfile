/* CYBERSABIL_PUSH_APPROVE_V1 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const status = $('status');
  const choicesBox = $('choices');
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const challengeId = params.get('c') || '';
  const choices = String(params.get('n') || '').split(',').map(Number).filter(n => Number.isInteger(n) && n >= 10 && n <= 99);
  const expiresAt = Number(params.get('e') || 0);
  let busy = false;

  function message(text, tone = '') {
    status.className = 'push-status' + (tone ? ` ${tone}` : '');
    status.textContent = text;
  }

  async function pick(choice) {
    if (busy) return;
    busy = true;
    [...choicesBox.querySelectorAll('button')].forEach(b => b.disabled = true);
    message('Secure approval verify ho rahi hai…', 'busy');
    try {
      const result = await self.CyberPushCommon.signedFetch('/auth/push/approve', {
        challengeId,
        choice,
      });
      if (result.approved) {
        message('Approved ✓ Computer automatically login ho jayega.', 'success');
      } else {
        message('Wrong number selected — sign-in request denied.', 'error');
      }
    } catch (e) {
      message('Request expired ya verify nahi ho saka. Computer par dobara sign in karein.', 'error');
    }
  }

  if (challengeId.length < 20 || choices.length !== 3 || new Set(choices).size !== 3 || (expiresAt && Math.floor(Date.now() / 1000) > expiresAt)) {
    message('Ye sign-in request invalid ya expired hai.', 'error');
  } else {
    message('Computer par jo number dikh raha hai, wahi tap karein.', 'ready');
    for (const n of choices) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'number-choice';
      b.textContent = String(n);
      b.addEventListener('click', () => pick(n));
      choicesBox.appendChild(b);
    }
  }
})();
