'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');

const scripts=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
if(!scripts.includes('product-finish.js'))scripts.push('product-finish.js');
const h=createHarness({testing:true,clock:true,modules:scripts});
const {L,document}=h;
const settle=()=>{h.flushHistory();h.flush();};
const reset=()=>{if(L.taskSheet.active){L.closeTask();settle();}L.explore();settle();};
const view=()=>document.getElementById('view');
const partnerError=()=>{
 document.getElementById('goalProtect').checked=true;L.toggleMoneyBoxProtectionFields();
 h.set('goalPartner','invalid');
 assert.equal(L.captureMoneyBoxProtection({}),false);
 return document.getElementById('goalPartner');
};

test('ordinary form errors retain the permanent protection explanation through repeated corrections',()=>{
 reset();
 // Exercise the existing full-page renderer/input listener as well as sheets.
 L.route='goalEdit';L.params={};L.render();settle();
 assert.equal(L.taskSheet.active,false);
 const before=JSON.stringify([L.state.balance,L.state.goals,L.state.txs]);
 const field=partnerError();
 assert.equal(field.getAttribute('aria-describedby'),'goalPartnerHint error');
 assert.equal(document.activeElement,field);
 L.error('Check the partner number again.','goalPartner');
 assert.equal(field.getAttribute('aria-describedby'),'goalPartnerHint error');
 h.set('goalPartner','0245551234');
 assert.equal(field.getAttribute('aria-invalid'),null);
 assert.equal(field.getAttribute('aria-describedby'),'goalPartnerHint');
 partnerError();h.set('goalPartner','0245551234');
 assert.equal(field.getAttribute('aria-describedby'),'goalPartnerHint');
 assert.equal(JSON.stringify([L.state.balance,L.state.goals,L.state.txs]),before);
 assert.equal(view().querySelector('.product-title-echo'),null,'standalone headings stay visible');
});

test('native task input correction clears only the error token and preserves other descriptions',()=>{
 reset();L.go('goalEdit');settle();
 assert.ok(L.taskSheet.active);
 const field=partnerError();
 field.setAttribute('aria-describedby','goalPartnerHint error another-hint');
 h.set('goalPartner','0245551234');
 assert.equal(field.getAttribute('aria-describedby'),'goalPartnerHint another-hint');
 L.error('Check it once more.','goalPartner');
 assert.equal(field.getAttribute('aria-describedby'),'goalPartnerHint another-hint error');
 h.set('goalPartner','0245551234');
 assert.equal(field.getAttribute('aria-describedby'),'goalPartnerHint another-hint');
 const name=document.getElementById('goalName');
 assert.equal(name.getAttribute('aria-describedby'),null);
 L.error('Give this box a name.','goalName');h.set('goalName','Laptop');
 assert.equal(name.getAttribute('aria-describedby'),null,'error-only relationships leave no empty attribute');
});

test('exact task title echoes keep an accessible h1, artwork and subtitles without changing money',()=>{
 reset();L.go('addMoney');settle();
 const heading=view().querySelector('.page-heading>h1');
 const title=document.getElementById('task-sheet-title');
 assert.equal(heading.textContent,'Add money.');
 assert.ok(heading.classList.contains('product-title-echo'));
 assert.equal(heading.hidden,false);assert.equal(heading.getAttribute('aria-hidden'),null);
 assert.equal(document.activeElement,title,'entry focus uses the visible native title');
 const art=view().querySelectorAll('.scene-art').length;
 const state=JSON.stringify(L.state);
 L.productFinish.sync();L.productFinish.sync();
 assert.equal(view().querySelectorAll('[data-product-title-echo]').length,1);
 assert.equal(view().querySelectorAll('.scene-art').length,art);
 assert.equal(JSON.stringify(L.state),state);
 L.closeTask();settle();
 const box=L.state.goals[0];L.go('releaseGoal',{id:box.id});settle();
 const page=view().querySelector('.page-heading');
 assert.ok(page.querySelector('h1').classList.contains('product-title-echo'));
 assert.ok(page.querySelector('p').textContent.includes(box.name),'entity subtitle remains visible');
 assert.equal(page.classList.contains('product-title-only'),false);
});

test('entity names and functional status rows survive even when their wording matches chrome',()=>{
 reset();const box=L.state.goals[0];box.name='Your Money Box';L.go('goal',{id:box.id});settle();
 const heading=view().querySelector('.page-heading>h1');
 assert.equal(heading.textContent,'Your Money Box');
 assert.equal(document.getElementById('task-sheet-title').textContent,'Your Money Box');
 assert.equal(heading.classList.contains('product-title-echo'),false,'a user-owned name remains visible');
 L.closeTask();settle();L.go('devices');settle();
 const rows=view().querySelectorAll('.topline');
 const legacy=rows.find(row=>row.querySelector('[aria-label="Go back"]')&&row.querySelector('[aria-label="Get help"]'));
 const status=rows.find(row=>row.querySelector('strong'));
 assert.ok(legacy?.hidden,'only duplicate navigation is hidden');
 assert.ok(status);assert.equal(status.hidden,false);assert.ok(status.textContent.includes('This browser'));
 assert.equal(document.querySelector('.task-sheet-back').hidden,false);
 assert.equal(document.querySelector('.task-sheet-help').hidden,false);
 assert.deepEqual(h.errors,[]);
});

test('Home reserves enlarged private amount lines without copying a number into hidden markup',()=>{
 reset();
 const amount=view().querySelector('.everyday-primary-money>strong');
 const reserve=amount.querySelector('.product-money-reserve');
 assert.ok(reserve);assert.equal(reserve.getAttribute('aria-hidden'),'true');
 assert.equal(reserve.textContent,'','neutral reservation is generated by CSS, not DOM money text');
 const money=view().querySelector('[data-private-value]');
 assert.ok(money.textContent.includes(L.signalEdition?'₵':'GH₵'));
 const before=JSON.stringify(L.state);
 L.hidePrivateMoney();
 assert.ok(money.querySelector('.money-mask'));
 assert.equal(reserve.textContent,'');
 assert.equal(amount.querySelectorAll('.product-money-reserve').length,1);
 L.productFinish.sync();L.productFinish.sync();
 assert.equal(amount.querySelectorAll('.product-money-reserve').length,1);
 assert.equal(JSON.stringify(L.state),before);
});
