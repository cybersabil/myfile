/* CYBERSABIL_PREFERRED_SPLIT_AUTH_ULTRA_V2 */
(() => {
  'use strict';

  const el=(tag,cls,text)=>{
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(text!==undefined)n.textContent=text;
    return n;
  };

  function build(auth){
    let shell=document.getElementById('premiumAuthShell');
    if(shell)return shell;

    shell=el('div');
    shell.id='premiumAuthShell';

    const hero=el('section','premiumAuthHero');
    const brand=el('div','premiumBrand');
    brand.append(el('div','premiumBrandMark','CS'),el('div','','CyberSabil'));

    const main=el('div','premiumHeroMain');
    main.append(el('div','premiumEyebrow','Protected workspace'));
    main.append(
      el('h1','','Your files. Private by design.'),
      el('p','','Secure access with password, authenticator verification and device-bound session protection.')
    );

    const chips=el('div','premiumTrustRow');
    ['Password + MFA','Device protected','Private access'].forEach(x=>{
      chips.append(el('span','premiumTrustChip',x));
    });
    main.append(chips);

    const foot=el('div','premiumHeroFoot');
    foot.append(el('span','premiumLiveDot'),el('span','','Secure gateway online'));
    hero.append(brand,main,foot);

    const pane=el('section','premiumAuthPane');
    const inner=el('div','premiumAuthInner');
    const top=el('div','premiumAuthTop');
    top.append(
      el('h2','','Sign in'),
      el('p','','Enter your credentials to continue to My Files.')
    );

    const primary=el('div');
    primary.id='premiumPrimaryMount';

    const divider=el('div','premiumDivider','Alternative');

    const options=el('details');
    options.id='premiumAuthOptions';
    const summary=el('summary','','More sign-in options');
    const passkeyMount=el('div');
    passkeyMount.id='premiumPasskeyMount';
    options.append(summary,passkeyMount);

    const authFoot=el('div','premiumAuthFoot','Protected by CyberSabil secure access controls');

    inner.append(top,primary,divider,options,authFoot);
    pane.append(inner);
    shell.append(hero,pane);
    auth.append(shell);
    return shell;
  }

  function decorate(panel){
    if(!panel)return;
    panel.querySelectorAll('input').forEach(input=>{
      input.spellcheck=false;
      if(input.type==='text'&&/username/i.test(input.placeholder||''))input.autocomplete='username';
      if(input.type==='password')input.autocomplete='current-password';
    });
  }

  function arrange(){
    const auth=document.getElementById('authLayer');
    if(!auth)return false;
    const shell=build(auth);

    const panel=document.getElementById('cybersabilPasswordPanel');
    const primary=document.getElementById('premiumPrimaryMount');
    if(panel&&primary&&panel.parentElement!==primary){
      primary.append(panel);
      decorate(panel);
    }

    const passkey=document.getElementById('loginBtn');
    const mount=document.getElementById('premiumPasskeyMount');
    if(passkey&&mount&&passkey.parentElement!==mount){
      if(!passkey.classList.contains('passkey-busy'))passkey.textContent='Continue with Passkey';
      mount.append(passkey);
    }

    Array.from(auth.children).forEach(child=>{
      if(child===shell)return;
      if(panel&&child.contains(panel))return;
      if(passkey&&child.contains(passkey))return;
      child.classList.add('premiumLegacyHidden');
    });

    return Boolean(panel&&passkey);
  }

  function ready(){
    arrange();
    requestAnimationFrame(()=>{
      document.documentElement.classList.remove('cy-preboot');
      document.documentElement.classList.add('cy-ui-ready');
    });
  }

  function boot(){
    ready();

    let scheduled=false;
    const ob=new MutationObserver(()=>{
      if(scheduled)return;
      scheduled=true;
      requestAnimationFrame(()=>{
        scheduled=false;
        arrange();
      });
    });

    ob.observe(document.documentElement,{subtree:true,childList:true});
    setTimeout(arrange,250);
    setTimeout(arrange,800);

    /* hard fail-safe: never leave page masked */
    setTimeout(()=>document.documentElement.classList.remove('cy-preboot'),2200);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
