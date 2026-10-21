'use strict';
(function (host) {
  const APP_ID = 'wxd0f801bb287615fd';
  const SOURCE_URL = 'https://tinglele2017-ctrl.github.io/obsidian-journal-web/';
  const ITERATIONS = 600000;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', {fatal:true});
  const CONFIG_ERROR = '网页密码资料不完整，请刷新网页后重试。';
  const PASSWORD_ERROR = '密码不对，或文件未完整加载。请检查后再试。';

  function decode(value, length, maxLength) {
    if(typeof value!=='string'||!value||value.length%4!==0||value.length>maxLength||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw new Error(CONFIG_ERROR);
    let raw;
    try{raw=Uint8Array.from(atob(value),char=>char.charCodeAt(0));}catch(_){throw new Error(CONFIG_ERROR);}
    if(length!==undefined&&raw.length!==length)throw new Error(CONFIG_ERROR);
    return raw;
  }

  function validateWrap(value) {
    if(!value||value.version!==1||value.iterations!==ITERATIONS||value.appId!==APP_ID||value.sourceUrl!==SOURCE_URL)throw new Error(CONFIG_ERROR);
    const salt=decode(value.salt,24,32),nonce=decode(value.nonce,12,16),cipher=decode(value.ciphertext,undefined,4096);
    if(cipher.length<17||cipher.length>1040)throw new Error(CONFIG_ERROR);
    return{salt,nonce,cipher};
  }

  function validateManifest(value) {
    if(!value||value.version!==1||value.iterations!==ITERATIONS)throw new Error(CONFIG_ERROR);
    const salt=decode(value.salt,24,32),nonce=decode(value.nonce,12,16),cipher=decode(value.ciphertext,undefined,24*1024*1024);
    if(cipher.length<16)throw new Error(CONFIG_ERROR);
    return{salt,nonce,cipher};
  }

  async function derive(password, salt) {
    const material=await host.crypto.subtle.importKey('raw',password,'PBKDF2',false,['deriveKey']);
    return host.crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
  }

  async function decryptJournal(password, manifest, passwordWrap, options) {
    const isCurrent=options&&options.isCurrent||(()=>true);
    const check=()=>{if(!isCurrent())throw new Error('解锁已取消');};
    let input,unwrapped,plain;
    try{
      check();
      if(!host.crypto||!host.crypto.subtle)throw new Error('此浏览器需要通过 HTTPS 打开网页。');
      const wrap=validateWrap(passwordWrap),data=validateManifest(manifest);
      input=encoder.encode(String(password||''));
      const wrapKey=await derive(input,wrap.salt);check();
      input.fill(0);
      try{unwrapped=new Uint8Array(await host.crypto.subtle.decrypt({name:'AES-GCM',iv:wrap.nonce,additionalData:encoder.encode('journal-password-wrap:v1:'+APP_ID+':'+SOURCE_URL)},wrapKey,wrap.cipher));}catch(_){throw new Error(PASSWORD_ERROR);}
      check();
      if(!unwrapped.length||unwrapped.length>1024)throw new Error(CONFIG_ERROR);
      const key=await derive(unwrapped,data.salt);check();
      unwrapped.fill(0);
      try{plain=new Uint8Array(await host.crypto.subtle.decrypt({name:'AES-GCM',iv:data.nonce,additionalData:encoder.encode('journal:v1')},key,data.cipher));}catch(_){throw new Error(PASSWORD_ERROR);}
      check();
      let payload;
      try{payload=JSON.parse(decoder.decode(plain));}catch(_){throw new Error('随记文件格式有误。');}
      if(!payload||!Array.isArray(payload.notes))throw new Error('随记文件格式有误。');
      return{key,payload};
    }finally{
      if(input)input.fill(0);
      if(unwrapped)unwrapped.fill(0);
      if(plain)plain.fill(0);
    }
  }

  const api=Object.freeze({decryptJournal});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else host.JournalPasswordCrypto=api;
})(globalThis);
