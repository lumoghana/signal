import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/web-session.mjs';
const reply=()=>({statusCode:null,headers:{},setHeader(key,value){this.headers[key]=value;},end(value){this.body=JSON.parse(value);}});
test('Vercel lazy malformed JSON getter returns controlled 400 before Auth and keeps response guards',async()=>{
 const res=reply();await handler({method:'POST',headers:{},get body(){throw new SyntaxError('Synthetic invalid JSON');}},res);
 assert.equal(res.statusCode,400);assert.deepEqual(res.body,{ok:false,code:'INVALID_INPUT'});assert.equal(res.headers['Cache-Control'],'no-store, private');assert.equal(res.headers['X-Content-Type-Options'],'nosniff');assert.equal(res.headers['Set-Cookie'],undefined);
});
test('Vercel parsed-object and string JSON bodies both reach origin protection without an upstream call',async()=>{
 for(const body of [{operation:'probe'},'{"operation":"probe"}']){const res=reply();await handler({method:'POST',headers:{origin:'https://untrusted.example','x-lumo-web':'1'},body},res);assert.equal(res.statusCode,403);assert.equal(res.body.code,'ORIGIN_NOT_ALLOWED');assert.equal(res.headers['Set-Cookie'],undefined);}
});
test('declared oversized body is rejected before evaluating the lazy Vercel body getter',async()=>{
 const res=reply();let read=false;await handler({method:'POST',headers:{'content-length':'1150001'},get body(){read=true;throw Error('Must not read body');}},res);assert.equal(res.statusCode,413);assert.equal(read,false);assert.equal(res.headers['Set-Cookie'],undefined);
});
