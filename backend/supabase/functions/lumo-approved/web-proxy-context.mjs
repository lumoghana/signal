/** Browser proxy provenance is authenticated independently of client Auth.
 * Only the browser server has a signing key; Edge keeps public verifiers. */
import {WEB_PROXY_PUBLIC_KEYS} from './web-proxy-public-keys.mjs';
export async function trustedWebProxyIp(request,body,{publicKeys=WEB_PROXY_PUBLIC_KEYS,now=Date.now,cryptoApi=globalThis.crypto}={}){
 const context=request.headers.get('x-lumo-web-context'),signature=request.headers.get('x-lumo-web-signature');
 if(typeof context!=='string'||!/^v1\.[A-Za-z0-9_-]{1,48}\.[0-9]{13}\.[a-f0-9]{64}$/.test(context)||!signature||!/^[a-f0-9]{128}$/.test(signature))return null;
 const [version,kid,time,digest]=context.split('.'),timestamp=Number(time);if(Math.abs(now()-timestamp)>60_000||!Object.hasOwn(publicKeys,kid))return null;
 const bytes=new TextEncoder(),hex=b=>[...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join('');
 const hash=hex(await cryptoApi.subtle.digest('SHA-256',bytes.encode(JSON.stringify(body))));
 // Edge gateways may retain or strip /functions/v1; the fixed function name is
 // the stable audience. A signature for access cannot authorize approved.
 const audience=new URL(request.url).pathname.split('/').filter(Boolean).at(-1);
 const message=['lumo-web-proxy-v1',context,audience,hash].join('\n');
 try{
  const key=await cryptoApi.subtle.importKey('jwk',publicKeys[kid],{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  const sig=Uint8Array.from(signature.match(/../g),x=>parseInt(x,16));
  if(!await cryptoApi.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,sig,bytes.encode(message)))return null;
  return 'web-proxy:'+digest;
 }catch{return null;}
}
