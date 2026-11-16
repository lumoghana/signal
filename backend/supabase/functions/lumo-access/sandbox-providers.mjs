/**
 * Explicit test-only substitutes for Hubtel delivery and Smile ID decisions.
 * This module does not send SMS, compare faces, detect liveness, contact NIA,
 * or retain photographs. Camera capture belongs to the client. A simulated
 * clear result is NEVER production identity evidence or a password-reset grant.
 * The API/database must independently validate session capability, ownership,
 * expiry, attempts and one-use reset authorization before changing credentials.
 */
const UUID=/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const MODULES=new Set(['consumer','merchant','admin']);
const FACE_SCENARIOS=new Set(['clear','pending','no_match','spoof','unavailable']);
const PURPOSES=new Set(['setup','signup','enrollment','recovery','password-reset']);
const PHOTO_PREFIX='data:image/jpeg;base64,';
const MAX_PHOTO_BYTES=1048576;
const MAX_CAPTURE_BYTES=2097152;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,allowed,required=allowed)=>object(value)&&required.every(key=>Object.hasOwn(value,key))&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&allowed.includes(key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const uuid=value=>typeof value==='string'&&UUID.test(value);
function error(code){return Object.assign(new Error(code==='SANDBOX_INVALID_INPUT'?'Check this Lumo test verification request.':'This simulated verification service is unavailable.'),{code,status:code==='SANDBOX_INVALID_INPUT'?400:503,simulation:true,environment:'sandbox'});}
const invalid=()=>{throw error('SANDBOX_INVALID_INPUT');};
function phone(value){
 if(typeof value!=='string'||value.length>24||!/^[+0-9 ()-]+$/.test(value))invalid();
 const number=value.replace(/[ ()-]/g,'').replace(/^\+?233/,'0');
 if(!/^0[25][0-9]{8}$/.test(number))invalid();
 return '+233'+number.slice(1);
}
function decodePhoto(value){
 if(typeof value!=='string'||!value.startsWith(PHOTO_PREFIX)||value.length>PHOTO_PREFIX.length+4*Math.ceil(MAX_PHOTO_BYTES/3))invalid();
 const encoded=value.slice(PHOTO_PREFIX.length);
 if(encoded.length<8||encoded.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))invalid();
 let binary;try{binary=atob(encoded);}catch{invalid();}
 if(binary.length<4||binary.length>MAX_PHOTO_BYTES||btoa(binary)!==encoded)invalid();
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 if(bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)invalid();
 return bytes;
}
function hashText(bytes){let value='';for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}

/** Server configuration only. Never pass an HTTP request body into this factory. */
export function createSandboxProviders({enabled=false,now=()=>Date.now(),crypto:cryptoApi=globalThis.crypto,faceScenario='clear',smsScenario='accepted',...unsupported}={}){
 const available=enabled===true&&Object.keys(unsupported).length===0&&typeof now==='function'&&typeof cryptoApi?.randomUUID==='function'&&typeof cryptoApi?.subtle?.digest==='function'&&FACE_SCENARIOS.has(faceScenario)&&['accepted','unavailable'].includes(smsScenario);
 const clock=()=>{const value=now();if(!Number.isFinite(value)||value<0||value>=8640000000000000)throw error('SANDBOX_UNAVAILABLE');return new Date(value).toISOString();};
 const reference=()=>{const value=cryptoApi.randomUUID();if(!uuid(value))throw error('SANDBOX_UNAVAILABLE');return value.toLowerCase();};
 return Object.freeze({available,provider:'sandbox',simulation:true,environment:'sandbox',
  async sendSms(input){
   if(!available)throw error('SANDBOX_DISABLED');
   if(!exact(input,['to','code','purpose'])||typeof input.code!=='string'||!/^\d{6}$/.test(input.code)||typeof input.purpose!=='string'||!PURPOSES.has(input.purpose))invalid();
   phone(input.to);
   try{
    clock();if(smsScenario==='unavailable')throw error('SMS_UNAVAILABLE');
    // The API may show its separately held demo code. This adapter never returns
    // the code or number and makes no delivery claim.
    return Object.freeze({accepted:true,delivered:false,simulation:true,environment:'sandbox',provider:'hubtel-simulator',providerReference:'sms-sandbox-'+reference()});
   }catch(failure){if(failure?.code==='SMS_UNAVAILABLE')throw failure;throw error('SANDBOX_UNAVAILABLE');}
  },
  async verifyFace(input){
   if(!available)throw error('SANDBOX_DISABLED');
   if(!exact(input,['module','subjectId','referenceId','purpose','photos'],['module','subjectId','purpose','photos'])||typeof input.module!=='string'||!MODULES.has(input.module)||!uuid(input.subjectId)||!['enrollment','authentication'].includes(input.purpose)||!Array.isArray(input.photos)||input.photos.length!==3||(input.referenceId!==undefined&&!uuid(input.referenceId))||(input.purpose==='authentication'&&!uuid(input.referenceId)))invalid();
   // Disallow accessor/sparse arrays before accessing photo contents.
   if(!Reflect.ownKeys(input.photos).every(key=>key==='length'||(['0','1','2'].includes(key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(input.photos,key),'value')))||![0,1,2].every(index=>Object.hasOwn(input.photos,index)))invalid();
   const frames=[];
   try{
    for(let index=0;index<3;index++)frames.push(decodePhoto(input.photos[index]));
    if(frames.reduce((sum,frame)=>sum+frame.byteLength,0)>MAX_CAPTURE_BYTES)invalid();
    const frameHashes=[];
    for(const frame of frames){const digest=await cryptoApi.subtle.digest('SHA-256',frame);if(!(digest instanceof ArrayBuffer)||digest.byteLength!==32)throw error('SANDBOX_UNAVAILABLE');frameHashes.push(hashText(new Uint8Array(digest)));}
    return Object.freeze({status:faceScenario,provider:'smile-id-simulator',simulation:true,environment:'sandbox',livenessVerified:false,identityVerified:false,module:input.module,subjectId:input.subjectId.toLowerCase(),referenceId:input.referenceId?.toLowerCase()||reference(),purpose:input.purpose,frameHashes:Object.freeze(frameHashes),processedAt:clock()});
   }catch(failure){if(failure?.code==='SANDBOX_INVALID_INPUT')throw failure;throw error('SANDBOX_UNAVAILABLE');}
   finally{for(const frame of frames)frame.fill(0);}
  },
 });
}

