/* CYBERSABIL_PREMIUM_AUTH_UI_V2 */

(() => {
  'use strict';

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function buildShell(auth) {
    let shell = document.getElementById('premiumAuthShell');

    if (shell) return shell;

    shell = el('div');
    shell.id = 'premiumAuthShell';

    const hero = el('section','premiumAuthHero');

    const brand = el('div','premiumBrand');
    brand.append(
      el('div','premiumBrandMark','CS'),
      el('div','','CyberSabil')
    );

    const main = el('div','premiumHeroMain');
    main.append(
      el('div','premiumEyebrow','Protected Workspace')
    );

    const h1 = el('h1','','Your files. Private by design.');
    const p = el(
      'p',
      '',
      'Secure access with password, authenticator verification and device-bound session protection.'
    );

    const chips = el('div','premiumTrustRow');

    ['Password + MFA','Device protected','Private access']
      .forEach(x => chips.append(
        el('span','premiumTrustChip',x)
      ));

    main.append(h1,p,chips);

    const heroFoot = el('div','premiumHeroFoot');
    heroFoot.append(
      el('span','premiumLiveDot'),
      el('span','','Secure gateway online')
    );

    hero.append(brand,main,heroFoot);

    const pane = el('section','premiumAuthPane');
    const inner = el('div','premiumAuthInner');

    const top = el('div','premiumAuthTop');
    top.append(
      el('h2','','Sign in'),
      el('p','','Enter your credentials to continue to My Files.')
    );

    const primary = el('div');
    primary.id = 'premiumPrimaryMount';

    const divider = el('div','premiumDivider','Alternative');

    const options = el('details');
    options.id = 'premiumAuthOptions';

    const summary = el(
      'summary',
      '',
      'More sign-in options'
    );

    const passkeyMount = el('div');
    passkeyMount.id = 'premiumPasskeyMount';

    options.append(summary,passkeyMount);

    const foot = el(
      'div',
      'premiumAuthFoot',
      'Protected by CyberSabil secure access controls'
    );

    inner.append(
      top,
      primary,
      divider,
      options,
      foot
    );

    pane.append(inner);
    shell.append(hero,pane);
    auth.append(shell);

    return shell;
  }

  function decoratePasswordPanel(panel) {
    if (!panel) return;

    panel.classList.add('premiumPasswordPanel');

    const inputs = panel.querySelectorAll('input');

    inputs.forEach(input => {
      input.setAttribute('spellcheck','false');

      if (
        input.type === 'text' &&
        /username/i.test(input.placeholder || '')
      ) {
        input.autocomplete = 'username';
      }

      if (input.type === 'password') {
        input.autocomplete = 'current-password';
      }
    });
  }

  function arrange() {
    const auth = document.getElementById('authLayer');
    if (!auth) return false;

    const shell = buildShell(auth);

    const panel =
      document.getElementById('cybersabilPasswordPanel');

    const primary =
      document.getElementById('premiumPrimaryMount');

    if (
      panel &&
      primary &&
      panel.parentElement !== primary
    ) {
      primary.append(panel);
      decoratePasswordPanel(panel);
    }

    const passkey =
      document.getElementById('loginBtn');

    const passkeyMount =
      document.getElementById('premiumPasskeyMount');

    if (
      passkey &&
      passkeyMount &&
      passkey.parentElement !== passkeyMount
    ) {
      passkey.textContent = 'Continue with Passkey';
      passkeyMount.append(passkey);
    }

    Array.from(auth.children).forEach(child => {
      if (child === shell) return;

      if (
        child.contains(panel) ||
        child.contains(passkey)
      ) return;

      child.classList.add('premiumLegacyHidden');
    });

    return Boolean(panel && passkey);
  }

  function boot() {
    arrange();

    let scheduled = false;

    const observer = new MutationObserver(() => {
      if (scheduled) return;

      scheduled = true;

      requestAnimationFrame(() => {
        scheduled = false;
        arrange();
      });
    });

    observer.observe(document.documentElement,{
      subtree:true,
      childList:true
    });

    setTimeout(arrange,250);
    setTimeout(arrange,800);
    setTimeout(arrange,1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded',boot);
  } else {
    boot();
  }
})();
