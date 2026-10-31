/* Private shared costs in this device's demo. A request is never spendable
   money; only a uniquely referenced confirmed sample credit changes funds. */
(()=>{
'use strict';
if(!window.L||L.sharedExpenses)return;
const E=L.e,M=L.money,B=L.btn,err='<div id="error" role="alert"></div>';
const now=()=>new Date().toISOString();
const own=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed;
const store=()=>{
 const value=L.state.sharedExpenses;
 if(!value||!Array.isArray(value.groups))L.state.sharedExpenses={groups:[],draft:null,receiptDraft:null};
 return L.state.sharedExpenses;
};
const tx=id=>(L.state.txs||[]).find(t=>t.id===id);
const group=id=>store().groups.find(g=>g.id===id);
const request=id=>(L.state.requests||[]).find(r=>r.id===id);
const cents=value=>{
 if(typeof value!=='number'&&!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(value??'').trim()))return null;
 const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=1000000&&Math.abs(n*100-Math.round(n*100))<.000001?Math.round(n*100):null;
};
const moneyC=c=>M(c/100),normal=value=>String(value||'').trim().normalize('NFKC').toLowerCase();
const netCents=t=>{
 const refunds=(L.state.txs||[]).filter(r=>r.originalId===t?.id&&r.type==='in'&&r.status==='success').reduce((sum,r)=>sum+(cents(r.amount)||0),0);
 return Math.max(0,(cents(t?.amount)||0)-Math.max(cents(t?.refunded)||0,refunds));
};
const eligible=t=>!!t&&t.type==='out'&&t.status==='success'&&!t.internal&&!L.isInternalTransfer?.(t)&&netCents(t)>0;
const quote=t=>JSON.stringify([t?.id,t?.type,t?.status,t?.amount,t?.fee||0,netCents(t),!!t?.internal,!!L.isInternalTransfer?.(t)]);
const paidFor=(g,s)=>(L.state.txs||[]).filter(t=>t.type==='in'&&t.status==='success'&&t.sharedGroupId===g.id&&t.sharedShareId===s.id&&!t.internal&&!L.isInternalTransfer?.(t)).reduce((sum,t)=>sum+(cents(t.amount)||0),0);
const summary=g=>{
 const shares=(g?.shares||[]).map(s=>({...s,receivedCents:paidFor(g,s),dueCents:Math.max(0,s.amountCents-paidFor(g,s))}));
 const askedCents=shares.reduce((n,s)=>n+s.amountCents,0),receivedCents=shares.reduce((n,s)=>n+s.receivedCents,0),dueCents=shares.reduce((n,s)=>n+s.dueCents,0);
 return {shares,askedCents,receivedCents,dueCents,status:dueCents===0?'settled':receivedCents>0?'partial':'waiting'};
};
const sourceCurrent=g=>eligible(tx(g?.txId))&&g.sourceQuote===quote(tx(g.txId));
const liveRequest=r=>!!r&&r.from==='self'&&['waiting','processing'].includes(r.status)&&new Date(r.expires).getTime()>Date.now();
const makeRequest=(g,s,amount)=>({id:L.id('RQ'),from:'self',name:L.state.profile.name,handle:L.state.profile.handle||'you',to:s.name,amount:amount/100,note:g.title,status:'waiting',created:now(),expires:new Date(Date.now()+7*86400000).toISOString(),sharedGroupId:g.id,sharedShareId:s.id});
const syncRequests=g=>{
 for(const s of g.shares){const r=request(s.requestId);if(!r)continue;const paid=paidFor(g,s),due=Math.max(0,s.amountCents-paid);r.receivedAmount=paid/100;
  if(due===0){r.status='paid';const received=(L.state.txs||[]).filter(t=>t.sharedGroupId===g.id&&t.sharedShareId===s.id&&t.type==='in'&&t.status==='success');if(received.length)r.txId=received[0].id;}
  else if(r.status==='waiting'&&new Date(r.expires).getTime()<=Date.now())r.status='expired';
 }
};
const line=(label,value)=>`<div><dt>${E(label)}</dt><dd>${String(value).startsWith('GH₵')?'<span class="shared-money">'+value+'</span>':value}</dd></div>`;
const boundary='<p class="shared-boundary">Private, same-device preview. Requests do not move money or work as payable links on another phone.</p>';
const field=(label,id,value,type='text',extra='')=>`<label class="field" for="${id}"><span>${E(label)}</span><input id="${id}" name="${id}" type="${type}" value="${E(value)}" ${type==='number'?'inputmode="decimal" min="0" max="1000000" step="0.01"':'maxlength="60"'} ${extra}></label>`;
const equal=d=>{
 const n=d.friends.length+1,base=Math.floor(d.totalCents/n),remaining=d.totalCents-base*n;
 d.ownerAmount=((base+remaining)/100).toFixed(2);d.friends.forEach(s=>{s.amount=(base/100).toFixed(2);});
};
const capture=()=>{
 const d=store().draft;if(!d)return;
 const title=document.getElementById('shared-title');if(title)d.title=title.value.slice(0,60);
 const owner=document.getElementById('shared-owner');if(owner)d.ownerAmount=owner.value;
 d.friends.forEach((s,i)=>{const name=document.getElementById('shared-name-'+i),amount=document.getElementById('shared-amount-'+i);if(name)s.name=name.value.slice(0,60);if(amount)s.amount=amount.value;});
};
const validate=d=>{
 if(!d||!eligible(tx(d.txId)))return 'Choose a completed payment that has not been fully refunded.';
 if(d.totalCents!==netCents(tx(d.txId)))return 'This payment changed. Reopen the split to use its latest amount.';
 if(!d.title?.trim())return 'Give this shared cost a short name.';
 if(!Array.isArray(d.friends)||d.friends.length<1||d.friends.length>5)return 'Add between one and five friends.';
 const names=new Set(),owner=cents(d.ownerAmount);if(owner===null)return 'Check your share. Use no more than two decimal places.';
 let total=owner,positive=false;
 for(const s of d.friends){const name=normal(s.name),amount=cents(s.amount);
  if(!name)return 'Add a name for each friend.';
  if(['you','me',normal(L.state.profile.name)].includes(name))return 'Your share is already included. Add a friend’s name.';
  if(names.has(name))return 'Each friend should appear once.';names.add(name);
  if(amount===null||amount>500000)return 'Each friend’s request must be between GH₵0.00 and GH₵5,000.00, with no more than two decimals.';
  total+=amount;positive=positive||amount>0;
 }
 if(total!==d.totalCents)return `Shares must add up to ${moneyC(d.totalCents)}. They currently add up to ${moneyC(total)}.`;
 if(!positive)return 'Give at least one friend a share to request.';
 return '';
};
L.openSharedExpenses=()=>L.go('sharedExpenses');
L.startSharedExpense=id=>{
 if(!own())return L.toast('Sign in to your demo account first.');const t=tx(id);
 const canonical=L.groupMoney?.splitForSource?.(id);if(canonical)return L.go(canonical.kind==='current'?'groupMoneyDetail':'sharedGroup',{id:canonical.id});
 if(!eligible(t))return L.toast('Only a completed outgoing payment can be split.');
 const existing=store().groups.find(g=>g.txId===id);if(existing)return L.go('sharedGroup',{id:existing.id});
 let d=store().draft;
 if(!d||d.txId!==id||d.createdGroupId||d.totalCents!==netCents(t)){d={id:L.id('SG'),txId:id,totalCents:netCents(t),title:String(t.note||t.name||'Shared cost').slice(0,60),mode:'equal',ownerAmount:'',friends:[{id:L.id('SS'),name:'',amount:''},{id:L.id('SS'),name:'',amount:''}],stage:'form'};equal(d);store().draft=d;}
 L.save();L.go(d.stage==='review'?'sharedSplitReview':'sharedSplit',{id:d.id,txId:d.txId});
};
L.captureSharedSplit=()=>{capture();L.save();};
const renderSplitDraft=()=>{
 const d=store().draft;
 // Recomputed shares and reindexed friends come from the saved split draft.
 // A resumed sheet's old field snapshot must not overwrite those changes.
 if(d)L.clearFormDraft?.('sharedSplit',{id:d.id,txId:d.txId});
 L.render();
};
L.setSharedSplitMode=mode=>{capture();const d=store().draft;if(!d||!['equal','custom'].includes(mode))return;d.mode=mode;if(mode==='equal')equal(d);d.stage='form';L.save();renderSplitDraft();};
L.addSharedFriend=()=>{capture();const d=store().draft;if(!d||d.friends.length>=5)return;d.friends.push({id:L.id('SS'),name:'',amount:''});if(d.mode==='equal')equal(d);d.stage='form';L.save();renderSplitDraft();};
L.removeSharedFriend=i=>{capture();const d=store().draft;if(!d||d.friends.length<=1||!Number.isInteger(i)||!d.friends[i])return;d.friends.splice(i,1);if(d.mode==='equal')equal(d);d.stage='form';L.save();renderSplitDraft();};
L.reviewSharedExpense=()=>{capture();const d=store().draft,message=validate(d);if(message)return L.error(message);d.stage='review';d.sourceQuote=quote(tx(d.txId));L.save();L.go('sharedSplitReview',{id:d.id,txId:d.txId});};
L.editSharedExpense=()=>{const d=store().draft;if(d){d.stage='form';L.save();L.go('sharedSplit',{id:d.id,txId:d.txId});}};
L.createSharedExpense=()=>{
 if(!own())return L.error('Sign in to your demo account first.');const d=store().draft;
 const canonical=d&&L.groupMoney?.splitForSource?.(d.txId);if(canonical?.kind==='current')return L.go('groupMoneyDetail',{id:canonical.id});
 const existing=d&&group(d.createdGroupId||d.id);if(existing)return L.go('sharedGroup',{id:existing.id});
 const message=validate(d);if(message)return L.error(message);
 if(!d.sourceQuote||d.sourceQuote!==quote(tx(d.txId)))return L.error('This payment changed. Edit the split and review it again.');
 const duplicate=store().groups.find(g=>g.txId===d.txId);if(duplicate)return L.go('sharedGroup',{id:duplicate.id});
 const g={id:d.id,txId:d.txId,title:d.title.trim(),totalCents:d.totalCents,ownerCents:cents(d.ownerAmount),sourceQuote:d.sourceQuote,created:now(),shares:[]};
 const requests=[];for(const friend of d.friends){const amount=cents(friend.amount);if(amount===0)continue;const s={id:friend.id,name:friend.name.trim(),amountCents:amount};const r=makeRequest(g,s,amount);s.requestId=r.id;g.shares.push(s);requests.push(r);}
 L.state.requests=L.state.requests||[];L.state.requests.unshift(...requests);store().groups.unshift(g);d.createdGroupId=g.id;d.stage='created';L.save();L.go('sharedGroup',{id:g.id});
};
L.prepareSharedReceipt=(id,shareId)=>{
 if(!own())return;const g=group(id),s=g?.shares.find(x=>x.id===shareId);if(!s)return;
 const r=request(s.requestId),due=Math.max(0,s.amountCents-paidFor(g,s));if(!sourceCurrent(g)||!liveRequest(r)||due<=0)return L.toast('This request cannot receive another sample payment.');
 const old=store().receiptDraft;if(!old||old.groupId!==id||old.shareId!==shareId||old.txId)store().receiptDraft={groupId:id,shareId,reference:L.id('SC'),amount:(due/100).toFixed(2)};
 L.save();L.go('sharedReceive',{id,shareId,reference:store().receiptDraft.reference});
};
L.captureSharedReceipt=()=>{const d=store().receiptDraft,input=document.getElementById('shared-received-amount');if(d&&input){d.amount=input.value;L.save();}};
L.simulateSharedReceipt=()=>{
 if(!own())return L.error('Sign in to your demo account first.');L.captureSharedReceipt();const d=store().receiptDraft,g=group(d?.groupId),s=g?.shares.find(x=>x.id===d?.shareId);if(!d||!g||!s)return L.error('Open a saved shared-cost request first.');
 if(d.txId){L.go('sharedGroup',{id:g.id});return tx(d.txId);}
 const existing=(L.state.txs||[]).find(t=>t.draftId==='shared-receipt-'+d.reference);
 if(existing){if(existing.sharedGroupId!==g.id||existing.sharedShareId!==s.id)return L.error('This reference belongs to another sample payment.');d.txId=existing.id;syncRequests(g);L.save();L.go('sharedGroup',{id:g.id});return existing;}
 const r=request(s.requestId),amount=cents(d.amount),due=Math.max(0,s.amountCents-paidFor(g,s));
 if(!sourceCurrent(g))return L.error('The original payment changed. New repayments are paused.');
 if(!liveRequest(r))return L.error('This request is closed. Create a fresh request for the unpaid share.');
 if(amount===null||amount<=0||amount>due)return L.error(`Enter an amount above GH₵0.00 and no more than ${moneyC(due)}.`,'shared-received-amount');
 const t=L.addTx({draftId:'shared-receipt-'+d.reference,type:'in',name:s.name,amount:amount/100,fee:0,status:'success',category:'Transfers',method:'Shared cost · sample repayment',note:g.title,requestId:r.id,sharedGroupId:g.id,sharedShareId:s.id,sharedExpenseRepayment:true,sampleReceiptReference:d.reference});
 d.txId=t.id;syncRequests(g);L.save();L.go('sharedGroup',{id:g.id});return t;
};
L.renewSharedRequest=(id,shareId)=>{
 if(!own())return;const g=group(id),s=g?.shares.find(x=>x.id===shareId);if(!s||!sourceCurrent(g))return;
 const previous=request(s.requestId),due=Math.max(0,s.amountCents-paidFor(g,s));if(due<=0||liveRequest(previous))return;
 const r=makeRequest(g,s,due);s.requestId=r.id;L.state.requests.unshift(r);L.save();L.go('sharedGroup',{id});
};
L.copySharedSummary=id=>{
 const g=group(id);if(!g)return;const f=summary(g);
 return L.copy(`Lumo shared cost: ${g.title}\nPayment ${moneyC(g.totalCents)}; your share ${moneyC(g.ownerCents)}.\n${f.shares.map(s=>`${s.name}: ${moneyC(s.dueCents)} unpaid of ${moneyC(s.amountCents)}`).join('\n')}\nPrivate sample summary. This is not a payable link and no real money can be sent.`);
};
L.views.sharedExpenses=()=>{
 const groups=store().groups,available=(L.state.txs||[]).filter(eligible).filter(t=>!groups.some(g=>g.txId===t.id)).slice(0,8);
 return `<section class="shared-expenses-page">${L.header('Shared costs','Keep the bill clear between friends.')}<div class="shared-group-list">${groups.map(g=>{const f=summary(g);return L.row(g.title,f.status==='settled'?'All shares received':f.status==='partial'?'Part received · '+moneyC(f.dueCents)+' unpaid':moneyC(f.dueCents)+' unpaid','user',`L.go('sharedGroup',{id:'${g.id}'})`);}).join('')||'<p class="muted">No shared costs yet. Choose a completed payment below.</p>'}</div><h2 class="shared-section-title">Split a completed payment</h2><div class="list">${available.map(t=>L.row(t.name,new Date(t.date).toLocaleDateString('en-GH',{day:'numeric',month:'short'}),'receipt',`L.startSharedExpense('${t.id}')`,moneyC(netCents(t)))).join('')||'<p class="muted">Completed outgoing payments will appear here. Transfers between your own accounts are excluded.</p>'}</div>${boundary}</section>`;
};
L.views.sharedSplit=()=>{
 const d=store().draft;if(!d||!eligible(tx(d.txId)))return `<section>${L.header('Choose a payment first')}<div class="actions">${B('Open shared costs','L.openSharedExpenses()')}</div></section>`;
 return `<section class="shared-split-page">${L.header('Who shared this?','Your share is included. Requests never increase your balance.')}<p class="shared-total">${moneyC(d.totalCents)} <small>paid to ${E(tx(d.txId).name)}${Number(tx(d.txId).fee)>0?' · fee not split':''}</small></p><form onsubmit="event.preventDefault();L.reviewSharedExpense()">${field('Shared cost','shared-title',d.title,'text','oninput="L.captureSharedSplit()"')}<div class="shared-modes" role="group" aria-label="How to split">${B('Split equally',"L.setSharedSplitMode('equal')",'chip '+(d.mode==='equal'?'selected':''))}${B('Choose amounts',"L.setSharedSplitMode('custom')",'chip '+(d.mode==='custom'?'selected':''))}</div><div class="shared-owner-row">${field('Your share','shared-owner',d.ownerAmount,'number',`${d.mode==='equal'?'readonly aria-readonly="true"':''} oninput="L.captureSharedSplit()"`)}</div><div class="shared-friends">${d.friends.map((s,i)=>`<div class="shared-friend-row"><div>${field('Friend '+(i+1),'shared-name-'+i,s.name,'text','autocomplete="off" oninput="L.captureSharedSplit()"')}${field('Their share','shared-amount-'+i,s.amount,'number',`${d.mode==='equal'?'readonly aria-readonly="true"':''} oninput="L.captureSharedSplit()"`)}</div>${d.friends.length>1?B(L.icon('close',18),`L.removeSharedFriend(${i})`,'icon-btn').replace('<button ','<button aria-label="Remove friend '+(i+1)+'" '):''}</div>`).join('')}</div>${d.friends.length<5?B(L.icon('plus',18)+' Add a friend','L.addSharedFriend()','text-btn'):''}${err}<div class="actions"><button type="submit" class="primary">Review split</button>${B('Decide later','L.closeTask?L.closeTask():L.back()','text-btn')}</div></form>${boundary}</section>`;
};
L.views.sharedSplitReview=()=>{
 const d=store().draft;if(!d)return L.views.sharedExpenses();const amount=cents(d.ownerAmount)||0;
 return `<section class="shared-split-review">${L.header('Check everyone’s share','No money moves when you create these requests.')}<p class="shared-total">${moneyC(d.totalCents)}</p><p>${E(d.title)}</p><dl class="shared-calculation">${line('Your share',moneyC(amount))}${d.friends.map(s=>line(s.name,moneyC(cents(s.amount)||0))).join('')}${line('To request from friends',moneyC(d.totalCents-amount))}</dl>${err}<div class="actions">${B('Create private requests','L.createSharedExpense()')}${B('Edit split','L.editSharedExpense()','secondary')}</div>${boundary}</section>`;
};
L.views.sharedGroup=()=>{
 const g=group(L.params.id);if(!g)return `<section>${L.header('Shared cost unavailable')}<div class="actions">${B('Open shared costs','L.openSharedExpenses()')}</div></section>`;
 syncRequests(g);const f=summary(g),changed=!sourceCurrent(g);
 return `<section class="shared-group-page">${L.header(g.title,f.status==='settled'?'Everyone’s share is received.':f.status==='partial'?'Part received. The rest is still unpaid.':'Your requests are ready.')}<div class="shared-status"><span>${f.status==='settled'?L.icon('check',26):L.icon('user',26)}</span><strong>${moneyC(f.dueCents)} ${f.status==='settled'?'unpaid':'still unpaid'}</strong><p>Unpaid shares are not part of your available balance.</p></div><dl class="shared-calculation">${line('Original payment',moneyC(g.totalCents))}${line('Your share',moneyC(g.ownerCents))}${line('Confirmed repayments',moneyC(f.receivedCents))}</dl>${changed?'<p class="notice">The original payment changed after this split. New repayments are paused; existing received money stays recorded.</p>':''}<div class="shared-share-list">${f.shares.map(s=>{const r=request(s.requestId),open=liveRequest(r);return `<div class="shared-share"><div><strong>${E(s.name)}</strong><span>${s.dueCents===0?'Received':s.receivedCents>0?moneyC(s.receivedCents)+' received · '+moneyC(s.dueCents)+' unpaid':moneyC(s.dueCents)+' unpaid'}${!open&&s.dueCents>0?' · request closed':''}</span></div>${B('Details',`L.go('requestDetail',{id:'${s.requestId}'})`,'text-btn')}${!changed&&s.dueCents>0&&!open?B('New request for unpaid share',`L.renewSharedRequest('${g.id}','${s.id}')`,'text-btn'):''}</div>`;}).join('')}</div><div class="actions">${B('Copy private summary',`L.copySharedSummary('${g.id}')`,'secondary')}${B('View original receipt',`L.go('txDetail',{id:'${g.txId}'})`,'text-btn')}${B('All shared costs','L.openSharedExpenses()','text-btn')}</div>${!changed&&f.dueCents>0?`<details class="shared-simulation"><summary>Try a sample repayment</summary><p>No one is contacted or charged. Confirm a sample incoming payment on this device.</p>${f.shares.filter(s=>s.dueCents>0&&liveRequest(request(s.requestId))).map(s=>B('Sample payment from '+E(s.name),`L.prepareSharedReceipt('${g.id}','${s.id}')`,'secondary')).join('')}</details>`:''}${boundary}</section>`;
};
L.views.sharedReceive=()=>{
 const d=store().receiptDraft,g=group(d?.groupId),s=g?.shares.find(x=>x.id===d?.shareId);if(!d||!g||!s)return L.views.sharedExpenses();const due=Math.max(0,s.amountCents-paidFor(g,s));
 return `<section class="shared-receive-page">${L.header('Sample incoming Lumo repayment','This explicitly simulates provider confirmation of an incoming receipt.')}<p>From <strong>${E(s.name)}</strong> for ${E(g.title)}.</p><p class="small muted">${moneyC(due)} is still unpaid. A confirmed sample incoming receipt credits your Everyday money once; an unpaid request or a manual repayment record is not spendable money.</p><form onsubmit="event.preventDefault();L.simulateSharedReceipt()">${field('Sample amount received','shared-received-amount',d.amount,'number','oninput="L.captureSharedReceipt()"')}<p class="tiny muted">Sample receipt reference · ${E(d.reference)}</p>${err}<div class="actions"><button type="submit" class="primary">Simulate confirmed receipt</button>${B('Back to shared cost',`L.go('sharedGroup',{id:'${g.id}'})`,'secondary')}</div></form><p class="preview-boundary">Same-device simulation. No real payment or notification is sent.</p></section>`;
};
const requestView=L.views.requestDetail;
L.views.requestDetail=()=>{
 const r=request(L.params.id);if(!r?.sharedGroupId||r.from!=='self')return requestView();const g=group(r.sharedGroupId),s=g?.shares.find(x=>x.id===r.sharedShareId);if(!g||!s)return requestView();syncRequests(g);const paid=paidFor(g,s),due=Math.max(0,s.amountCents-paid),active=s.requestId===r.id&&liveRequest(r),changed=!sourceCurrent(g);
 return `<section class="shared-request-page">${L.header('Your shared-cost request',due===0?'This share is received.':'Waiting for a confirmed repayment.')}<h2>${E(s.name)}</h2><p>${E(g.title)}</p><dl class="shared-calculation">${line('Their original share',moneyC(s.amountCents))}${line('Confirmed received',moneyC(paid))}${line('Still unpaid',moneyC(due))}${line('Request reference',E(r.id))}</dl><p class="small muted">${due===0?'Received':active?'Request active':'This request is closed.'} · Unpaid money is not available to spend.</p><div class="actions">${B('Open shared cost',`L.go('sharedGroup',{id:'${g.id}'})`)}${active&&due>0?B('Cancel this request',`L.go('requestConfirm',{id:'${r.id}',action:'cancelled'})`,'text-btn'):''}</div>${!changed&&active&&due>0?`<details class="shared-simulation"><summary>Try a sample repayment</summary><p>No real money is sent.</p>${B('Simulate a received payment',`L.prepareSharedReceipt('${g.id}','${s.id}')`,'secondary')}</details>`:''}${boundary}</section>`;
};
const simCredit=L.simRequestCredit;
L.simRequestCredit=id=>{const r=request(id);if(r?.sharedGroupId){const g=group(r.sharedGroupId),s=g?.shares.find(x=>x.id===r.sharedShareId);if(s?.requestId===id)return L.prepareSharedReceipt(g.id,s.id);return L.go('sharedGroup',{id:r.sharedGroupId});}return simCredit?.(id);};
for(const route of ['txDetail','paymentResult']){const previous=L.views[route];L.views[route]=()=>{const html=previous(),t=tx(L.params.id||L.state.paymentDraft?.submittedTxId);if(!eligible(t))return html;const g=store().groups.find(x=>x.txId===t.id);return html+`<div class="shared-receipt-entry">${B(g?'View shared cost':'Split this payment',g?`L.go('sharedGroup',{id:'${g.id}'})`:`L.startSharedExpense('${t.id}')`,'secondary')}</div>`;};}
const requestsView=L.views.requests;L.views.requests=()=>requestsView()+`<div class="shared-requests-entry">${B('Shared costs','L.openSharedExpenses()','secondary')}</div>`;
const chatActions=L.views.chatBankingActions;if(chatActions)L.views.chatBankingActions=()=>chatActions().replace('<section aria-label="Your plan and spending">',`<section aria-label="Shared costs"><button type="button" class="chat-banking-action-item" onclick="L.openSharedExpenses()">${L.icon('user',23)}<span><strong>Shared costs</strong><small>Split a completed payment and track repayments.</small></span>${L.icon('chevron',18)}</button></section><section aria-label="Your plan and spending">`);
for(const [route,treatment,label]of [['sharedExpenses','selection','Shared costs'],['sharedSplit','edit','Split payment'],['sharedSplitReview','confirmation','Review shared cost'],['sharedGroup','detail','Shared cost'],['sharedReceive','edit','Sample repayment']])L.taskSheet?.register?.(route,{family:'records',treatment,label});
L.sharedExpenses={eligible,summary,netCents,validate,sourceCurrent};
// Preserve earlier confirmed receipts without allowing a new request or
// incoming-provider example to bypass current persistence and offline guards.
for(const [name,label]of [['createSharedExpense','Create this earlier split'],['simulateSharedReceipt','Confirm this incoming sample repayment'],['renewSharedRequest','Renew this earlier request']]){
 const action=L[name];L[name]=function(...args){
  if(L.persistence?.ensureCurrent?.()===false||L.platform?.requireOnline?.(label)===false)return false;
  const route=L.route,params={...L.params},central=!!L.persistence?.transaction,before=central?null:JSON.parse(JSON.stringify(L.state)),save=L.save;
  try{
   if(L.persistence?.transaction)return L.persistence.transaction(()=>action.apply(this,args),{financial:true,label});
   L.save=()=>true;const result=action.apply(this,args);L.save=save;if(save.call(L)===false)throw Error('This incoming repayment or request could not be saved.');return result;
  }catch(error){if(!central)L.state=before;L.go(route,params);L.error(error.message||'Your saved record has not changed. Try again after reloading.');return false;}
  finally{L.save=save;}
 };
}
})();
