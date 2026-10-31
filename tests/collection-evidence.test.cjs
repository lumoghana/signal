/* Payout evidence uses actual collection rules and UI drafts. FileReader and
   downloads are bounded platform doubles; no files leave the test process. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const source=fs.readFileSync(path.join(__dirname,'../dist/collection-evidence.js'),'utf8');
const png=Buffer.from([137,80,78,71,13,10,26,10,0,1,2,3]),pdf=Buffer.from('%PDF-1.7\nSample receipt\n%%EOF');
const attachment=(bytes=png,type='image/png',name='receipt.png')=>({name,type,size:bytes.length,dataUrl:'data:'+type+';base64,'+bytes.toString('base64')});
const settle=h=>{h.flushHistory();h.flush();};
const view=h=>h.document.getElementById('view');
function fixture({peopleCount=3}={}){
 const h=createHarness({clock:true,deferHistory:true}),L=h.L;L.explore();L.ensureAccounts?.();L.state.groupMoney=undefined;
 const future=new h.context.Date(h.context.Date.now()+14*86400000).toISOString().slice(0,10);
 const members=[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena'},{id:'kojo',name:'Kojo'},...Array.from({length:6},(_,i)=>({id:'member-'+i,name:'Member '+i}))].slice(0,peopleCount);
 const r=L.groupMoney.createCollection({title:'Study trip',target:'1200',deadline:future,members,mandateApproval:'named',mandateApproverIds:members.map(p=>p.id),mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:'evidence-group'});assert(r.ok,r.error);
 const item=r.item;for(const personId of members.filter(p=>p.id!=='self').map(p=>p.id))assert(L.groupMoney.acceptMandate({itemId:item.id,personId,version:2,sample:true}).ok);
 assert(L.groupMoney.recordSamplePayment({itemId:item.id,personId:'abena',amount:'600',reference:'evidence-funds'}).ok);
 const readers=[],downloads=[],blobs=[],revoked=[];
 class Reader{constructor(){readers.push(this);}readAsDataURL(file){this.file=file;}abort(){this.aborted=true;this.onabort?.();}finish(value){this.result=value;this.onload?.({target:this});}fail(){this.onerror?.();}}
 h.context.FileReader=Reader;h.context.atob=value=>Buffer.from(value,'base64').toString('binary');
 h.context.URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:evidence-'+blobs.length;};h.context.URL.revokeObjectURL=url=>revoked.push(url);
 const create=h.document.createElement;h.document.createElement=tag=>{const el=create(tag);if(tag==='a')el.click=()=>downloads.push({href:el.href,name:el.download,rel:el.rel});return el;};
 if(!L.collectionEvidence)vm.runInContext(source,h.context,{filename:'collection-evidence.js'});
 // Reopen a previously saved legacy draft; new payouts have rail-specific coverage.
 L.state.groupMoney.proposalDraft={account:String(L.state.profile.account||L.state.profile.handle||L.state.profile.phone||L.state.profile.name),itemId:item.id,key:L.id('legacy-proof'),recipient:'',purpose:'',amount:'',supportingReference:''};L.go('groupMoneyProposal',{id:item.id});settle(h);h.set('gm-proposal-recipient','Transport supplier');h.set('gm-proposal-purpose','Minibus deposit');h.set('gm-proposal-amount','150');h.set('gm-proposal-supportingReference','INV-101');
 return {h,L,G:L.groupMoney,item,readers,downloads,blobs,revoked};
}
function begin(f,raw=attachment()){
 const input=f.h.document.getElementById('gm-proposal-attachment');assert(input,'The actual request form has a file input');input.files=[{name:raw.name,type:raw.type,size:raw.size}];const accepted=f.L.collectionEvidence.add(input);return {input,reader:f.readers.at(-1),accepted,raw};
}
function upload(f,raw=attachment()){const x=begin(f,raw);assert(x.accepted);x.reader.finish(raw.dataUrl);return x;}
const draft=f=>f.L.state.groupMoney.proposalDraft;
const financial=f=>JSON.stringify({balance:f.L.state.balance,accounts:f.L.state.accounts,txs:f.L.state.txs,goals:f.L.state.goals,essentials:f.L.state.essentials});
const clean=f=>assert.deepEqual(f.h.errors,[]);

test('a valid local receipt preserves entered fields and becomes immutable proposal evidence',()=>{
 const f=fixture(),before=financial(f);upload(f);
 assert.equal(draft(f).recipient,'Transport supplier');assert.equal(draft(f).purpose,'Minibus deposit');assert.equal(draft(f).amount,'150');assert.equal(draft(f).supportingReference,'INV-101');assert.deepEqual(JSON.parse(JSON.stringify(draft(f).attachment)),attachment());
 assert(view(f.h).textContent.includes('receipt.png'));assert.equal(draft(f).review,undefined);assert.equal(f.downloads.length,0);
 f.L.gm.reviewProposal();settle(f.h);f.L.gm.createProposal();settle(f.h);const p=f.item.proposals[0];assert(p);assert.equal(p.attachment.dataUrl,attachment().dataUrl);assert(f.G.proposalSummary(f.item.id,p.id).valid);
 p.attachment.dataUrl=attachment(pdf,'application/pdf','other.pdf').dataUrl;assert.equal(f.G.proposalSummary(f.item.id,p.id).valid,false);assert.equal(financial(f),before);clean(f);
});

test('unsupported, oversized, mismatched and corrupt file payloads never replace valid evidence',()=>{
 const f=fixture();upload(f);const saved=JSON.stringify(draft(f).attachment),count=f.readers.length;
 assert.equal(begin(f,{...attachment(),type:'image/svg+xml'}).accepted,false);assert.equal(f.readers.length,count);
 assert.equal(begin(f,{...attachment(),size:200*1024+1}).accepted,false);assert.equal(f.readers.length,count);
 for(const bad of [{...attachment(),dataUrl:attachment(pdf,'application/pdf').dataUrl},{...attachment(),dataUrl:'data:image/png;base64,not canonical!'}]){const r=begin(f,bad);assert(r.accepted);r.reader.finish(bad.dataUrl);assert.equal(JSON.stringify(draft(f).attachment),saved);}
 assert(view(f.h).querySelector('#error').textContent);clean(f);
});

test('late file reads cannot attach after review, account replacement or an intervening draft change',()=>{
 for(const kind of ['review','account','draft','locked','changed']){
  const f=fixture(),r=begin(f),old=draft(f);assert(r.accepted);
  if(kind==='review'){f.L.gm.reviewProposal();settle(f.h);}
  if(kind==='account')f.L.state={...f.L.state,profile:{...f.L.state.profile,phone:'0559999999'}};
  if(kind==='draft')f.L.state.groupMoney.proposalDraft={...old,key:'a-new-request'};
  if(kind==='locked')f.L.state.locked=true;
  if(kind==='changed'){f.h.set('gm-proposal-purpose','A different expense');f.L.gm.captureProposal();}
  r.reader.finish(r.raw.dataUrl);assert.equal(old.attachment,undefined);assert.equal(draft(f).attachment,undefined);assert.equal(f.downloads.length,0);if(kind==='changed')assert.match(view(f.h).querySelector('#error').textContent,/request changed/);clean(f);
 }
});

test('removing evidence cancels an unfinished read and requires a fresh review without touching money',()=>{
 const f=fixture(),before=financial(f);upload(f);draft(f).review='an-old-review';const r=begin(f,attachment(pdf,'application/pdf','invoice.pdf'));
 assert(f.L.collectionEvidence.remove());assert.equal(draft(f).attachment,undefined);assert.equal(draft(f).review,undefined);assert(r.reader.aborted);r.reader.finish(r.raw.dataUrl);assert.equal(draft(f).attachment,undefined);assert.equal(financial(f),before);clean(f);
});

test('file-read errors and combined storage limits retain the previous evidence',()=>{
 const f=fixture();upload(f);const saved=JSON.stringify(draft(f).attachment),r=begin(f,attachment(pdf,'application/pdf','invoice.pdf'));r.reader.fail();assert.equal(JSON.stringify(draft(f).attachment),saved);
 f.L.state.groupMoney.previewMemo='X'.repeat(2*1024*1024);const next=begin(f,attachment(pdf,'application/pdf','invoice.pdf'));next.reader.finish(next.raw.dataUrl);assert.equal(JSON.stringify(draft(f).attachment),saved);assert.match(view(f.h).querySelector('#error').textContent,/saved-file space/);clean(f);
});

test('a browser save failure rolls back attachment changes and restores the existing save notification',()=>{
 const f=fixture(),toast=f.L.toast,original=f.h.context.localStorage.setItem;draft(f).review='prior-review';f.h.context.localStorage.setItem=()=>{throw new Error('Quota exceeded');};
 const r=begin(f);r.reader.finish(r.raw.dataUrl);assert.equal(draft(f).attachment,undefined);assert.equal(draft(f).review,'prior-review');assert.equal(f.L.toast,toast);assert.match(view(f.h).querySelector('#error').textContent,/could not be saved/);
 f.h.context.localStorage.setItem=original;clean(f);
});

test('supporting evidence downloads only after an explicit authorised detail action',async()=>{
 const f=fixture(),before=financial(f);upload(f,attachment(pdf,'application/pdf','../invoice.html'));f.L.gm.reviewProposal();settle(f.h);f.L.gm.createProposal();settle(f.h);const p=f.item.proposals[0];
 assert.equal(f.downloads.length,0);assert(f.L.collectionEvidence.download(f.item.id,p.id));assert.equal(f.downloads.length,1);assert.equal(f.h.document.getElementById('toast').textContent,'Downloading supporting file…');assert.equal(f.downloads[0].name,'.._invoice.pdf');assert.equal(f.blobs[0].type,'application/pdf');assert.equal(await f.blobs[0].text(),pdf.toString());
 f.h.advance(1000);assert.deepEqual(f.revoked,['blob:evidence-1']);assert.equal(f.h.document.querySelector('a[download]'),null);
 f.L.openTab('home');settle(f.h);assert.equal(f.L.collectionEvidence.download(f.item.id,p.id),false);assert.equal(f.downloads.length,1);assert.match(f.h.document.getElementById('toast').textContent,/no longer available.*Reopen/);assert.equal(financial(f),before);clean(f);
});

test('changed evidence and another account cannot retrieve a supporting file',()=>{
 for(const mode of ['tampered','foreign']){
  const f=fixture();upload(f);f.L.gm.reviewProposal();settle(f.h);f.L.gm.createProposal();settle(f.h);const p=f.item.proposals[0];
  if(mode==='tampered')p.attachment.size++;
  else f.L.state.profile.account='another-account';
  assert.equal(f.L.collectionEvidence.download(f.item.id,p.id),false);assert.equal(f.downloads.length,0);assert.match(f.h.document.getElementById('toast').textContent,/no longer available.*Reopen/);clean(f);
 }
});


test('compact evidence bindings allow the full file limit in a nine-approver collection',()=>{
 const f=fixture({peopleCount:9}),bytes=Buffer.alloc(200*1024);png.copy(bytes);upload(f,attachment(bytes));assert.equal(draft(f).attachment.size,200*1024);
 f.L.gm.reviewProposal();settle(f.h);f.L.gm.createProposal();settle(f.h);const p=f.item.proposals[0];assert(p);assert(f.G.proposalSummary(f.item.id,p.id).valid);assert(JSON.stringify(f.L.state.groupMoney).length<2*1024*1024);clean(f);
});
