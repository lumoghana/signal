import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Execute the actual response handler with only its asset/API imports injected.
// No account data, network requests, stored credentials or generated build files.
function worker() {
 const source=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'').replace('export default','globalThis.entry =');
 const scope={Response,URL,Uint8Array,atob,handleAPI:async()=>null,
  assets:{'/index.html':{type:'text/html; charset=utf-8',data:btoa('<html>Lumo</html>')},'/app.html':{type:'text/html; charset=utf-8',data:btoa('<html>Merchant</html>')}}};
 runInNewContext(source,scope);return scope.entry;
}

test('both merchant documents permit only this app, its configured shared backend and the Lumo Lux service',async()=>{
 const transport=readFileSync(new URL('../dist/connected-service.js',import.meta.url),'utf8');
 const configuredOrigin=new URL(transport.match(/const CONFIG=\{url:'([^']+)'/)[1]).origin;
 for(const path of ['/','/app.html']){
  const result=await worker().fetch(new Request('https://merchant.example.test'+path),{},{});
  assert.equal(result.status,200);
  const directives=Object.fromEntries(result.headers.get('Content-Security-Policy').split(';').map(value=>value.trim().split(/\s+/)).map(([key,...sources])=>[key,sources]));
  assert.deepEqual(directives['connect-src'],["'self'",configuredOrigin,'https://lumo-connected-pilot.vercel.app']);
  assert.deepEqual(directives['script-src'],["'self'"]);
  assert.deepEqual(directives['object-src'],["'none'"]);
  assert.deepEqual(directives['frame-ancestors'],["'self'",'https://chatgpt.com']);
  assert.equal(result.headers.get('Cache-Control'),'no-cache');
 }
});

test('HEAD keeps the same shared-backend policy without serving document bytes',async()=>{
 const result=await worker().fetch(new Request('https://merchant.example.test/app.html',{method:'HEAD'}),{},{});
 assert.match(result.headers.get('Content-Security-Policy'),/connect-src 'self' https:\/\/iwutbrljiiodamtyoorg\.supabase\.co https:\/\/lumo-connected-pilot\.vercel\.app;/);
 assert.equal(await result.text(),'');
});
