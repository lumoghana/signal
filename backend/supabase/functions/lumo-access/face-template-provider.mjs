/** Private real-template processor. No browser-generated embeddings or verdicts. */
export const FACE_MODEL_ID='opencv-sface-2021dec-v1';
export const FACE_MODEL_SHA256='0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79';
export const FACE_CONSENT_VERSION='2026-11-16.face.1';
const URL_ALLOWED='https://lumo-connected-pilot.vercel.app/api/face';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HEX=/^[a-f0-9]{64}$/;
const encode=new TextEncoder();
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const fail=code=>Object.assign(new Error('Your face could not be checked safely. Please try again.'),{code,status:code==='INVALID_INPUT'?400:503});
const safeCodes=new Set(['FACE_NOT_FOUND','MULTIPLE_FACES','FACE_TOO_SMALL','FACE_LIGHTING','FACE_BLURRY','FACE_INCONSISTENT','FACE_CAPTURE_REPLAY','INVALID_IMAGE','FACE_TEMPLATE_UNAVAILABLE','FACE_REQUEST_EXPIRED','FACE_SERVICE_BUSY','FACE_MODEL_UNAVAILABLE','FACE_CONFIGURATION_UNAVAILABLE','FACE_PROCESSING_UNAVAILABLE','INVALID_INPUT']);
const hex=value=>Array.from(new Uint8Array(value),byte=>byte.toString(16).padStart(2,'0')).join('');
function secretBytes(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value))return null;
 try{const bytes=Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='),c=>c.charCodeAt(0));return bytes.length===32?bytes:null;}catch{return null;}
}
export function createFaceTemplateProvider({url='',secret='',fetch:transport=globalThis.fetch,crypto:cryptoApi=globalThis.crypto,now=Date.now,timeoutMs=15000}={}){
 const bytes=secretBytes(secret),available=url===URL_ALLOWED&&bytes!==null&&typeof transport==='function'&&!!cryptoApi?.subtle;
 let imported;
 const key=()=>imported||=(cryptoApi.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign','verify']));
 const hash=async text=>hex(await cryptoApi.subtle.digest('SHA-256',encode.encode(text)));
 async function call(operation,input){
  if(!available)throw fail('FACE_CONFIGURATION_UNAVAILABLE');
  const fields=['requestId','module','subjectId','templateId','templateVersion','consentVersion','photos',...(operation==='verify'?['templateCiphertext']:[])];
  if(!exact(input,fields)||!['consumer','merchant','admin'].includes(input.module)||['requestId','subjectId','templateId'].some(k=>!UUID.test(input[k]||''))||input.templateVersion!==1||input.consentVersion!==FACE_CONSENT_VERSION||!Array.isArray(input.photos)||input.photos.length!==3||input.photos.some(p=>typeof p!=='string'||p.length>349551||!p.startsWith('data:image/jpeg;base64,'))||operation==='verify'&&(typeof input.templateCiphertext!=='string'||input.templateCiphertext.length>12288))throw fail('INVALID_INPUT');
  const body=JSON.stringify({operation,...input});if(encode.encode(body).length>1_100_000)throw fail('INVALID_INPUT');
  const timestamp=String(Math.floor(now()/1000));
  const signature=hex(await cryptoApi.subtle.sign('HMAC',await key(),encode.encode('lumo-face-request-v1\n'+timestamp+'\n'+body)));
  let response,text;
  const controller=new AbortController();let timer;
  const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(fail('FACE_PROCESSING_UNAVAILABLE'));},Math.min(20000,Math.max(1,timeoutMs)));});
  try{
   response=await Promise.race([transport(url,{method:'POST',redirect:'error',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','X-Lumo-Face-Timestamp':timestamp,'X-Lumo-Face-Signature':signature},body}),expired]);
   if(response.redirected||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw fail('FACE_PROCESSING_UNAVAILABLE');
   const reader=response.body?.getReader();if(!reader)throw fail('FACE_PROCESSING_UNAVAILABLE');const parts=[];let length=0;
   try{while(true){const part=await Promise.race([reader.read(),expired]);if(part.done)break;length+=part.value.byteLength;if(length>20000)throw fail('FACE_PROCESSING_UNAVAILABLE');parts.push(part.value);}}
   finally{reader.cancel().catch(()=>{});reader.releaseLock();}
   const joined=new Uint8Array(length);let offset=0;for(const p of parts){joined.set(p,offset);offset+=p.length;}text=new TextDecoder('utf-8',{fatal:true}).decode(joined);
   const receivedAt=response.headers.get('x-lumo-face-timestamp')||'',receivedSignature=response.headers.get('x-lumo-face-signature')||'';
   if(!/^\d{10}$/.test(receivedAt)||Math.abs(Math.floor(now()/1000)-Number(receivedAt))>60||!HEX.test(receivedSignature))throw fail('FACE_PROCESSING_UNAVAILABLE');
   const signingInput='lumo-face-response-v1\n'+receivedAt+'\n'+input.requestId+'\n'+await hash(body)+'\n'+text;
   const signatureBytes=Uint8Array.from(receivedSignature.match(/../g),x=>parseInt(x,16));
   if(!await cryptoApi.subtle.verify('HMAC',await key(),signatureBytes,encode.encode(signingInput)))throw fail('FACE_PROCESSING_UNAVAILABLE');
   let data;try{data=JSON.parse(text);}catch{throw fail('FACE_PROCESSING_UNAVAILABLE');}
   if(data?.requestId!==input.requestId)throw fail('FACE_PROCESSING_UNAVAILABLE');
   if(!response.ok||data.ok!==true)throw fail(safeCodes.has(data.code)?data.code:'FACE_PROCESSING_UNAVAILABLE');
   const expected=['ok','requestId','modelId','modelSha256','templateId','templateVersion','frameHashes','keyVersion',operation==='enroll'?'templateCiphertext':'matched'];
   if(!exact(data,expected)||data.modelId!==FACE_MODEL_ID||data.modelSha256!==FACE_MODEL_SHA256||data.templateId!==input.templateId||data.templateVersion!==1||typeof data.keyVersion!=='string'||!/^[A-Za-z0-9_-]{1,40}$/.test(data.keyVersion)||!Array.isArray(data.frameHashes)||data.frameHashes.length!==3||new Set(data.frameHashes).size!==3||data.frameHashes.some(x=>!HEX.test(x))||operation==='enroll'&&(typeof data.templateCiphertext!=='string'||data.templateCiphertext.length<32||data.templateCiphertext.length>12288)||operation==='verify'&&typeof data.matched!=='boolean')throw fail('FACE_PROCESSING_UNAVAILABLE');
   const {ok,requestId,...result}=data;return result;
  }catch(error){throw fail(safeCodes.has(error?.code)?error.code:'FACE_PROCESSING_UNAVAILABLE');}finally{clearTimeout(timer);controller.abort();}
 }
 return Object.freeze({available,faceMatching:'stored-template',identityVerified:false,livenessVerified:false,enrollFace:input=>call('enroll',input),verifyFace:input=>call('verify',input)});
}
