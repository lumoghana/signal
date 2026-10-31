/* Asset and state semantics. This does not replace a rendered-device QA pass. */
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'../dist');
const L={route:'home',state:{txs:[]},params:{},illustration:(kind,compact)=>`base:${kind}:${compact}`,contextualIllustration:route=>`context:${route}`};
L.clarityArt={resultTx:()=>L.state.txs.find(t=>t.id===(L.params.id||L.state.paymentDraft?.submittedTxId)),confirmed:tx=>tx?.status==='success'&&(!tx.delivery||tx.delivery==='delivered')};
vm.runInNewContext(fs.readFileSync(path.join(root,'expressive-art.js'),'utf8'),{L});
for(const name of Object.values(L.expressiveArt.scenes)){
 const bytes=fs.readFileSync(path.join(root,'assets/expressive',name));
 assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');
 assert.equal(bytes.readUInt32BE(16),1536);assert.equal(bytes.readUInt32BE(20),1024);
 assert.equal(bytes[25],6,'RGBA source preserves generated transparency');
}
const art=(html,scene)=>{
 assert.match(html,new RegExp(`data-art="expressive-${scene}-v2"`));
 assert.equal((html.match(/<img /g)||[]).length,1,'One complete scene, not multiple independent actor layers');
 assert.match(html,/aria-hidden="true"/);assert.match(html,/alt=""/);
 assert.doesNotMatch(html,/GH₵|<text|<canvas|<svg|onload=|onerror=/);
};
art(L.illustration('home'),'home');art(L.illustration('clarity'),'home');
L.route='welcome';assert.equal(L.illustration('clarity'),'base:clarity:false');
for(const kind of ['pause','decision','tradeoff']){
 const html=L.illustration(kind);art(html,'pause');assert.match(html,/scene-size-decision/);
}
for(const kind of ['welcome','phone','funding','goals','chat','merchant','pay','help','success'])assert.equal(L.illustration(kind),`base:${kind}:false`,'Retain original scene family outside the three intended moments');
for(const route of ['home','chat','authorize','paymentReview','pending','activity'])assert.equal(L.contextualIllustration(route),`context:${route}`);
L.route='paymentResult';L.params={id:'tx'};
for(const status of ['pending','failed','reversed','cancelled',undefined]){
 L.state.txs=[{id:'tx',status}];assert.equal(L.expressiveArt.confirmed(),false);
 assert.equal(L.contextualIllustration('paymentResult'),'context:paymentResult');
 assert.equal(L.illustration('success'),'base:success:false');
}
for(const delivery of ['pending','failed','unknown']){
 L.state.txs=[{id:'tx',status:'success',delivery}];assert.equal(L.expressiveArt.confirmed(),false);
 assert.equal(L.illustration('paymentResult'),'base:paymentResult:false');
}
for(const delivery of ['delivered',undefined]){
 L.state.txs=[{id:'tx',status:'success',delivery}];
 const snapshot=JSON.stringify(L.state);
 art(L.contextualIllustration('paymentResult'),'confirmed');art(L.illustration('paymentResult'),'confirmed');art(L.illustration('success'),'confirmed');
 assert.equal(JSON.stringify(L.state),snapshot,'Rendering does not mutate money or payment state');
}
L.params={};L.state.paymentDraft={submittedTxId:'tx'};art(L.contextualIllustration('paymentResult'),'confirmed');
L.params={id:'missing'};assert.equal(L.contextualIllustration('paymentResult'),'context:paymentResult','Missing transactions cannot celebrate');
console.log('PASS three original transparent scenes, Home/Pause scope, unchanged fallback family, confirmed-only result art and read-only rendering.');
