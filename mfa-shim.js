/* CYBERSABIL_PASSKEY_MFA_POLISHED_V3 */
(() => {
  'use strict';

  const realFetch=window.fetch.bind(window);

  function onlyDigits(v){return String(v||'').replace(/\D+/g,'')}

  function focusNow(input){
    if(!input)return;
    const run=()=>{
      try{
        input.focus({preventScroll:true});
        const n=input.value?.length||0;
        if(typeof input.setSelectionRange==='function')input.setSelectionRange(n,n);
      }catch{}
    };
    requestAnimationFrame(run);
    setTimeout(run,50);
    setTimeout(run,150);
  }

  function shake(el){
    el.classList.remove('cy-shake');
    void el.offsetWidth;
    el.classList.add('cy-shake');
    setTimeout(()=>el.classList.remove('cy-shake'),420);
  }

  function note(node,text,tone='muted'){
    node.className='cy-inline-note '+tone;
    node.textContent=text||'';
  }

  async function post(origin,path,body){
    const r=await realFetch(origin+path,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
      cache:'no-store'
    });

    let data={};
    try{data=await r.json()}catch{}

    if(!r.ok){
      const e=new Error(data.error||data.message||('HTTP_'+r.status));
      e.code=data.error||('HTTP_'+r.status);
      e.status=r.status;
      e.payload=data;
      throw e;
    }
    return data;
  }

  function synthetic(original,data){
    const h=new Headers(original.headers);
    h.set('Content-Type','application/json; charset=utf-8');
    h.set('Cache-Control','no-store');
    return new Response(JSON.stringify(data),{status:200,headers:h});
  }

  function modal(title){
    const o=document.createElement('div');
    o.className='cy-mfa-overlay';

    const box=document.createElement('div');
    box.className='cy-mfa-card';

    const h=document.createElement('h2');
    h.textContent=title;
    box.appendChild(h);

    o.appendChild(box);
    document.body.appendChild(o);
    return {o,box};
  }

  function paragraph(box,text){
    const p=document.createElement('p');
    p.textContent=text;
    box.appendChild(p);
    return p;
  }

  function input(placeholder,codeMode=false){
    const i=document.createElement('input');
    i.type='text';
    i.placeholder=placeholder;
    i.autocomplete=codeMode?'one-time-code':'off';
    i.inputMode=codeMode?'numeric':'text';
    i.className='cy-modal-input'+(codeMode?' cy-mfa-code':'');
    return i;
  }

  function button(label,secondary=false){
    const b=document.createElement('button');
    b.type='button';
    b.textContent=label;
    b.className='cy-modal-btn '+(secondary?'secondary':'primary');
    return b;
  }

  async function recoveryScreen(codes){
    return new Promise(resolve=>{
      const {o,box}=modal('Save recovery codes');
      paragraph(box,'These 10 codes are single-use emergency access codes. Save them somewhere secure and offline.');

      const ta=document.createElement('textarea');
      ta.readOnly=true;
      ta.value=codes.join('\n');
      ta.style.cssText='box-sizing:border-box;width:100%;height:220px;padding:11px;border:1px solid #dce3ec;border-radius:10px;font:13px/1.55 ui-monospace,monospace;color:#172033;background:#fbfcfe;';
      box.appendChild(ta);

      const copy=button('Copy recovery codes');
      const done=button('I saved them',true);
      box.append(copy,done);

      copy.onclick=async()=>{
        try{
          await navigator.clipboard.writeText(ta.value);
          copy.textContent='Copied';
        }catch{
          ta.focus();
          ta.select();
        }
      };
      done.onclick=()=>{o.remove();resolve()};
    });
  }

  async function challenge(origin,data){
    let setup=null;
    if(!data.mfaEnrolled){
      setup=await post(origin,'/auth/mfa/enroll',{mfaToken:data.mfaToken});
    }

    return new Promise((resolve,reject)=>{
      const {o,box}=modal(data.mfaEnrolled?'Authenticator':'Set up Authenticator');

      paragraph(
        box,
        data.mfaEnrolled
          ? 'Enter the 6-digit code from your authenticator. You can switch to a recovery code if needed.'
          : 'Scan the QR code with your authenticator app, then enter the 6-digit code.'
      );

      if(!data.mfaEnrolled&&setup?.otpauthUri){
        const wrap=document.createElement('div');
        wrap.style.cssText='display:flex;justify-content:center;padding:8px 0 12px';
        const canvas=document.createElement('canvas');
        wrap.appendChild(canvas);
        box.appendChild(wrap);

        if(window.QRCode&&typeof window.QRCode.toCanvas==='function'){
          window.QRCode.toCanvas(canvas,setup.otpauthUri,{width:220,margin:2});
        }

        const manual=document.createElement('input');
        manual.readOnly=true;
        manual.value=setup.secret||'';
        manual.className='cy-modal-input';
        manual.style.fontFamily='ui-monospace,monospace';
        box.appendChild(manual);
      }

      let mode='totp';

      const toggle=document.createElement('button');
      toggle.type='button';
      toggle.style.cssText='width:100%;padding:5px 0 8px;border:0;background:transparent;color:#5c6ed6;font-size:11px;font-weight:620;cursor:pointer;';
      if(data.mfaEnrolled){
        toggle.textContent='Use recovery code instead';
        box.appendChild(toggle);
      }

      const field=input('6-digit code',true);
      box.appendChild(field);

      const msg=document.createElement('div');
      note(msg,'Type all 6 digits — verification starts automatically.','muted');
      box.appendChild(msg);

      const verify=button(data.mfaEnrolled?'Verify':'Verify & enable MFA');
      const cancel=button('Cancel',true);
      box.append(verify,cancel);

      let pending=false;
      let timer=null;

      function setMode(next){
        mode=next;
        clearTimeout(timer);
        field.value='';
        field.classList.remove('cy-input-error');

        if(mode==='totp'){
          field.placeholder='6-digit code';
          field.inputMode='numeric';
          field.classList.add('cy-mfa-code');
          toggle.textContent='Use recovery code instead';
          note(msg,'Type all 6 digits — verification starts automatically.','muted');
        }else{
          field.placeholder='Recovery code';
          field.inputMode='text';
          field.classList.remove('cy-mfa-code');
          toggle.textContent='Use 6-digit code instead';
          note(msg,'Enter one unused recovery code and press Enter or Verify.','muted');
        }
        focusNow(field);
      }

      async function submit(){
        if(pending)return;

        const raw=field.value.trim();
        if(mode==='totp'){
          field.value=onlyDigits(raw).slice(0,6);
          if(!/^\d{6}$/.test(field.value)){
            field.classList.add('cy-input-error');
            note(msg,'Enter a valid 6-digit code.','error');
            shake(box);
            focusNow(field);
            return;
          }
        }else if(!raw){
          field.classList.add('cy-input-error');
          note(msg,'Enter a recovery code.','error');
          shake(box);
          focusNow(field);
          return;
        }

        pending=true;
        field.disabled=true;
        verify.disabled=true;
        cancel.disabled=true;
        toggle.disabled=true;
        note(msg,'Verifying…','muted');

        try{
          let result;
          if(mode==='totp'){
            result=await post(origin,'/auth/mfa/verify',{
              mfaToken:data.mfaToken,
              code:field.value.trim()
            });
          }else{
            result=await post(origin,'/auth/mfa/recovery',{
              mfaToken:data.mfaToken,
              code:raw
            });
          }

          o.remove();

          if(Array.isArray(result.recoveryCodes)&&result.recoveryCodes.length){
            await recoveryScreen(result.recoveryCodes);
          }
          resolve(result);

        }catch(e){
          pending=false;
          field.disabled=false;
          verify.disabled=false;
          cancel.disabled=false;
          toggle.disabled=false;

          const c=String(e.code||'');

          if([
            'MFA_DENIED',
            'MFA_DENIED_OR_REPLAY',
            'MFA_CODE_REPLAY',
            'MFA_PENDING_INVALID',
            'RECOVERY_DENIED',
            'HTTP_401'
          ].includes(c)){
            field.value='';
            field.classList.add('cy-input-error');
            note(
              msg,
              mode==='totp'
                ? 'Incorrect or expired code. Try again.'
                : 'Recovery code is invalid or already used.',
              'error'
            );
            shake(box);
            focusNow(field);
            return;
          }

          if(['MFA_LOCKED','LOGIN_LOCKED','RATE_LIMITED','HTTP_429'].includes(c)){
            note(msg,'Too many attempts. Please wait before trying again.','error');
            shake(box);
            focusNow(field);
            return;
          }

          note(msg,'Verification failed. Please try again.','error');
          shake(box);
          focusNow(field);
        }
      }

      if(data.mfaEnrolled){
        toggle.onclick=()=>setMode(mode==='totp'?'recovery':'totp');
      }

      field.addEventListener('input',()=>{
        field.classList.remove('cy-input-error');
        if(mode!=='totp')return;
        field.value=onlyDigits(field.value).slice(0,6);
        clearTimeout(timer);
        if(field.value.length===6)timer=setTimeout(submit,220);
      });

      field.addEventListener('keydown',e=>{
        if(e.key!=='Enter'||e.isComposing)return;
        e.preventDefault();
        submit();
      });

      verify.onclick=submit;
      cancel.onclick=()=>{o.remove();reject(new Error('MFA_CANCELLED'))};

      focusNow(field);
    });
  }

  window.fetch=async function(inputArg,init){
    const original=await realFetch(inputArg,init);

    let u;
    try{
      const raw=inputArg instanceof Request?inputArg.url:String(inputArg);
      u=new URL(raw,window.location.href);
    }catch{
      return original;
    }

    if(
      original.status!==200 ||
      !(
        u.pathname.endsWith('/auth/login/verify') ||
        u.pathname.endsWith('/auth/register/verify')
      )
    ){
      return original;
    }

    let data;
    try{data=await original.clone().json()}catch{return original}

    if(!data?.mfaRequired||!data?.mfaToken)return original;

    try{
      const verified=await challenge(u.origin,data);
      return synthetic(original,{
        verified:true,
        sessionToken:verified.sessionToken,
        expiresAt:verified.expiresAt
      });
    }catch(e){
      return new Response(JSON.stringify({
        error:'MFA_FAILED',
        message:e?.message||'MFA_FAILED'
      }),{
        status:401,
        headers:{'Content-Type':'application/json'}
      });
    }
  };
})();
