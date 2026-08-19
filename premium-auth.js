/* CYBERSABIL_ULTRA_PREMIUM_AUTH_SHELL_V1 */
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
    hero.append(brand);

    const pane=el('section','premiumAuthPane');
    const inner=el('div','premiumAuthInner');
    const top=el('div','premiumAuthTop');
    top.append(
      el('h2','','Welcome back'),
      el('p','','Sign in securely to access your private files.')
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

    const foot=el('div','premiumAuthFoot','Protected by CyberSabil secure access controls');

    inner.append(top,primary,divider,options,foot);
    pane.append(inner);
    shell.append(hero,pane);
    auth.append(shell);
    return shell;
  }

  function arrange(){
    const auth=document.getElementById('authLayer');
    if(!auth)return false;
    const shell=build(auth);

    const panel=document.getElementById('cybersabilPasswordPanel');
    const primary=document.getElementById('premiumPrimaryMount');
    if(panel&&primary&&panel.parentElement!==primary){
      primary.append(panel);
      panel.querySelectorAll('input').forEach(input=>{
        input.spellcheck=false;
        if(input.type==='text'&&/username/i.test(input.placeholder||''))input.autocomplete='username';
        if(input.type==='password')input.autocomplete='current-password';
      });
    }

    const passkey=document.getElementById('loginBtn');
    const mount=document.getElementById('premiumPasskeyMount');
    if(passkey&&mount&&passkey.parentElement!==mount){
      passkey.textContent='Continue with Passkey';
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

  function boot(){
    arrange();
    let scheduled=false;
    const ob=new MutationObserver(()=>{
      if(scheduled)return;
      scheduled=true;
      requestAnimationFrame(()=>{scheduled=false;arrange();});
    });
    ob.observe(document.documentElement,{subtree:true,childList:true});
    setTimeout(arrange,250);
    setTimeout(arrange,800);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
