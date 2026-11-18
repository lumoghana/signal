import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';
const repo=new URL('../../',import.meta.url),sha=value=>createHash('sha256').update(value).digest('hex');
const read=path=>readFile(new URL(path,repo));
function parsed(source){
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),strings=[];
 function walk(node){if(!node||typeof node!=='object')return;if(node.type==='Literal'&&typeof node.value==='string')strings.push(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else walk(value);}}
 walk(ast);return {ast,strings};
}
function canonical(node){
 if(Array.isArray(node))return node.map(canonical);if(!node||typeof node!=='object')return node;
 return Object.fromEntries(Object.entries(node).filter(([key])=>!['start','end'].includes(key)&&!(key==='raw'&&node.type==='Literal'&&typeof node.value==='string')).map(([key,value])=>[key,canonical(value)]));
}
function proveSummary(source,proof){
 assert.equal(sha(source),proof.afterSha256,'Exact reviewed generated summary bytes are required');
 const {ast,strings}=parsed(source.toString());
 for(const delta of proof.deltas){
  assert.equal(strings[delta.stringLiteralIndex]?.value,delta.after,'Only enumerated service copy may differ');
  assert.equal(delta.after,delta.before.replace(/\bLux\b/g,'Lumo').replace(/\bLUX\b/g,'LUMO'));
  strings[delta.stringLiteralIndex].value=delta.before;
 }
 assert.equal(sha(JSON.stringify(canonical(ast))),proof.baselineAstSha256,'All executable nodes, numeric values, regex flags and noncopy metadata must remain exact');
}
test('admin summary keeps every baseline executable AST node and changes only enumerated assistant copy',async()=>{
 const proof=JSON.parse(await read('backend/verification/branding-2.15.0/admin-summary-literal-delta.json'));
 const baseline=JSON.parse(await read('backend/verification/readiness-2.14.0/active-deployment.json'));
 assert.equal(proof.beforeSha256,baseline.functions['lumo-admin'].sourceHashes[proof.path]);
 assert.equal(proof.deltas.length,30);
 const source=await read(proof.path);proveSummary(source,proof);
 const edited=source.toString().replace('Object.assign','Object.create');assert.notEqual(edited,source.toString());
 assert.throws(()=>proveSummary(Buffer.from(edited),{...proof,afterSha256:sha(edited)}),/executable nodes/);
});
