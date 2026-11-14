import {handleAPI} from '../server/api.js';
import {assets} from './assets.generated.js';
export default {async fetch(request,env,ctx){
 const api=await handleAPI(request,env);if(api)return api;
 const url=new URL(request.url),name=url.pathname==='/'?'/index.html':url.pathname;
 const asset=assets[name];if(!asset)return new Response('Page not found',{status:404});
 const bytes=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));
 return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset.type,'Cache-Control':name.endsWith('.woff2')?'public,max-age=604800':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'geolocation=(self), camera=(self), microphone=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://iwutbrljiiodamtyoorg.supabase.co https://lumo-connected-pilot.vercel.app; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://chatgpt.com; form-action 'self'"}});
}};
