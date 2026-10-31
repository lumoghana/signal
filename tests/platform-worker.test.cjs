'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{webcrypto,createHash}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../dist/sw.js'),'utf8'),origin='https://lumo.example';
const hash=body=>createHash('sha256').update(body).digest('hex');
function worker({badHash=false}={}){
 const listeners=new Map(),stores=new Map(),requests=[];let offline=false,claimed=0,skipped=0;
 const bodies={'/index.html':'<!doctype html><html><head><title>Lumo</title></head><body><h1>Saved preview</h1></body></html>','/lumo-runtime.0123456789ab.js':'/* public script */'};
 const config={schemaVersion:1,namespace:'lumo-mono-test',version:'version-new',assets:Object.entries(bodies).map(([url,body])=>({url,sha256:badHash&&url.includes('runtime')?'0'.repeat(64):hash(body)}))};
 const key=request=>new URL(typeof request==='string'?request:request.url,origin).pathname;
 const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const map=stores.get(name);return {async put(request,response){map.set(key(request),response.clone());},async match(request){return map.get(key(request))?.clone();}};},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}};
 class LocalRequest extends Request{constructor(input,options){super(typeof input==='string'?new URL(input,origin):input,options);}}
 const context={URL,Request:LocalRequest,Response,crypto:webcrypto,Uint8Array,Set,Promise,Error,caches,fetch:async request=>{const url=typeof request==='string'?request:request.url;requests.push(url);if(offline)throw Error('Offline');const body=bodies[key(request)];return body===undefined?new Response('Unlisted',{status:404}):new Response(body,{status:200,headers:{'Content-Type':url.includes('.js')?'text/javascript':'text/html'}});},importScripts:()=>{context.self.LUMO_PRECACHE=config;},self:{location:{origin},addEventListener:(type,fn)=>listeners.set(type,fn),clients:{claim:async()=>claimed++},skipWaiting:()=>skipped++}};
 vm.runInNewContext(source,context,{filename:'sw.js'});
 const lifecycle=async type=>{let pending;listeners.get(type)({waitUntil:p=>{pending=p;}});await pending;};
 const fetchEvent=async request=>{let response;listeners.get('fetch')({request,respondWith:p=>{response=p;}});return response?await response:undefined;};
 return {context,config,stores,requests,listeners,lifecycle,fetchEvent,setOffline:value=>offline=value,get claimed(){return claimed;},get skipped(){return skipped;}};
}
test('installation verifies public shell hashes and waits for explicit update activation',async()=>{
 const w=worker();await w.lifecycle('install');assert.equal(w.stores.size,1);assert.equal([...w.stores.values()][0].size,2);assert.equal(w.skipped,0);await w.lifecycle('activate');assert.equal(w.claimed,1);w.listeners.get('message')({data:{type:'LUMO_ACTIVATE_UPDATE'}});assert.equal(w.skipped,1);
});
test('failed integrity leaves no partial new cache',async()=>{const w=worker({badHash:true});await assert.rejects(w.lifecycle('install'),/changed during installation/);assert.equal(w.stores.size,0);});
test('offline navigation provides marked read-only shell and exact public asset from cache',async()=>{
 const w=worker();await w.lifecycle('install');w.setOffline(true);const shell=await w.fetchEvent({url:origin+'/?ambassador=1',method:'GET',mode:'navigate'});assert.equal(shell.status,200);assert.match(await shell.text(),/meta name="lumo-shell-offline"/);const script=await w.fetchEvent({url:origin+'/lumo-runtime.0123456789ab.js',method:'GET',mode:'cors'});assert.equal(await script.text(),'/* public script */');
});
test('never intercepts API, exported records, foreign-origin, POST or explicit connection probes',async()=>{
 const w=worker();await w.lifecycle('install');for(const request of [{url:origin+'/api/payments',method:'POST',mode:'cors'},{url:origin+'/api/records',method:'GET',mode:'cors'},{url:origin+'/Lumo-Demo-Data.json',method:'GET',mode:'cors'},{url:'https://foreign.example/index.html',method:'GET',mode:'cors'},{url:origin+'/manifest.webmanifest?lumo-connection-check=1',method:'GET',mode:'cors'}])assert.equal(await w.fetchEvent(request),undefined);assert.equal([...w.stores.values()][0].size,2);
});
test('cache cleanup preserves prior shell and every other edition cache',async()=>{
 const w=worker();await w.context.caches.open('lumo-shell-lumo-mono-test-oldest');await w.context.caches.open('lumo-shell-lumo-mono-test-previous');await w.context.caches.open('lumo-shell-other-edition-current');await w.lifecycle('install');await w.lifecycle('activate');const names=await w.context.caches.keys();assert(!names.includes('lumo-shell-lumo-mono-test-oldest'));assert(names.includes('lumo-shell-lumo-mono-test-previous'));assert(names.includes('lumo-shell-other-edition-current'));
});
