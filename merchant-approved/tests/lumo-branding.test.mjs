import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createBusiness} from '../dist/domain.js';
import {getMerchantLuxAnswer} from '../dist/lux-brain.js';
import {renderMerchantLux} from '../dist/lux-chat.js';
import {renderGuestCheckout} from '../dist/public-checkout.js';
import {handleMerchantLux} from '../api/merchant-lux.mjs';
import {systemNotesForDisplay} from '../../admin-portal/operational-model.js';

function fixture(){
 const state=createBusiness({name:'Lux Family Foods',ownerName:'Lux Mensah',phone:'0240000000',businessType:'Sole trader',destination:'Test only',verification:{identity:true,face:true},shop:{name:'Lux counter',area:'Night Market',category:'Food',lat:5.65,lng:-.18}});
 const actor={id:'10000000-0000-4000-8000-000000000001',role:'owner',active:true,shopIds:state.shops.map(s=>s.id),businessId:state.business.id};
 return {state,actor};
}

test('merchant conversation renders Lumo accessible branding using the same mascot asset and action routes',()=>{
 const f=fixture(),html=renderMerchantLux({...f,view:{messages:[]},connected:true});
 assert.match(html,/aria-label="Ask Lumo for Business"/);assert.match(html,/alt="Lumo, your business buddy"/);
 assert.match(html,/Ask Lumo about your business/);assert.doesNotMatch(html,/\bLux\b|\bLUX\b/);
 assert.match(html,/assets\/lux-chat-2d\.webp/);assert.match(html,/data-action="ask-lux"/);assert.match(html,/data-form="lux"/);
});

test('recorded answers use Lumo without altering their financial state or merchant names',()=>{
 const f=fixture(),before=structuredClone(f.state),answer=getMerchantLuxAnswer(f.state,'How much should I keep for stock?',{actor:f.actor});
 assert.match(answer.paragraphs.join(' '),/Lumo uses the target and expenses you record/);
 assert.doesNotMatch(answer.paragraphs.join(' '),/Lux uses/);assert.deepEqual(f.state,before);assert.equal(f.state.business.name,'Lux Family Foods');
});

test('old exact assistant copy is presented as Lumo while typed questions, names and original answers remain intact',()=>{
 const f=fixture(),question='How is Lux Family Foods doing?',answer={title:'Lux Family Foods received the most.',scope:'Lux counter',paragraphs:['Lux can read confirmed Lumo receipts, completed refunds and the business expenses you explicitly record. Cash sales, outside sales and unrecorded costs are not connected here.'],basis:['Recorded receipts only.'],stats:[{label:'Lux counter',value:'GH₵12.34'}],actions:[{page:'activity',label:'Review payments'}],followUps:['What is still processing?']};
 const view={messages:[{id:'old-user',role:'user',text:question},{id:'old-assistant',role:'assistant',answer}],pending:false};const before=structuredClone(view);
 const html=renderMerchantLux({...f,view,connected:true});assert.match(html,/>Lumo<\/span>/);assert.match(html,/How Lumo worked this out/);
 assert.match(html,/Lumo can read confirmed Lumo receipts/);assert.doesNotMatch(html,/Lux can read confirmed/);
 assert.match(html,/How is Lux Family Foods doing\?/);assert.match(html,/Lux Family Foods received the most/);assert.match(html,/Lux counter/);assert.match(html,/GH₵12\.34/);assert.match(html,/data-action="lux-open"/);
 assert.deepEqual(view,before,'brand presentation must not rewrite saved questions, evidence or action payloads');
});

test('checkout invitation introduces Lumo without changing the approved download or receipt actions',()=>{
 const html=renderGuestCheckout({phase:'invite',online:true,attempt:{status:'confirmed',receipt:{amount:1234}}});assert.match(html,/Meet Lumo, your money buddy/);assert.match(html,/Ask Lumo about your money/);assert.match(html,/alt="Lumo, your money buddy"/);assert.doesNotMatch(html,/\bLux\b|\bLUX\b/);
 assert.match(html,/downloads\/Lumo-Test-Android\.apk/);assert.match(html,/data-checkout-action="receipt"/);
});

