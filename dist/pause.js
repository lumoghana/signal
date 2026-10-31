/* One scored insight, before authorisation. The customer chooses. */
(()=>{
const E=L.e,M=L.money;
L.pauseHome=()=>'';
L.pauseReview=()=>'';
L.pauseScene=(d,p,options={})=>{
 const before=p.available??p.b?.available??0,after=p.after??p.remaining??before;
 const total=Number(d.amount)+Number(d.fee||0);
 return `<div class="pause-scene pause-focus-scene" data-before="${before}" data-after="${after}" data-room-before="0" data-room-after="0"><div class="pause-scene-heading"><span class="eyebrow">${options.demo?'SAMPLE PREVIEW':'IF YOU CONTINUE'}</span>${options.demo&&L.testMode?`<button class="text-btn" onclick="L.replayPause()" aria-label="Replay balance preview">${L.icon('refresh',14)} Replay</button>`:''}</div><div class="pause-transfer"><div class="pause-wallet"><small>Available after</small><strong data-pause-balance aria-hidden="true">${M(after)}</strong><span class="sr-only">Available now ${M(before)}. Available after this payment ${M(after)}.</span><span class="pause-from">${M(before)} now</span></div><div class="pause-journey" aria-hidden="true"><span class="pause-route-line"></span><span class="pause-payment-token">−${M(total)}</span></div><div class="pause-recipient"><span class="pause-recipient-icon" aria-hidden="true">${L.icon(d.method==='campus'?'scan':d.bill?'bolt':'user',21)}</span><strong>${E(d.name)}</strong><small>${M(total)}${Number(d.fee)>0?' incl. fee':''}</small></div></div></div>`;
};
L.views.pause=()=>{
 const d=L.state.paymentDraft;if(!d)return L.views.pay();if(d.submittedTxId)return L.views.paymentResult();
 const q=L.pauseEngine.evaluate(d);if(!q.triggered)return L.views.paymentReview();
 L.pauseEngine.present(d);
 return `<div class="topline"><button class="icon-btn" onclick="L.go('paymentReview')" aria-label="Back to payment review">${L.icon('arrowLeft')}</button><span class="eyebrow">PAUSE MOMENT</span><button class="icon-btn" onclick="L.go('help',{returnRoute:'pause'})" aria-label="Get help">${L.icon('help',21)}</button></div><div class="pause-single-insight"><h1>${E(q.selected.message)}</h1></div>${L.pauseScene(d,q)}<p class="pause-unsent">Nothing sent yet. Authorise on the next step.</p><div id="error" role="alert"></div><div class="actions pause-actions">${L.btn('Continue','L.resumeFromPause()')}${L.btn(d.requestId||d.fixedAmount?'Review payment':'Edit amount',"L.pauseAction('edit_amount')",'secondary')}${L.btn('Decide later',"L.pauseAction('delay_payment')",'text-btn')}${L.btn('Cancel payment',"L.pauseAction('cancel_payment')",'text-btn')}</div>`;
};
L.replayPause=()=>L.animatePause?.();
const fixture=key=>{
 const now=Date.parse('2026-10-16T12:00:00Z'),d={id:'pause-example',method:'lumo',name:'Ama Boateng',destination:'@ama.b',amount:50,fee:0};
 const s={balance:1000,txs:[]};let clock=now;
 const tx=(i,amount,date,destination='@ama.b')=>({id:'example-'+i,type:'out',status:'success',method:'Lumo transfer',amount,fee:0,date:new Date(date).toISOString(),destination});
 if(key==='low'){s.balance=100;d.amount=70;}
 else if(key==='repeat'){for(let i=0;i<3;i++)s.txs.push(tx(i,30,now-(i*2+1)*3600000));}
 else if(key==='large'){d.amount=600;}
 else if(key==='busy'){clock=Date.parse('2026-10-16T23:30:00Z');for(let i=0;i<5;i++)s.txs.push(tx(i,45,now-i*3600000,'@sample'+i));}
 return {d,s,q:L.pauseEngine.evaluate(d,s,clock)};
};
L.views.pauseDemo=()=>{
 if(!L.testMode)return L.views[L.state.onboarded?'pay':'welcome']();
 const choices={low:'Low balance',repeat:'Repeat transfers',large:'Large share',busy:'Busy day',normal:'Everyday payment'};
 const key=Object.hasOwn(choices,L.params.scenario)?L.params.scenario:'low',{d,s,q}=fixture(key);
 return L.header('Before money moves.','Try a sample. Your account stays unchanged.')+`<div class="chips pause-demo-chips">${Object.entries(choices).map(([k,t])=>L.btn(t,`L.go('pauseDemo',{scenario:'${k}'})`,'chip '+(k===key?'selected':''))).join('')}</div><div class="pause-single-insight"><h2>${q.triggered?E(q.selected.message):'This example goes straight to authorisation.'}</h2></div>${L.pauseScene(d,q,{demo:true})}<details class="engine-demo-details"><summary>Test the rule</summary><div class="summary-line"><span>Score</span><strong>${q.score} / 5 to trigger</strong></div>${q.signals.map(x=>`<div class="summary-line"><span>${E(x.code.replaceAll('_',' '))}</span><strong>+${x.score}</strong></div>`).join('')||'<p class="small muted">No signals triggered.</p>'}<p class="tiny muted">${key==='busy'?'Sample clock: 11:30 PM, with five completed payments totalling GH₵ 225.':'Sample clock: midday.'} ${key==='repeat'?'Three previous payments to Ama in the last 7 days, including one today.':''}</p></details><div class="actions">${L.state.onboarded?L.btn('Try my own payment',"L.startSend('lumo')"):L.btn('Get started',"L.onboarding.start()")}${L.btn('Back to '+(L.state.onboarded?'Home':'Welcome'),L.state.onboarded?"L.go('home')":"L.go('welcome')",'secondary')}</div>`;
};
const pauseLog=L.views.pauseLog;
L.views.pauseLog=()=>L.testMode?pauseLog():L.views[L.state.onboarded?'pay':'welcome']();
})();