test('merchant interpreter prompt uses Lumo and retains its read-only authority and internal endpoint contracts',async()=>{
 const f=fixture(),session={id:'synthetic-session',userId:f.actor.id,businessId:f.state.business.id,role:f.actor.role},snapshot={ok:true,sandbox:true,user:f.actor,session,state:f.state};
 const token='e30.'+Buffer.from(JSON.stringify({sub:f.actor.id})).toString('base64url')+'.synthetic';const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body)});
  if(url.endsWith('/functions/v1/lumo-approved'))return Response.json(snapshot);
  if(url.endsWith('/functions/v1/lumo-lux-quota'))return Response.json({allowed:true});
  assert.equal(url,'https://ai-gateway.vercel.sh/v1/chat/completions');const body=JSON.parse(options.body),prompt=body.messages[0].content;
  assert.match(prompt,/merchant questions for Lumo/);assert.doesNotMatch(prompt,/\bLux\b|\bLUX\b/);assert.match(prompt,/NEVER calculate money.*authorise a refund/);assert.match(prompt,/never authorisation/);
  assert.equal(body.response_format.json_schema.name,'lux_question_plan');
  return Response.json({choices:[{message:{content:JSON.stringify({task:'stock',confidence:1,period:null,shop:null,compareShop:null,reference:null,start:null,end:null})}}]});
 };
 const before=structuredClone(f.state),result=await handleMerchantLux({authorization:'Bearer '+token,body:{question:'How much should I keep for stock?',merchantToken:'a'.repeat(64)}},{fetcher,credential:'synthetic-key',serverProof:'synthetic-proof',limiter:new Map()});
 assert.equal(result.status,200);assert.equal(result.body.ok,true);assert.match(result.body.answer.paragraphs.join(' '),/Lumo uses/);assert.deepEqual(f.state,before);
 assert.equal(calls.filter(c=>c.url.endsWith('/functions/v1/lumo-approved')).length,2);assert.ok(calls.filter(c=>c.url.endsWith('/functions/v1/lumo-approved')).every(c=>c.body.path==='/api/session'&&c.body.method==='GET'));
});

test('admin maps only known immutable system note branding and preserves customer messages and record identity',()=>{
 const data={definitions:['Only recorded outcomes are counted. Client abandonments and Lux satisfaction are not yet instrumented.'],limitations:['Pause trigger and Lux answer telemetry are not recorded by the current backend.','Lux Bakery has an open case.'],record:{name:'Lux Mensah',amount:1234},messages:[{body:'I asked Lux about Lux Bakery.'}]},before=structuredClone(data);
 const display=systemNotesForDisplay(data);assert.match(display.definitions[0],/Lumo satisfaction/);assert.match(display.limitations[0],/Lumo answer telemetry/);assert.equal(display.limitations[1],data.limitations[1]);assert.equal(display.record,data.record);assert.equal(display.messages,data.messages);assert.deepEqual(data,before);
 assert.equal(systemNotesForDisplay(null),null);assert.equal(systemNotesForDisplay({message:'Lux should remain user-authored here.'}).message,'Lux should remain user-authored here.');
});

test('actual admin authentication layout names the unchanged companion image Lumo',async()=>{
 const source=await readFile(new URL('../../admin-portal/app.js',import.meta.url),'utf8'),fn=source.match(/^function authLayout\(card\)\{.*$/m)?.[0];assert.ok(fn);
 let tree;runInNewContext(fn+'\nauthLayout({tag:"card"});',{app:{replaceChildren:value=>{tree=value;}},el:(tag,attrs={},...children)=>({tag,attrs,children:children.flat(Infinity)}),brand:()=>({tag:'brand'}),icon:()=>({tag:'icon'})});
 const nodes=[];function walk(node){if(!node||typeof node!=='object')return;nodes.push(node);for(const child of node.children||[])walk(child);}walk(tree);
 const image=nodes.find(n=>n.tag==='img'&&n.attrs.src==='./assets/lux-chat-2d.webp');assert.ok(image);assert.equal(image.attrs.alt,'Lumo, your financial buddy');
});
