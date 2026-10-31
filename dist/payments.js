/* Lumo ambassador prototype: simulated payment and funding journeys. */
(() => {
  const e = v => L.e(v == null ? '' : String(v));
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const m = n => L.money(Number(n)||0);
  // Keep a monetary fact together when text grows; currency can move above it.
  const amountHeading = value => {const parts=m(value).match(/^([^0-9]*)(.*)$/);return `<h1 class="payment-fact-amount"><span class="payment-fact-currency">${e(parts[1])}</span><span class="payment-fact-number">${e(parts[2])}</span></h1>`;};
  const err = '<div id="error" role="alert"></div>';
  const btn = (t,j,c) => L.btn(t,j,c);
  const submit = text => `<button type="submit" class="primary">${e(text)}</button>`;
  const form = (body,action) => `<form class="form" onsubmit="event.preventDefault();${action}">${body}</form>`;
  const testOnly = body => L.testMode ? body : '';
  const amountOK = value => Number.isFinite(Number(value)) && Number(value)>=0.01 && Number(value)<=5000 && Math.abs(Number(value)*100-Math.round(Number(value)*100))<0.000001;
  const compactTitles = new Set(['Pay','One last look','Payment result','Payment status','Receipt']);
  const shell = (t,s,body) => {const header=(compactTitles.has(t)||body.includes('<h1'))?`<div class="topline"><button class="icon-btn" onclick="L.back()" aria-label="Go back">${L.icon('arrowLeft')}</button><span class="eyebrow">${e(t)}</span><button class="icon-btn" onclick="L.go('help',{returnTo:L.route,returnParams:L.params})" aria-label="Get help">${L.icon('help',21)}</button></div>`:L.header(t,s);return `<section>${header}${body}</section>`;};
  const entryShell=(title,subtitle,body)=>shell(title,subtitle,body).replace('<section>','<section data-payment-entry>');
  const opts = (values,current) => values.map(v => `<option value="${e(v)}" ${v===current?'selected':''}>${e(v)}</option>`).join('');
  const field = (label,id,placeholder='',type='text',value='') => L.field(label,id,placeholder,type,value).replace('inputmode="decimal"',`inputmode="${type==='tel'?'tel':'decimal'}"`).replace('<input ',`<input ${id.includes('note')?'maxlength="120" ':''}aria-describedby="error" `);
  const select = (label,id,values,current) => `<label class="field" for="${id}"><span>${e(label)}</span><select id="${id}" class="input">${opts(values,current)}</select></label>`;
  const notice = t => `<div class="notice small">${t}</div>`;
  const cash = (id,value='',label='Amount') => `<label class="field" for="${id}"><span>${e(label)}</span><div class="inline payment-amount-row"><span class="muted payment-currency" aria-hidden="true">GH₵</span><input class="input amount-input" id="${id}" type="number" min="0.01" max="5000" step="0.01" inputmode="decimal" required aria-describedby="error" aria-label="${e(label)} in Ghana cedis" placeholder="0.00" value="${e(value)}"></div></label>`;
  const people = [{id:'abena',name:'Abena Asante',handle:'@abena.a',phone:'0241234567'},{id:'kojo',name:'Kojo Owusu',handle:'@kojo.o',phone:'0201234567'},{id:'ama',name:'Ama Boateng',handle:'@ama.b',phone:'0271234567'}];
  const merchants = [{id:'AK01',name:'Akua’s Kitchen',detail:'Food · Night market, Legon',category:'Food',emoji:'🍲'},{id:'CP02',name:'Campus Print',detail:'Printing · Balme Library',category:'Study',emoji:'📄'},{id:'RB03',name:'Ride & Go',detail:'Transport · Main gate',category:'Transport',emoji:'🛵'}];
  const billNames = {airtime:'Airtime',data:'Data',electricity:'Electricity',water:'Water',tv:'TV',internet:'Internet'};
  const methods = {lumo:'Lumo transfer',momo:'Mobile money',bank:'Bank transfer',campus:'Campus Pay',request:'Money request',bill:'Bill payment'};
  const requestOpen = r => r && r.status==='waiting' && (!r.expires || Date.now()<new Date(r.expires).getTime());
  const tx = id => L.state.txs.find(t=>t.id===id);
  const draft = () => L.state.paymentDraft;
  const total = d => Number(d.amount||0)+Number(d.fee||0);
  const validPhone = n => /^0[235][0-9]{8}$/.test(n.replace(/[\s-]/g,'')) || /^\+233[235][0-9]{8}$/.test(n.replace(/[\s-]/g,''));
  const sumLine = (a,b,cls='') => `<div class="summary-line ${cls}"><span>${e(a)}</span><strong>${e(b)}</strong></div>`;
  const budgetLines=()=>L.state.essentials.filter(x=>!x.archived&&!x.deleted);
  const budgetLine=id=>budgetLines().find(x=>x.id===id);
  // These are purposes within one operational account, not separate wallets.
  L.paymentSourceInfo=d=>d?.method==='box'?null:d?.essentialId?(budgetLine(d.essentialId)?{type:'budget-line',id:d.essentialId,name:budgetLine(d.essentialId).name}:null):{type:'after-budget',name:'Left after budget'};
  L.setPaymentSource=(id,d=draft())=>{
    if(!d||d.submittedTxId||d.method==='box')return false;
    id=String(id||'');if(id&&!budgetLine(id))return false;
    if((d.essentialId||'')!==id){
      delete d.categoryChoice;delete d.categoryChoiceKey;delete d.categoryHelpDismissedKey;
      delete d.reviewFingerprint;delete d.pauseAcceptedSignature;
    }
    d.essentialId=id;d.budgetSource=L.paymentSourceInfo(d);return true;
  };
  L.paymentPlanLinkFields = d => {
    // Moving money to savings cannot also fulfil an operational budget item.
    if(d.method==='box')return '';
    L.reconcileEssentialCoverage?.();
    const position=L.pauseEngine?.planPosition?.({amount:0,fee:0},L.state);
    const pendingFor=id=>L.state.txs.filter(t=>t.type==='out'&&t.status==='pending'&&t.essentialId===id).reduce((sum,t)=>sum+Number(t.amount||0),0);
    const remaining=x=>position?.essentials.find(item=>item.id===x.id)?.before??Math.max(0,Number(x.amount)-Number(x.paid||0)-pendingFor(x.id));
    const essentials=budgetLines(),missing=!!d.essentialId&&!budgetLine(d.essentialId);
    if(!essentials.length&&!missing)return '';
    const hint=missing?'This budget item is no longer available. Choose a source.':'All use your operational account.';
    return `<div class="payment-plan-link"><label class="field" for="payment-essential"><span>Pay from</span><select class="input" id="payment-essential" aria-describedby="payment-plan-hint"><option value="" ${!d.essentialId?'selected':''}>Left after budget · ${m(L.balances().room)}</option>${missing?'<option value="'+e(d.essentialId)+'" selected disabled>Budget item unavailable · choose a source</option>':''}${essentials.map(x=>`<option value="${e(x.id)}" ${d.essentialId===x.id?'selected':''}>${e(x.name)} · ${m(remaining(x))} left${pendingFor(x.id)>0?' · '+m(pendingFor(x.id))+' pending':''}</option>`).join('')}</select></label><p class="small muted" id="payment-plan-hint">${hint}</p></div>`;
  };
  const planAfter = d => {
    // The engine owns pending holds and linked-cost coverage. Review and Pause
    // consume those same cents-based facts instead of calculating a second plan.
    const p=L.planImpactSummary(d);
    return {b:L.balances(),covered:p.essentialCovered,remaining:p.after,room:p.room,gap:p.totalGap,extraGap:p.extraGap,plan:p};
  };
  L.paymentImpact=planAfter;
  const requiresPause = d => L.pauseEngine?L.pauseEngine.evaluate(d).triggered:false;
  L.paymentNeedsPause=requiresPause;
  const paymentFingerprint=d=>{const b=L.balances();return JSON.stringify([d.name,d.destination,d.provider||'',d.amount,d.fee,d.product||'',d.essentialId||'',L.paymentSourceInfo(d)?.name||'',b.available,b.essentials,b.allocated,L.pauseEngine?.signature(d)||'']);};

  const req = id => L.state.requests.find(r=>r.id===id);
  const statusLabel = t => t.status==='success'?(t.delivery==='pending'?'Paid · delivery pending':t.delivery==='failed'?'Paid · delivery failed':'Completed'):({pending:'Payment being checked',failed:'Not completed',reversed:'Money returned'}[t.status]||t.status);
  const paymentGuard = d => {
    if(L.state.closed){L.go('closeAccount');return false;}
    if(L.state.locked){L.go('signin',{returnTo:'paymentReview'});return false;}
    if(!L.state.onboarded){L.go('welcome');return false;}
    if(!d) {L.go('pay');return false;}
    if(d.submittedTxId) {L.go('paymentResult',{id:d.submittedTxId});return false;}
    if(d.method!=='box'&&d.essentialId&&!budgetLine(d.essentialId)){
      if(!['send','bill','paymentPlanLink'].includes(L.route))L.go(d.bill?'bill':'send',d.bill?{kind:d.bill}:{method:d.method});
      L.error('This budget item is no longer available. Choose a source.','payment-essential');return false;
    }
    if(d.requestId){const r=req(d.requestId);if(!requestOpen(r)||r.txId){L.go('requestDetail',{id:d.requestId});return false;}}
    if(d.merchantSaleId){const sale=L.acct?.collectionForCode?.(d.merchantSaleId);if(!sale||sale.status!=='Waiting for customer'||Date.now()>sale.expires){if(sale?.payerTxId)L.go('txDetail',{id:sale.payerTxId});else {L.go('campusPay');L.toast('This bill is no longer open. Ask the merchant for a fresh bill.');}return false;}}
    return true;
  };
  const feeFor = (method,amount) => method==='momo'?0.50:method==='bank'?1:0;
  L.paymentFee=feeFor;
  // One native choice protects every meaningful unsent payment. The pending
  // intent stays in memory and is bound to the exact account and draft snapshot.
  // Replacement callbacks run once; nested entry functions share that consent.
  let replacement=null,replacing=0;
  const entryKey=d=>d?.paymentEntryKey||d?.everydayKey||(d?.bill?'bill:'+d.bill:d?.merchantSaleId?'sale:'+d.merchantSaleId:d?.merchantId?'merchant:'+d.merchantId:d?.requestId?'request:'+d.requestId:d?.method==='virtualCard'?'card:'+d.cardId:d?.method==='virtualCardCreate'?'card:create':'send:'+d?.method);
  const meaningful=d=>!!d&&!d.submittedTxId&&!!(Number(d.amount)>0||String(d.note||'').trim()||d.name||d.destination||d.inputNumber||d.cardName||d.searchQuery);
  L.requestPaymentReplacement=(action,key,context={})=>{
    if(replacing)return false;
    L.savePaymentFields?.();const d=draft();
    if(!meaningful(d))return false;
    if(context.resume!==false&&entryKey(d)===key){L.editPayment();return true;}
    replacement={id:L.id('payment-choice'),action,key,context,account:L.state,draft:d,snapshot:JSON.stringify(d)};
    L.go('everydayRepeatChoice');return true;
  };
  // Existing contextual confirmations (for example an Ask Lumo proposal) can
  // reuse their explicit choice without opening a second replacement dialog.
  // Their controller must validate the intended action before calling this.
  L.runReviewedPaymentReplacement=(expectedDraft,action)=>{
    if(expectedDraft!==draft()||!L.state.onboarded||L.state.locked||L.state.closed||typeof action!=='function')return false;
    replacing++;try{return action();}finally{replacing--;}
  };
  L.paymentDraftReplacementInfo=()=>replacement?.context||{};
  L.keepEverydayDraft=token=>{if(token&&token!==replacement?.id)return false;const request=replacement;replacement=null;if(!request||request.account!==L.state||L.state.locked||L.state.closed)return;L.editPayment();};
  L.replaceEverydayDraft=token=>{
    if(token&&token!==replacement?.id)return false;
    const request=replacement;replacement=null;
    if(!request||L.route!=='everydayRepeatChoice'||request.account!==L.state||!L.state.onboarded||L.state.locked||L.state.closed)return false;
    if(request.draft!==draft()||request.snapshot!==JSON.stringify(draft())){L.toast('Your saved payment changed. Choose the new payment again.');L.editPayment();return false;}
    replacing++;try{return request.action();}finally{replacing--;}
  };
  L.views.everydayRepeatChoice=()=>{if(!replacement||replacement.account!==L.state)return shell('Saved payment','Choose the new payment again.',`<p>The replacement choice expired. Your saved payment is kept.</p><div class="actions">${draft()&&!draft().submittedTxId?btn('Continue saved payment','L.editPayment()'):''}${btn('Back to payments',"L.go('pay')",'secondary')}</div>`);const c=L.paymentDraftReplacementInfo();return shell('Saved payment','Nothing has been sent.',`<h1>Keep your saved payment?</h1><p>You have an unfinished payment${draft()?.name?' to '+e(draft().name):''}.</p>${c.recipientName?'<p>'+e(c.recipientLabel||'New recipient')+': <strong>'+e(c.recipientName)+'</strong></p>':''}<div class="actions">${btn(c.keepLabel||'Continue saved payment',`L.keepEverydayDraft('${replacement?.id||''}')`)}${btn(c.replaceLabel||'Start this new payment',`L.replaceEverydayDraft('${replacement?.id||''}')`,'secondary')}${btn('Back','L.back()','text-btn')}</div>`);};
  L.startSend = (method='lumo',essentialId) => {
    if(L.platform?.requireOnline?.('Start a transfer')===false)return;
    if(L.requestPaymentReplacement(()=>L.startSend(method,essentialId),'send:'+method))return;
    L.state.paymentDraft={id:uid('D'),method,amount:'',note:'',fee:0,essentialId:essentialId||L.params.essentialId||'',...(!L.testMode&&['momo','bank'].includes(method)?{inputNumber:'',...(method==='bank'?{provider:'GCB Bank'}:{})}:{})}; L.save();L.go('send',{method});
  };
  L.editPayment = () => {
    const d=draft();if(!paymentGuard(d))return;
    L.go(d.bill?'bill':'send',d.bill?{kind:d.bill}:{method:d.method});
  };
  L.savePaymentFields = () => {const d=draft();if(!d||d.submittedTxId)return;for(const [id,key] of [['payment-amount','amount'],['payment-note','note'],['payment-essential','essentialId']])if(document.getElementById(id)){if(key==='essentialId')L.setPaymentSource(L.value(id),d);else d[key]=L.value(id);}L.save();};
  L.openPaymentPlanLink = () => {const d=draft();if(!paymentGuard(d)||d.method==='box')return;L.savePaymentFields();L.go('paymentPlanLink');};
  L.savePaymentPlanLink = () => {
    const d=draft();if(!paymentGuard(d)||d.method==='box')return;const id=L.value('payment-essential');
    if(!L.setPaymentSource(id,d))return L.error('Choose a source that is still in your budget.','payment-essential');
    delete d.reviewFingerprint;delete d.pauseAcceptedSignature;L.save();L.go('paymentReview');
  };
  L.views.paymentPlanLink = () => {
    const d=draft();if(!d)return L.views.pay();
    if(d.method==='box')return L.views.paymentReview();
    return shell('Pay from','Choose what this payment covers.',`<div class="hero"><h1>Choose a source</h1><p>${m(d.amount)} to ${e(d.name)}</p></div>${form(`${L.paymentPlanLinkFields(d)||'<p class="small muted">No budget yet. This uses money left after budget.</p>'}${err}${submit('Save & review payment')}${btn('Back to payment review',"L.go('paymentReview')",'text-btn')}`,'L.savePaymentPlanLink()')}`);
  };
  // Capture from the current mounted field, so a late event from a previous
  // screen cannot overwrite a new recipient, draft or completed transaction.
  L.capturePaymentInput = event => {
    const field=event?.target,id=field?.id;
    if(!id||document.getElementById(id)!==field||field.type==='password')return;
    let record,key;
    if(['send','bill','paymentPlanLink'].includes(L.route)){
      record=draft();if(!record||record.submittedTxId||(L.route!=='paymentPlanLink'&&(L.route==='bill')!==!!record.bill))return;
      if(L.route==='paymentPlanLink'&&id!=='payment-essential')return;
      key=({'payment-amount':'amount','payment-note':'note','payment-essential':'essentialId','recipient-number':'inputNumber','recipient-provider':'provider','bill-account':'destination','bill-provider':'provider','bill-package':'packageIndex','person-search':'searchQuery'})[id];
      if(!key)return;
      if(id.startsWith('recipient-')&&(L.route!=='send'||record.checked||!['momo','bank'].includes(record.method)))return;
      if(id.startsWith('bill-')&&L.route!=='bill')return;
      if(id==='person-search'&&(record.method!=='lumo'||record.name))return;
      if(id==='payment-amount'&&(record.requestId||record.fixedAmount||record.bill&&packages[record.bill]))return;
    }else if(L.route==='momoAdd'){
      record=L.state.fundingDraft;if(!record||record.txId||record.stage!=='form')return;
      key=({'funding-amount':'amount','funding-owned':'owned'})[id];
    }else if(L.route==='requestCreate'){
      record=L.state.requestDraft;if(!record||record.created||record.stage!=='form')return;
      key=({'request-amount':'amount','request-note':'note','request-to':'to'})[id];
    }else if(L.route==='bankAdd'){
      record=L.state.bankFunding;if(!L.testMode||!record||record.txId||id!=='bank-test-amount')return;key='amount';
    }
    if(!record||!key)return;
    if(key==='essentialId'){if(L.setPaymentSource(field.value,record))L.save();return;}
    record[key]=key==='owned'?!!field.checked:key==='packageIndex'?Number(field.value):String(field.value??'').slice(0,key==='note'?120:key==='searchQuery'?64:256);
    L.save();
  };
  document.addEventListener('input',L.capturePaymentInput);
  document.addEventListener('change',L.capturePaymentInput);
  L.leavePayment = () => {L.savePaymentFields();L.go('paymentCancel');};
  L.discardPayment = () => {L.pauseEngine?.respond('cancel_payment');L.state.paymentDraft=null;L.save();L.go('pay');};
  L.views.paymentCancel = () => shell('Keep this for later?','No payment has been sent.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><h1>You’re in control.</h1><p>Your draft can wait until you’re ready.</p></div><div class="actions">${btn('Keep draft & leave','L.keepPaymentLater()')}${btn('Return to payment','L.editPayment()','secondary')}${btn('Discard draft','L.discardPayment()','text-btn')}</div>`);
  L.views.pay = () => {
    const d=draft();const pending=L.state.txs.filter(t=>t.status==='pending').length;
    return shell('Pay','A little less friction. A little more clarity.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><span class="eyebrow">MONEY, ON THE MOVE</span><h1>Who’s it for?</h1><p>Send to someone, sort a bill, or pay on campus.</p></div>${d&&!d.submittedTxId?L.row('Continue your payment',d.name?`${d.name} · ${m(d.amount)}`:'Pick up your saved draft','clock','L.editPayment()'):''}<div class="grid3">${[['lumo','user','Lumo'],['momo','phone','MoMo'],['bank','bank','Bank']].map(([method,ic,title])=>`<button class="card" style="border:0;display:flex;flex-direction:column;align-items:center;gap:9px;padding:21px 8px" onclick="L.startSend('${method}')">${L.icon(ic,28)}<strong>${title}</strong></button>`).join('')}</div><div class="section-head"><h2>Campus & everyday</h2></div><div class="list">${L.row('Campus Pay','Your favourites, one easy payment','scan',"L.go('campusPay')")}${L.row('Requests','Ask for money. Settle your share.','arrowDown',"L.go('requests')")}</div><div class="grid3">${[['airtime','phone'],['data','grid'],['electricity','bolt'],['water','gift'],['tv','card'],['internet','globe']].map(([kind,ic])=>`<button class="card" style="border:0;display:flex;flex-direction:column;align-items:center;gap:9px;padding:21px 8px" onclick="L.startBill('${kind}')">${L.icon(ic==='globe'?'grid':ic,23)}<span>${billNames[kind]}</span></button>`).join('')}</div><div class="list">${L.row('Activity','Your payments and receipts','receipt',"L.go('activity')")}${pending?L.row('Pending payments',`${pending} ${pending===1?'payment':'payments'} being checked`,'clock',"L.go('pending')"):''}</div>`);
  };
  L.peopleHTML = query => {
    const q=(query||'').toLowerCase();const matches=people.filter(p=>(p.name+' '+p.handle+' '+p.phone).toLowerCase().includes(q));
    return matches.length?matches.map(p=>L.row(p.name,`${p.handle} · ${p.phone.slice(0,3)}••••${p.phone.slice(-3)}`,'user',`L.pickPerson('${p.id}')`)).join(''):'<div class="empty"><h3>No match yet</h3><p>Try their name, handle or number again.</p></div>';
  };
  L.searchPeople = () => {document.getElementById('people-list').innerHTML=L.peopleHTML(L.value('person-search'));};
  L.pickPerson = id => {
    const p=people.find(x=>x.id===id); if(!p)return;
    let d=draft();if(!d||d.method!=='lumo'||d.submittedTxId){L.state.paymentDraft={id:uid('D'),method:'lumo',amount:'',note:'',fee:0};d=draft();}
    L.savePaymentFields();Object.assign(d,{name:p.name,destination:p.handle,recipient:p.id,checked:true});L.save();L.go('send',{method:'lumo'});
  };
  L.clearRecipient = () => {const d=draft();if(!paymentGuard(d))return;L.savePaymentFields();delete d.name;delete d.destination;delete d.checked;delete d.recipient;L.save();L.go('send',{method:d.method});};
  L.sampleRecipient = () => {
    const d=draft();if(!d)return;
    document.getElementById('recipient-number').value=d.method==='bank'?'102345678901':'0241234567';
    if(document.getElementById('recipient-provider'))document.getElementById('recipient-provider').value=d.method==='bank'?'GCB Bank':'MTN MoMo';
    if(d.method==='momo')L.mobileNetwork.check(d,document.getElementById('recipient-number').value);
  };
  L.checkRecipient = (advance=true) => {
    const d=draft();if(!paymentGuard(d))return;
    const number=L.value('recipient-number').replace(/[\s-]/g,'');
    d.inputNumber=number;L.save();
    if(d.method==='momo'&&!validPhone(number))return L.error('Enter a valid Ghana mobile number, such as 0241234567.','recipient-number');
    if(d.method==='bank'&&!/^\d{10,16}$/.test(number))return L.error('Enter a 10–16 digit account number.','recipient-number');
    if(d.method==='momo'&&!L.mobileNetwork.require(d,number,()=>advance?L.checkRecipient():L.reviewTransactionDetails()))return;
    const provider=d.method==='momo'?d.provider:L.value('recipient-provider');d.provider=provider;
    const local=number.startsWith('+233')?'0'+number.slice(4):number;
    if((d.method==='momo'&&local!=='0241234567')||(d.method==='bank'&&number!=='102345678901'))return L.error('This preview can only check the sample account shown. No live account lookup is available.','recipient-number');
    if(d.method==='bank'&&provider!=='GCB Bank')return L.error('The sample account belongs to GCB Bank. Change the bank and check again.');
    Object.assign(d,{name:d.method==='momo'?'Abena Asante':'Kwesi Osei',destination:number,checked:true});L.save();if(advance)L.go('send',{method:d.method});return true;
  };
  L.views.send = () => {
    let d=draft();if(!d){L.state.paymentDraft={id:uid('D'),method:L.params.method||'lumo',amount:'',note:'',fee:0};d=draft();}
    if(d.submittedTxId)return L.views.paymentResult();
    const method=d.method;
    if(method==='lumo'&&!d.name)return entryShell('Send to Lumo','Choose a person and amount.',`<form class="form transaction-details" onsubmit="event.preventDefault();L.reviewTransactionDetails()"><label class="field" for="payment-person"><span>To</span><select class="input" id="payment-person" onchange="L.pickPerson(this.value)"><option value="">Choose a recipient</option>${people.map(p=>`<option value="${p.id}">${e(p.name)} · ${e(p.handle)}</option>`).join('')}</select></label><details class="recipient-search"><summary>Find by name or phone</summary><label class="field" for="person-search"><span>Name, handle or phone</span><input class="input" id="person-search" type="search" autocomplete="off" placeholder="Name, @handle or number" value="${e(d.searchQuery||'')}" oninput="L.searchPeople()"></label><div class="list" id="people-list">${L.peopleHTML(d.searchQuery||'')}</div></details>${cash('payment-amount',d.amount)}${L.paymentPlanLinkFields(d)}${err}${submit('Review payment')}${field('Note (optional)','payment-note','What’s it for?','text',d.note||'')}${btn('Leave for now','L.leavePayment()','text-btn')}</form>`);
    if((method==='momo'||method==='bank')&&!d.checked)return entryShell(method==='momo'?'Send to mobile money':'Send to a bank','Enter the destination and amount.',`<form class="form transaction-details" onsubmit="event.preventDefault();L.reviewTransactionDetails()"><div class="${method==='bank'?'transaction-account-fields':'automatic-mobile-details'}">${method==='bank'?select('Bank','recipient-provider',['GCB Bank','Ecobank','Fidelity Bank'],d.provider):''}${field(method==='momo'?'Wallet number':'Account number','recipient-number',method==='momo'?'0241234567':'102345678901','tel',d.inputNumber||'')}</div>${method==='momo'?L.mobileNetwork.status(d):''}${testOnly(btn('Use sample details','L.sampleRecipient()','text-btn'))}${cash('payment-amount',d.amount)}${L.paymentPlanLinkFields(d)}${err}${submit('Review payment')}${field('Note (optional)','payment-note','What’s it for?','text',d.note||'')}${btn('Leave for now','L.leavePayment()','text-btn')}</form><p class="preview-boundary">Sample account check · No live transfer</p>`);
    const fixed=!!(d.requestId||d.fixedAmount);
    return entryShell(methods[method]||'Payment',d.bill?'Check the purchase.': 'Keep the right person in the picture.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><h1>${e(d.name)}</h1><p>${e(d.provider||methods[method])} · ${e(d.destination||'')}</p>${!fixed&&method!=='campus'?btn('Change recipient','L.clearRecipient()','text-btn'):''}</div><form class="form" onsubmit="event.preventDefault();L.preparePayment()">${fixed?`<div class="money">${m(d.amount)}</div><p class="small muted">This amount was set by the sender.</p>`:cash('payment-amount',d.amount)}${L.paymentPlanLinkFields(d)}${err}${submit('Review payment')}${field('Note (optional)','payment-note','What’s it for?','text',d.note||'')}${btn('Leave for now','L.leavePayment()','text-btn')}</form>`);
  };
  L.preparePayment = () => {
    const d=draft();if(!paymentGuard(d))return;
    const amount=(d.requestId||d.fixedAmount||d.bill&&packages[d.bill])?Number(d.amount):Number(L.value('payment-amount'));
    d.note=L.value('payment-note').slice(0,120);
    if(document.getElementById('payment-essential')&&!L.setPaymentSource(L.value('payment-essential'),d))return L.error('Choose a source that is still in your budget.','payment-essential');
    if(!amountOK(amount))return L.error('Enter GH₵0.01 to GH₵5,000.00, using no more than 2 decimal places.','payment-amount');
    d.amount=Math.round(amount*100)/100;d.fee=feeFor(d.method,d.amount);L.save();L.go('paymentReview');
  };
  // Recipient verification and amount entry belong to one details surface.
  // The existing validators still own every check before a decision is shown.
  L.reviewTransactionDetails = () => {
    const d=draft();if(!paymentGuard(d))return;
    L.savePaymentFields();
    if(d.method==='lumo'&&!d.name)return L.error('Choose who this payment is for.','payment-person');
    if(['momo','bank'].includes(d.method)&&!d.checked&&!L.checkRecipient(false))return;
    if(d.bill&&!L.billLookup(false))return;
    L.preparePayment();
  };
  L.views.paymentReview = () => {
    const d=draft();if(!d)return shell('Payment','',btn('Choose a payment',"L.go('pay')"));
    if(d.submittedTxId)return L.views.paymentResult();
    if(d.merchantSaleId){const sale=L.acct?.collectionForCode?.(d.merchantSaleId);if(!sale||sale.status!=='Waiting for customer'||Date.now()>sale.expires)return shell('This bill is closed','Ask the merchant for a new bill.',btn('Back to Campus Pay',"L.go('campusPay')"));}
    const p=planAfter(d); const short=Math.max(0,total(d)-p.b.available);const essential=L.state.essentials.find(x=>x.id===d.essentialId);
    return shell('One last look','Check the person and the full cost.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><span class="eyebrow">${e(d.bill?billNames[d.bill]:methods[d.method])}</span><h1>${m(d.amount)}</h1><p>to <strong>${e(d.name)}</strong></p><p class="small muted">${e(d.provider||'')}${d.provider?' · ':''}${e(d.destination||'')}</p></div>${L.pauseReview?L.pauseReview(d,p):''}<div class="receipt">${sumLine('Amount',m(d.amount))}${sumLine('Fee',m(d.fee))}${sumLine('Total to pay',m(total(d)),'accent')}${sumLine('Available after',m(p.remaining))}${d.product||d.note||essential?`<details class="receipt-more"><summary>Payment details</summary>${d.product?sumLine('Product',d.product):''}${d.note?sumLine('Note',d.note):''}${essential?sumLine('Budget item covered',essential.name):''}</details>`:''}</div>${short?`<div class="warning"><strong>${m(short)} more needed</strong><p>Add confirmed money or change this amount.</p></div>`:!(L.state.essentials.length||L.state.goals.length)?notice('Add a budget to see what’s left after upcoming costs.'):''}${err}<div class="actions">${short?btn('Add money',"L.openFunding('paymentReview')"):btn('Continue','L.continuePayment()')}${btn(d.requestId?'Back to request':'Edit payment',d.requestId?`L.go('requestDetail',{id:'${d.requestId}'})`:'L.editPayment()','secondary')}${btn('Cancel payment','L.leavePayment()','text-btn')}</div><p class="tiny muted center">Sample payment · No real money moves</p>`);
  };
  L.continuePayment = () => {
    const d=draft();if(!paymentGuard(d))return;
    if(total(d)>L.balances().available)return L.error('Your available money changed. Add money or edit the amount.');
    d.reviewFingerprint=paymentFingerprint(d);L.save();L.go(requiresPause(d)?'pause':'authorize');
  };
  L.openPause = () => {
    const d=draft();if(!paymentGuard(d))return;
    if(total(d)>L.balances().available||!requiresPause(d)){L.go('paymentReview');return;}
    d.reviewFingerprint=paymentFingerprint(d);L.save();L.go('pause');
  };
  L.resumeFromPause = () => {
    const d=draft();if(!paymentGuard(d))return;
    if(total(d)>L.balances().available){L.go('paymentReview');L.toast('Add available money or choose a smaller amount.');return;}
    const f=paymentFingerprint(d);
    if(d.reviewFingerprint!==f){L.go('paymentReview');L.toast('Your money or budget changed. Review the updated impact.');return;}
    L.pauseEngine?.respond('continue_payment',d);d.pauseAcceptedSignature=L.pauseEngine?.signature(d);L.save();L.go('authorize');
  };
  L.views.pause = () => {
    const d=draft();if(!d)return L.views.pay();const p=planAfter(d);const nextEssential=L.state.essentials.find(x=>Number(x.amount)>Number(x.paid||0)&&x.id!==d.essentialId);
    return shell('A Pause Moment','A clearer choice, before you pay.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><span class="eyebrow">TAKE A BREATH</span><h1>See what<br>comes next.</h1><p>Paying ${m(total(d))} adds <strong>${m(p.extraGap)}</strong> to the gap in your saved plan.</p></div><div class="card soft"><div class="split"><div><span class="small muted">Room now</span><h2>${m(p.b.room)}</h2></div><div>${L.icon('arrowRight')}</div><div><span class="small muted">Room after</span><h2>${m(p.room)}</h2></div></div><p class="small">${nextEssential?`${e(nextEssential.name)} is in your plan. `:''}Your essentials and goal allocations need ${m(p.gap)} more coverage after this payment.</p><details><summary class="small">See calculation</summary><p class="small">${m(p.b.available)} available − ${m(total(d))} payment − ${m(Math.max(0,p.b.essentials-p.covered))} unpaid essentials − ${m(p.b.allocated)} goal allocations. Expected allowance is excluded.</p></details></div>${err}<div class="actions">${btn('Continue with payment',"L.go('authorize')")}${btn(d.requestId||d.fixedAmount?'Review fixed amount':'Change amount',d.requestId?`L.go('requestDetail',{id:'${d.requestId}'})`:'L.editPayment()','secondary')}${L.state.goals.some(g=>g.allocated>0)?btn('Move money from savings',"L.go('makeRoom',{returnTo:'paymentReview'})",'secondary'):''}${btn('Cancel payment','L.leavePayment()','text-btn')}</div>`);
  };
  L.views.authorize = () => {
    const d=draft();if(!d)return L.views.pay();if(d.submittedTxId)return L.views.paymentResult();
    const controls=testOnly(`<details class="notice small"><summary>Tester controls</summary><p>Choose the simulated provider result.</p>${select('Payment result','payment-outcome',['Completed','Pending','Failed'],'Completed')}${d.bill?select('Product delivery','delivery-outcome',['Delivered','Pending','Failed'],'Delivered'):''}<p>No real payment or provider request is sent.</p></details>`);
    return shell('Confirm payment','Enter your PIN to authorise.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><div class="avatar">${L.icon('lock',30)}</div><h1>${m(total(d))}</h1><p>to <strong>${e(d.name)}</strong></p><p class="small muted">${e(d.provider||d.bill&&billNames[d.bill]||methods[d.method])} · ${e(d.destination||'')}</p></div>${form(`<label class="field" for="payment-pin"><span>Your 6-digit Lumo PIN</span><input class="input" id="payment-pin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="off" required aria-describedby="error" placeholder="••••••"></label>${err}${controls}${submit('Pay '+m(total(d)))}${btn('Back to review',"L.go('paymentReview')",'text-btn')}`,'L.authorizePayment()')}`);
  };
  // The biometric demo can supply one scoped, in-memory authorisation proof.
  // It never fills or retrieves a PIN; all payment guards below remain shared.
  L.paymentAuthorizationCurrent = d => !!d&&L.route==='authorize'&&paymentGuard(d)&&amountOK(d.amount)&&total(d)<=L.balances().available&&d.reviewFingerprint===paymentFingerprint(d)&&(!requiresPause(d)||d.pauseAcceptedSignature===L.pauseEngine?.signature(d));
  L.authorizePayment = proof => {
    const d=draft();if(!paymentGuard(d)||L.platform?.requireOnline?.('Authorise payment')===false)return;
    if(!L.biometricPayment?.consume(proof,d)){
      const pin=L.value('payment-pin'),field=document.getElementById('payment-pin');
      if(!/^\d{6}$/.test(pin))return L.error('Enter your 6-digit Lumo PIN.','payment-pin');
      const result=L.authPolicy?.verify(pin,{purpose:'Authorise payment'});
      if(!result){L.error('Secure approval is unavailable. Reopen Lumo before trying again.','payment-pin');return;}
      if(field)field.value='';
      if(!result.ok){if(result.locked){L.go('signin',{returnTo:'paymentReview'});L.toast(result.message);return;}return L.error(result.message,'payment-pin');}
    }
    const b=L.balances();if(total(d)>b.available){L.go('paymentReview');L.toast('Available money changed. Please review again.');return;}
    if(!amountOK(d.amount))return L.error('Check the amount in payment review.');
    const fingerprint=paymentFingerprint(d);
    if(d.reviewFingerprint!==fingerprint){L.go('paymentReview');L.toast('Your money or budget changed. Review the current figures.');return;}
    if(requiresPause(d)&&d.pauseAcceptedSignature!==L.pauseEngine?.signature(d)){L.continuePayment();return;}

    if(d.requestId){const r=req(d.requestId);if(!requestOpen(r)||r.txId){L.go('requestDetail',{id:r.id});return;}}
    const outcome=(L.testMode?L.value('payment-outcome'):'Completed')||'Completed';const status=outcome==='Pending'?'pending':outcome==='Failed'?'failed':'success';
    const linkedEssential=L.state.essentials.find(x=>x.id===d.essentialId);const essentialCovered=linkedEssential?Math.min(Number(d.amount),Math.max(0,linkedEssential.amount-(linkedEssential.paid||0))):0;
    const result=L.addTx({draftId:d.id,type:'out',name:d.name,amount:Number(d.amount),fee:Number(d.fee)||0,status,category:d.category||((d.bill==='airtime'||d.bill==='data')?'Phone':d.bill?'Bills':'Transfers'),method:d.bill?billNames[d.bill]:methods[d.method],recipientKey:L.pauseEngine?.recipientKey(d),note:d.note||'',essentialId:d.essentialId||undefined,requestId:d.requestId||undefined,merchantSaleId:d.merchantSaleId||undefined});
    Object.assign(result,{essentialCovered,paymentDraft:{...d},draftId:d.id,destination:d.destination,provider:d.provider,product:d.product,bill:d.bill,delivery:d.bill&&status==='success'?(L.testMode&&L.value('delivery-outcome')==='Pending'?'pending':L.testMode&&L.value('delivery-outcome')==='Failed'?'failed':'delivered'):undefined});
    if(result.bill==='electricity'&&result.delivery==='delivered')result.token='3478 1029 5640 8912 3321';
    d.submittedTxId=result.id;
    if(d.merchantSaleId)L.acct?.acceptCollection?.(d.merchantSaleId,result);
    if(d.requestId){const r=req(d.requestId);r.txId=result.id;r.status=status==='success'?'paid':status==='pending'?'processing':'waiting';if(status==='failed')delete r.txId;}
    L.save();L.go('paymentResult',{id:result.id});
  };
  const authorizeAtomic=L.authorizePayment;
  L.authorizePayment=function(...args){
    try{return L.persistence?.transaction?L.persistence.transaction(()=>authorizeAtomic.apply(this,args),{financial:true,label:'Authorise payment'}):authorizeAtomic.apply(this,args);}
    catch(error){
      const d=draft();
      if(d&&!d.submittedTxId){delete d.reviewFingerprint;delete d.pauseAcceptedSignature;L.go('paymentReview');L.error(error.message||'Your payment could not be saved. Review it again.');return false;}
      throw error;
    }
  };
  L.finishPayment = () => {L.state.paymentDraft=null;L.save();L.go('home');};
  L.views.paymentResult = () => {
    const id=L.params.id||(draft()&&draft().submittedTxId);const t=tx(id);if(!t)return shell('Payment','',btn('View activity',"L.go('activity')"));
    const success=t.status==='success';const pending=t.status==='pending';
    const title=pending?'We’re checking it.':t.status==='failed'?'This one didn’t go through.':t.status==='reversed'?'Your money is back.':t.delivery==='pending'?'Paid. Delivery is pending.':t.delivery==='failed'?'Paid. Delivery needs help.':'All done.';
    return shell('Payment result','One payment. One reference.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><div class="success-mark">${L.icon(pending?'clock':success&&!t.delivery||success&&t.delivery==='delivered'?'check':t.status==='failed'?'close':'receipt',40)}</div><h1>${title}</h1><p>${m(t.amount)} ${t.type==='in'?'from':'to'} ${e(t.name)}</p></div>${pending?notice('This amount is reserved while we check. You can leave safely. Please don’t pay again.'):t.status==='failed'?notice('You haven’t been charged. Your money is available again.'):t.delivery==='pending'?notice('The payment is confirmed. Product delivery is still being checked, so don’t buy it again.'):t.delivery==='failed'?notice('Your payment completed, but delivery failed. Contact us with this reference so we can help.'):''}<div class="receipt">${sumLine('Status',statusLabel(t))}${sumLine('Reference',t.id)}${sumLine('Available now',m(L.balances().available))}</div><div class="actions">${btn(pending?'Check this payment':'View receipt',`L.go('txDetail',{id:'${t.id}'})`)}${btn('Done','L.finishPayment()','secondary')}${pending||t.delivery==='failed'?btn('Get help',`L.go('supportCase',{txId:'${t.id}',reference:'${t.id}'})`,'text-btn'):''}</div>`);
  };
  const txRow = t => L.row(t.name,`${statusLabel(t)} · ${new Date(t.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`,t.status==='pending'?'clock':t.type==='in'?'arrowDown':'arrowUp',`L.go('txDetail',{id:'${t.id}'})`,`${t.type==='in'?'+':'−'}${m(Number(t.amount)+Number(t.fee||0))}`);
  L.views.activity = () => {
    let items=[...L.state.txs].sort((a,b)=>new Date(b.date)-new Date(a.date));const filter=L.params.filter||'all';if(filter==='pending')items=items.filter(t=>t.status==='pending');else if(filter==='in')items=items.filter(t=>t.type==='in');else if(filter==='out')items=items.filter(t=>t.type==='out');
    if(L.params.category)items=items.filter(t=>t.category===L.params.category);
    const query=(L.params.query||'').toLowerCase();if(query)items=items.filter(t=>(t.name+' '+t.id+' '+(t.note||'')).toLowerCase().includes(query));
    return shell('Activity','Every payment has a story.',`<div class="chips">${[['all','All'],['in','Money in'],['out','Money out'],['pending','Pending']].map(([v,t])=>`<button class="chip ${filter===v?'selected':''}" onclick="L.go('activity',{filter:'${v}'})">${t}</button>`).join('')}</div><label class="field">Search activity<div class="inline"><input class="input" id="activity-search" placeholder="Name, note or reference" value="${e(L.params.query||'')}">${btn('Find',`L.go('activity',{filter:'${filter}',query:L.value('activity-search')})`,'secondary')}</div></label>${L.params.category?notice('Category: '+e(L.params.category)):''}<div class="list">${items.length?items.map(txRow).join(''):'<div class="empty"><div class="avatar">'+L.icon('receipt',30)+'</div><h2>A fresh start.</h2><p>Your confirmed and pending payments will appear here.</p>'+btn('Make a payment',"L.go('pay')",'secondary')+'</div>'}</div>`);
  };
  L.views.pending = () => {
    const waiting=L.state.txs.filter(t=>t.status==='pending'||t.delivery==='pending');
    return shell('Pending payments','Check the same reference. Never pay twice.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><h1>${waiting.length?'Still being checked.':'You’re all caught up.'}</h1><p>${waiting.length?'Check the same reference before trying again.':'No payments or deliveries are waiting right now.'}</p></div>${waiting.length?`<div class="list">${waiting.map(txRow).join('')}</div>`:btn('View activity',"L.go('activity')",'secondary')}`);
  };
  L.refreshPayment = id => {const t=tx(id);if(!t)return;t.lastChecked=new Date().toISOString();L.save();L.go('txDetail',{id});L.toast(t.status==='pending'?'Still being checked. No second payment was sent.':t.delivery==='pending'?'Delivery is still pending. No second charge.':'Status is up to date.');};
  L.settlePayment = (id,status) => {
    const t=tx(id);if(!t||t.status!=='pending')return;
    L.resolveTx(id,status);
    if(t.bill&&status==='success'){t.delivery='delivered';if(t.bill==='electricity')t.token='3478 1029 5640 8912 3321';}
    if(t.requestId){const r=req(t.requestId);if(r){r.status=status==='success'?'paid':'waiting';if(status!=='success')delete r.txId;}}
    L.acct?.syncCollection?.(t);L.save();L.go('txDetail',{id});
  };
  L.deliveryUpdate = (id,status) => {const t=tx(id);if(!t||t.status!=='success')return;t.delivery=status;if(t.bill==='electricity'&&status==='delivered')t.token='3478 1029 5640 8912 3321';L.save();L.go('txDetail',{id});};
  L.refundPayment = id => {
    const t=tx(id);if(!t||t.type!=='out'||t.status!=='success'||t.refunded)return;
    const r=L.addTx({type:'in',name:'Refund · '+t.name,amount:Number(t.amount)+Number(t.fee||0),fee:0,status:'success',category:'Refunds',method:t.method,note:'Confirmed refund of '+t.id});r.originalId=t.id;t.refunded=r.amount;t.refundId=r.id;t.status='reversed';
    L.reconcileEssentialCoverage?.();
    L.acct?.syncCollection?.(t);L.save();L.go('txDetail',{id});L.toast('Simulated refund confirmed once.');
  };
  // Provider settlement and refunds include their linked request/delivery
  // updates in the same commit as the money. A rejected save retains the old
  // pending/original reference, so a retry cannot credit or debit twice.
  for(const action of ['settlePayment','refundPayment']){
    const perform=L[action];
    L[action]=function(id,...args){
      try{return L.persistence?.transaction?L.persistence.transaction(()=>perform.call(this,id,...args),{financial:true,label:action==='refundPayment'?'Confirm this sample refund':'Confirm this sample payment result'}):perform.call(this,id,...args);}
      catch(error){L.go('txDetail',{id});L.error(error.message||'This result could not be saved. Keep the same reference.');return false;}
    };
  }
  L.retryPayment = id => {const t=tx(id);if(!t||t.status!=='failed'||t.type!=='out'||!t.paymentDraft)return;if(L.requestPaymentReplacement(()=>L.retryPayment(id),'retry:'+id,{resume:false}))return;L.state.paymentDraft={...t.paymentDraft,id:uid('D'),submittedTxId:null,pinAttempts:0,reviewFingerprint:null};const d=draft();if(d.bill){d.checked=false;L.save();L.go('bill',{kind:d.bill});}else if(d.method==='bank'||d.method==='momo'){d.checked=false;L.save();L.go('send',{method:d.method});}else{L.save();L.go('paymentReview');}};
  // Portable, printable receipt with real text. Native mobile sharing sends a
  // complete text record; download remains available when sharing is absent.
  L.receiptFacts=id=>{
    const t=tx(id);if(!t)return null;
    const card=t.cardId?L.virtualCards?.get(t.cardId):null;
    const method=t.virtualCardTransfer?(t.cardDirection==='out'?'Virtual card → Everyday Money':'Everyday Money → Virtual card'):t.method||'Lumo';
    const rows=[['Status',statusLabel(t)],['Reference',t.id],['Date',new Date(t.date).toLocaleString('en-GB')],['Name',t.name],['Method',method],['Amount',m(t.amount)],['Fee',m(t.fee||0)],['Total',m(Number(t.amount)+Number(t.fee||0))]];
    if(t.destination)rows.push(['Destination',t.destination]);if(t.provider)rows.push(['Provider',t.provider]);
    if(card)rows.push(['Card',card.name+' · •••• '+card.last4]);
    if(t.internalTransfer&&t.boxId)rows.push(['Movement',t.boxDirection==='out'?'Money Box → Everyday Money':'Everyday Money → Money Box']);
    if(t.collectionId)rows.push(['Collection account',t.collectionReference||t.collectionId]);
    if(t.product)rows.push(['Product',t.product]);if(t.note)rows.push(['Note',t.note]);
    if(t.delivery)rows.push(['Delivery',t.delivery==='delivered'?'Confirmed':t.delivery==='pending'?'Being checked':'Failed']);
    if(t.originalId)rows.push(['Original reference',t.originalId]);if(t.refundId)rows.push(['Refund reference',t.refundId]);
    if(t.refunded)rows.push(['Refund confirmed',m(t.refunded)]);if(t.refundAccount==='operational')rows.push(['Refund destination','Everyday Money · original card closed']);
    if(t.token)rows.push(['Sample electricity token',t.token]);
    const saving=L.paymentBudgetResult?.savingSummary?.(t),budget=L.paymentBudgetResult?.summary?.(t);
    if(budget){rows.push(['Left after Budget at confirmation',m(budget.room)]);if(budget.gap>0)rows.push(['Budget uncovered at confirmation',m(budget.gap)]);}
    if(saving){
      rows.push(['Automatic saving at confirmation (separate)',m(saving.total)]);
      for(const saved of saving.saved)rows.push(['Saved to '+saved.name,m(saved.amount)]);
      const reasons={'monthly-cap':'Monthly limit reached','budget-or-buffer':'Budget or balance buffer protected','target-reached':'Target reached','no-change':'No roundup needed','transfer-unavailable':'Transfer unavailable','instruction-unavailable':'Instruction unavailable'};
      for(const skipped of saving.skipped)rows.push(['Saving skipped · '+skipped.name,reasons[skipped.reason]||'Saved limits protected']);
      if(saving.refunded)rows.push(['Saving after the later refund','Saved money remains in Money Boxes. The refund did not move it.']);
    }
    const explanation=t.status==='pending'?'Pending is not confirmation. Check this same reference before paying again.':t.status==='failed'?'This attempt did not complete. No money moved.':t.internalTransfer?'Internal movement. This is not income or spending.':'';
    const text='LUMO · SAMPLE RECEIPT\nNo real money moved.\n\n'+rows.map(([label,value])=>label+': '+value).join('\n')+(explanation?'\n\n'+explanation:'');
    return {id:t.id,rows,explanation,text};
  };
  L.receiptDownload=id=>{
    if(L.state.locked){L.toast('Sign in before saving a receipt.');return false;}
    const facts=L.receiptFacts(id);if(!facts)return false;
    const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lumo sample receipt '+e(facts.id)+'</title><style>body{margin:0;background:#f1f1ef;color:#161616;font:16px/1.5 system-ui,sans-serif}main{max-width:40rem;margin:2rem auto;padding:2rem;background:#fff;border-radius:1rem}h1{font-size:1.6rem}small,p{color:#4b4b4b}dl{margin:2rem 0}dl div{display:grid;grid-template-columns:minmax(7rem,1fr) minmax(0,2fr);gap:1rem;border-bottom:1px solid #ddd;padding:.65rem 0}dt{color:#555}dd{margin:0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}footer{border-top:3px solid #d7ff3f;padding-top:1rem}@media(max-width:480px){main{margin:0;border-radius:0;padding:1.25rem}dl div{grid-template-columns:1fr;gap:.2rem}}@media print{body{background:#fff}main{margin:0;max-width:none}}</style><main><h1>Lumo receipt</h1><p>Sample money · No real payment</p><dl>'+facts.rows.map(([label,value])=>'<div><dt>'+e(label)+'</dt><dd>'+e(value)+'</dd></div>').join('')+'</dl>'+(facts.explanation?'<p>'+e(facts.explanation)+'</p>':'')+'<footer>Keep this reference when asking for help. A saved receipt does not change the payment status.</footer></main></html>';
    L.download('Lumo_Receipt_'+facts.id+'.html',html,'text/html;charset=utf-8');L.toast('Receipt downloaded. Open it to view, print or save as PDF.');return true;
  };
  L.downloadReceipt=id=>L.receiptDownload(id);
  L.shareReceipt=async id=>{
    const facts=L.receiptFacts(id);if(!facts)return false;if(L.state.locked){L.toast('Sign in before sharing a receipt.');return false;}
    if(!navigator.share)return L.receiptDownload(id);const account=L.state;
    try{await navigator.share({title:'Lumo sample receipt · '+facts.id,text:facts.text});return true;}
    catch(error){if(account!==L.state||L.state.locked)return false;if(error?.name==='AbortError'){L.toast('Sharing cancelled. Your receipt is still here.');return false;}L.toast('Sharing is unavailable here. Downloading your receipt instead.');return L.receiptDownload(id);}
  };
  const receiptDecoration=L.decorateView;
  L.decorateView=function(html,route){
    const content=receiptDecoration?receiptDecoration.call(this,html,route):html;
    if(route!=='txDetail')return content;
    return content.replace(/(<button\b[^>]*onclick="L\.downloadReceipt\(([^]*?)\)"[^>]*>)(Save receipt)(<\/button>)/g,(whole,open,id,label,close)=>btn('Share receipt','L.shareReceipt('+id.replace(/&quot;/g,'"').replace(/&#39;/g,"'") +')')+open+label+close);
  };
  L.correctCategory = id => {const t=tx(id);if(!t)return;t.category=L.value('tx-category');L.save();L.toast('Category updated.');L.go('txDetail',{id});};
  L.views.txDetail = () => {
    const t=tx(L.params.id);if(!t)return shell('Receipt','Payment not found.',btn('View activity',"L.go('activity')"));
    return shell(t.status==='pending'?'Payment status':'Receipt',t.status==='pending'?'We keep the same reference.':'A clear record of what happened.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><div class="avatar">${L.icon(t.status==='pending'?'clock':t.type==='in'?'arrowDown':'arrowUp',30)}</div><h1>${m(t.amount)}</h1><p>${t.type==='in'?'From':'To'} ${e(t.name)}</p><span class="pill">${e(statusLabel(t))}</span></div><div class="receipt">${sumLine('Reference',t.id)}${sumLine('Date',new Date(t.date).toLocaleString('en-GB'))}${sumLine('Method',t.method||'Lumo')}${t.destination?sumLine('Destination',t.destination):''}${t.provider?sumLine('Provider',t.provider):''}${sumLine('Amount',m(t.amount))}${sumLine('Fee',m(t.fee))}${sumLine('Total',m(Number(t.amount)+Number(t.fee||0)))}${t.product?sumLine('Product',t.product):''}${t.note?sumLine('Note',t.note):''}${t.delivery?sumLine('Delivery',t.delivery==='delivered'?'Confirmed':t.delivery==='pending'?'Being checked':'Failed'):''}${t.refunded?sumLine('Confirmed refund',m(t.refunded)):''}${t.originalId?sumLine('Original reference',t.originalId):''}${t.lastChecked?sumLine('Last checked',new Date(t.lastChecked).toLocaleTimeString('en-GB')):''}</div>${t.token?`<div class="notice"><span class="eyebrow">SAMPLE ELECTRICITY TOKEN</span><h2>${e(t.token)}</h2>${btn('Copy token',`L.copy('${t.token}')`,'text-btn')}</div>`:''}${t.status==='pending'?notice(t.type==='in'?'This money will be available when it arrives.':'This amount is reserved while we check. Please don’t pay again.'):t.status==='failed'?notice('You haven’t been charged. Your money is available again.'):''}${t.status==='success'&&t.type==='out'?`<details class="card"><summary>Correct spending category</summary>${select('Category','tx-category',[...new Set([t.category||'Other','Food','Transport','Study','Shopping','Phone','Data','Bills','Transfers','Other'])],t.category||'Other')}${btn('Save category',`L.correctCategory('${t.id}')`,'secondary')}</details>`:''}${err}<div class="actions">${t.status==='pending'||t.delivery==='pending'?btn('Check status',`L.refreshPayment('${t.id}')`):btn('Save receipt',`L.downloadReceipt('${t.id}')`)}${t.status==='failed'&&t.type==='out'&&t.paymentDraft?btn('Review a new attempt',`L.retryPayment('${t.id}')`,'secondary'):''}${btn('Get help with this payment',`L.go('supportCase',{txId:'${t.id}',reference:'${t.id}'})`,'secondary')}${btn('Back to activity',"L.go('activity')",'text-btn')}</div>${L.testMode&&t.status==='pending'?`<details class="notice small"><summary>Tester controls</summary><p>Simulate a confirmed provider result. Checking status above does not invent a result.</p>${btn('Confirm completed',`L.settlePayment('${t.id}','success')`,'secondary')}${btn('Confirm not completed',`L.settlePayment('${t.id}','failed')`,'secondary')}</details>`:L.testMode&&t.status==='success'&&t.delivery==='pending'?`<details class="notice small"><summary>Tester controls</summary>${btn('Confirm delivered',`L.deliveryUpdate('${t.id}','delivered')`,'secondary')}${btn('Confirm delivery failed',`L.deliveryUpdate('${t.id}','failed')`,'secondary')}</details>`:L.testMode&&t.status==='success'&&t.type==='out'?`<details class="notice small"><summary>Tester controls</summary><p>A help request alone never returns money. This action simulates an actual confirmed refund.</p>${btn('Confirm full refund',`L.refundPayment('${t.id}')`,'secondary')}</details>`:''}`);
  };
  L.openFunding = (returnTo='home') => {L.state.fundingReturn=returnTo;L.save();L.go('addMoney');};
  L.fundingDone = () => {const route=L.state.fundingReturn||'home';L.state.fundingReturn=null;L.save();L.go(route);};
  L.views.addMoney = () => shell('Add money','Your next move starts here.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><span class="eyebrow">TOP UP YOUR DAY</span><h1>A little more<br>room to move.</h1><p>Available now <strong>${m(L.balances().available)}</strong></p></div><div class="list">${L.row('Mobile money','Approve in your own wallet','phone','L.startMomoFunding()')}${L.row('Bank transfer via GIP','Transfer from your bank app','bank','L.startBankFunding()')}</div>${notice('This ambassador test uses simulated credits only. Never send real money to the sample account.')}<div class="actions">${btn('Back to '+(L.state.fundingReturn==='paymentReview'?'my payment':'Home'),'L.fundingDone()','text-btn')}</div>`);
  L.startMomoFunding = () => {
    const old=L.state.fundingDraft;
    const unfinished=old&&!old.txId&&['form','review'].includes(old.stage);
    const pending=old?.txId&&tx(old.txId)?.status==='pending';
    // Reopening is a continuation, not permission to erase unsent input.
    // A completed request starts fresh; a failed one keeps details for review.
    if(!unfinished&&!pending){const retry=old?.txId&&tx(old.txId)?.status==='failed',number=L.state.profile.phone||'0241230123';L.state.fundingDraft={id:uid('F'),amount:retry?old.amount:'',number,owned:retry&&L.mobileNetwork.normalize(old.number)===L.mobileNetwork.normalize(number)?!!old.owned:false,stage:'form'};}
    L.save();L.go('momoAdd');
  };
  L.reviewMomoFunding = () => {
    const f=L.state.fundingDraft; if(f.txId){L.go('momoAdd');return;}
    const registered=L.state.profile.phone||'0241230123';f.amount=L.value('funding-amount');
    if(L.mobileNetwork.normalize(f.number)!==L.mobileNetwork.normalize(registered)){f.number=registered;f.owned=false;L.save();L.go('momoAdd');L.error('Your registered number changed. Confirm this wallet before continuing.','funding-owned');return;}
    f.number=registered;f.owned=!!document.getElementById('funding-owned')?.checked;L.save();
    if(!validPhone(f.number))return L.error('Enter a valid Ghana wallet number.','funding-number');
    if(!amountOK(f.amount))return L.error('Enter GH₵0.01 to GH₵5,000.00, using no more than 2 decimal places.','funding-amount');
    if(!f.owned)return L.error('Confirm this wallet is registered to you.','funding-owned');
    if(!L.mobileNetwork.require(f,f.number,L.reviewMomoFunding))return;
    f.amount=Math.round(f.amount*100)/100;f.stage='review';L.save();L.go('momoAdd');
  };
  L.requestMomoFunding = () => {
    const f=L.state.fundingDraft;if(!f)return;
    if(!f.txId){
      if(f.stage!=='review'||!f.owned||!amountOK(f.amount))return;
      if(L.mobileNetwork.normalize(f.number)!==L.mobileNetwork.normalize(L.state.profile.phone||'0241230123')){f.stage='form';f.owned=false;L.save();L.go('momoAdd');L.toast('Your registered number changed. Review this wallet again.');return;}
      if(!L.mobileNetwork.require(f,f.number,L.requestMomoFunding))return;
    }
    if(!f.txId){const t=L.addTx({draftId:f.id,type:'in',name:'Mobile money top up',amount:f.amount,fee:0,status:'pending',category:'Top ups',method:f.network,note:'Test funding request. Awaiting confirmed incoming credit.'});t.destination=f.number;f.txId=t.id;f.stage='approval';L.save();}
    if(!L.testMode){L.resolveTx(f.txId,'success');f.stage='result';L.save();}
    L.go('momoAdd');
  };
  L.fundingOutcome = status => {
    const f=L.state.fundingDraft; if(!f||!f.txId)return;
    L.resolveTx(f.txId,status);f.stage='result';L.save();L.go('momoAdd');
  };
  L.fundingApproved = () => {const f=L.state.fundingDraft;f.approved=true;L.save();L.go('momoAdd');L.toast('Approval alone is not incoming credit. This top up is still pending.');};
  L.views.momoAdd = () => {
    let f=L.state.fundingDraft;if(!f){L.state.fundingDraft={id:uid('F'),amount:'',number:L.state.profile.phone||'0241230123',stage:'form'};f=L.state.fundingDraft;}
    if(f.txId){const t=tx(f.txId);if(!t){f.txId=null;f.stage='form';L.save();return L.views.momoAdd();}return shell('Mobile money top-up',t.status==='success'?'Ready to use.':t.status==='failed'?'No money was added.':'Waiting for confirmation.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><div class="avatar">${L.icon(t.status==='success'?'check':t.status==='failed'?'close':'phone',32)}</div><h1>${t.status==='success'?'Money added.':t.status==='failed'?'Top-up unsuccessful.':'Waiting for your wallet.'}</h1><p>${m(f.amount)} from ${e(f.network)}</p></div><div class="receipt">${sumLine('Wallet',f.number)}${sumLine('Reference',t.id)}${sumLine('Status',statusLabel(t))}</div>${t.status==='pending'?`${notice('This top-up is still pending. Check the same request before trying again.')}${btn('Check status',`L.refreshPayment('${t.id}')`)}${btn('Leave for now','L.fundingDone()','text-btn')}${testOnly(`<details class="notice small"><summary>Tester controls</summary><p>Simulate the provider’s confirmed result.</p>${btn(f.approved?'Check funding status':'I approved in my wallet','L.fundingApproved()','secondary')}${btn('Confirm incoming credit',"L.fundingOutcome('success')",'secondary')}${btn('Wallet declined / expired',"L.fundingOutcome('failed')",'secondary')}</details>`)}`:`<div class="actions">${btn(L.state.fundingReturn==='paymentReview'?'Return to payment':'Done','L.fundingDone()')}${btn('View receipt',`L.go('txDetail',{id:'${t.id}'})`,'secondary')}${t.status==='failed'?btn('Try again','L.startMomoFunding()','text-btn'):''}</div>`}${err}`);}
    if(f.stage==='review')return shell('Review top-up','Check the amount and wallet.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><h1>${m(f.amount)}</h1><p>from your registered wallet</p></div>${L.mobileNetwork.status(f)}<div class="receipt">${sumLine('Wallet holder',L.state.profile.name)}${sumLine('Wallet number',f.number)}${sumLine('Fee',m(0))}${sumLine('Total',m(f.amount))}</div>${notice(L.testMode?'Request once, then approve in your wallet. Your balance updates after confirmation.':'Sample money only. No wallet prompt or real transfer will be created.')}<div class="actions">${btn(L.testMode?'Request wallet approval':'Add money','L.requestMomoFunding()')}${btn('Edit top-up',"L.state.fundingDraft.stage='form';L.save();L.go('momoAdd')",'secondary')}${btn('Cancel','L.fundingDone()','text-btn')}</div>`);
    const registered=L.state.profile.phone||'0241230123';if(L.mobileNetwork.normalize(f.number)!==L.mobileNetwork.normalize(registered))f.owned=false;f.number=registered;
    return shell('From mobile money','Choose an amount.',`${form(`<div class="registered-wallet"><span>Your registered wallet</span><strong>${e(f.number)}</strong></div><input type="hidden" id="funding-number" value="${e(f.number)}">${L.mobileNetwork.status(f)}${cash('funding-amount',f.amount)}<label class="inline small" for="funding-owned"><input type="checkbox" id="funding-owned" required ${f.owned?'checked':''}> This wallet is registered to me.</label>${err}${submit('Review top-up')}`,'L.reviewMomoFunding()')}${notice('Sample money only. Your mobile wallet will not be charged.')}`);
  };
  L.startBankFunding = () => {L.state.bankFunding={id:uid('B')};L.save();L.go('bankAdd');};
  L.bankSent = () => {L.toast('Check the outgoing transfer in your bank app. No Lumo credit is confirmed yet.');};
  L.testBankCredit = () => {
    if(!L.testMode)return;
    const f=L.state.bankFunding||(L.state.bankFunding={id:uid('B')});if(f.txId){L.go('txDetail',{id:f.txId});return;}
    const amount=Number(L.value('bank-test-amount'));if(!amountOK(amount))return L.error('Enter GH₵0.01 to GH₵5,000.00, using no more than 2 decimal places.');
    const t=L.addTx({draftId:f.id,type:'in',name:'Bank transfer received',amount:Math.round(amount*100)/100,fee:0,status:'success',category:'Top ups',method:'GIP incoming',note:'Simulated confirmed incoming bank credit'});f.txId=t.id;L.save();L.go('bankAdd');L.toast(L.testMode?'Test incoming credit confirmed once.':'Sample money added.');
  };
  L.bankDetailsText = () => 'Sample Lumo receiving details. Do not send real money.\nBank: GCB Bank (sample)\nAccount name: '+L.state.profile.name+'\nAccount number: '+L.state.profile.account;
  L.copyBankDetails = () => L.copy(L.bankDetailsText());
  L.shareBank = async () => {
    const text=L.bankDetailsText();
    try{if(navigator.share)await navigator.share({title:'Sample Lumo receiving details',text});else await L.copy(text);}catch{L.toast('Sharing cancelled. Your details are still here.');}
  };
  L.views.bankAdd = () => {
    const f=L.state.bankFunding||{};const t=f.txId&&tx(f.txId);
    const receiving=`<div class="receipt">${sumLine('Receiving bank','GCB Bank (sample)')}${sumLine('Account name',L.state.profile.name)}${sumLine('Account number',L.state.profile.account)}</div>`;
    if(!L.testMode)return shell('Bank transfer','Your Lumo receiving account.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><h1>Your receiving details.</h1><p>Transfer from your bank app using GIP.</p></div>${notice('Sample details. Do not send real money.')}${receiving}<div class="actions">${btn('Copy sample details','L.copyBankDetails()')}${btn(L.state.fundingReturn==='paymentReview'?'Return to payment':'Done','L.fundingDone()','secondary')}${btn('View incoming activity',"L.go('activity',{filter:'in'})",'text-btn')}</div><p class="tiny muted">Your balance updates when an incoming transfer is confirmed.</p>`);
    return shell('Bank transfer via GIP','Transfer from your bank app.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><div class="avatar">${L.icon('bank',32)}</div><h1>Your receiving details.</h1><p>Choose GIP in your bank app and check the account name.</p></div>${notice('Sample account. Never transfer real money to these details.')}${receiving}<div class="grid2">${btn('Copy account number',`L.copy('${e(L.state.profile.account)}')`,'secondary')}${btn('Share details','L.shareBank()','secondary')}</div>${t?`<div class="notice"><strong>${m(t.amount)} received</strong><p>Confirmed test credit · ${e(t.id)}</p></div>`:`<div class="actions">${btn('I sent it','L.bankSent()','secondary')}${btn('Check incoming activity',"L.go('activity',{filter:'in'})",'text-btn')}</div>`}<div class="actions">${btn(L.state.fundingReturn==='paymentReview'?'Return to payment':'Done','L.fundingDone()')}${btn('Bank debited, no credit?',"L.go('supportCase',{kind:'Missing incoming bank transfer'})",'text-btn')}</div>${!t?`<details class="notice small"><summary>Tester controls · incoming bank credit</summary><p>Simulate a confirmed incoming transfer.</p>${cash('bank-test-amount',f.amount??100,'Test credit')}${err}${btn('Confirm test incoming transfer','L.testBankCredit()','secondary')}</details>`:''}`);
  };
  L.findMerchant = suppliedCode => {
    if(L.platform?.requireOnline?.('Start a payment')===false)return;
    const code=String(suppliedCode??L.value('merchant-code')).trim().toUpperCase();const sale=L.acct?.collectionForCode?.(code);if(sale){if(sale.status!=='Waiting for customer'||Date.now()>sale.expires){if(sale.payerTxId){L.go('txDetail',{id:sale.payerTxId});return;}return L.error('This bill is '+sale.status.toLowerCase()+'. Ask the merchant for a fresh bill.');}if(L.requestPaymentReplacement(()=>L.findMerchant(code),'sale:'+sale.id))return;L.state.paymentDraft={id:uid('D'),method:'campus',name:L.state.merchant.name,destination:sale.id,merchantSaleId:sale.id,checked:true,amount:sale.amount,fixedAmount:true,fee:0,note:'Campus sale',category:'Food'};L.save();L.go('send',{method:'campus'});return;}const merchant=merchants.find(x=>x.id===code);
    if(!merchant)return L.error('We couldn’t find that merchant or sale code. Check it and try again.');L.pickMerchant(code);
  };
  L.pickMerchant = code => {
    const merchant=merchants.find(x=>x.id===code);if(!merchant)return;
    if(L.platform?.requireOnline?.('Start a payment')===false)return;
    if(L.requestPaymentReplacement(()=>L.pickMerchant(code),'merchant:'+code))return;
    L.state.paymentDraft={id:uid('D'),method:'campus',name:merchant.name,destination:merchant.id,merchantId:merchant.id,checked:true,amount:'',fee:0,note:'',category:merchant.category,essentialId:L.params.essentialId||''};L.save();L.go('send',{method:'campus'});
  };
  L.views.campusPay = () => shell('Campus Pay','The places that make campus yours.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><span class="eyebrow">RIGHT HERE, ON CAMPUS</span><h1>Good food.<br>Quick payment.</h1><p>Check the merchant, then choose your amount.</p></div><div class="card soft"><div class="split">${L.icon('scan',44)}<div><h3>Scan a merchant QR</h3><p class="small muted">In this test, use a sample QR or type a code. No camera access needed.</p></div></div>${btn('Try sample QR · Akua’s Kitchen',"L.pickMerchant('AK01')",'secondary')}</div><label class="field">Merchant code<div class="inline"><input class="input" id="merchant-code" placeholder="e.g. AK01" autocomplete="off">${btn('Find','L.findMerchant()','secondary')}</div></label>${err}<div class="section-head"><h2>Around campus</h2></div><div class="list">${merchants.map(merchant=>L.row(merchant.name,merchant.detail+' · '+merchant.id,'scan',`L.pickMerchant('${merchant.id}')`)).join('')}</div>`);
  const packages = {
    data:[{label:'1 GB · 7 days · GH₵15.00',price:15},{label:'3 GB · 30 days · GH₵40.00',price:40},{label:'10 GB · 30 days · GH₵100.00',price:100}],
    tv:[{label:'Access · 30 days · GH₵100.00',price:100},{label:'Family · 30 days · GH₵200.00',price:200}],
    internet:[{label:'25 GB · 30 days · GH₵120.00',price:120},{label:'60 GB · 30 days · GH₵240.00',price:240}]
  };
  const providers = {airtime:['MTN','Telecel','AT'],data:['MTN','Telecel','AT'],electricity:['ECG Prepaid','ECG Bill Payment'],water:['Ghana Water'],tv:['DStv','GOtv'],internet:['Telecel Broadband','MTN Broadband']};
  L.startBill = kind => {
    if(L.platform?.requireOnline?.('Pay a bill')===false)return;if(!billNames[kind])kind='airtime';if(L.requestPaymentReplacement(()=>L.startBill(kind),'bill:'+kind))return;const first=packages[kind]?.[0];L.state.paymentDraft={id:uid('D'),method:'bill',bill:kind,amount:first?.price||'',note:'',fee:0,...(first?{packageIndex:0,product:first.label}:{}),essentialId:L.params.essentialId||'',...(!L.testMode?{destination:['airtime','data'].includes(kind)?L.state.profile.phone||'0241230123':'12345678901'}:{})};L.save();L.go('bill',{kind});
  };
  L.selectBillPackage=()=>{
    const d=draft(),index=Number(L.value('bill-package')),p=packages[d?.bill]?.[index];if(!p||d.submittedTxId)return;
    Object.assign(d,{packageIndex:index,amount:p.price,product:p.label});L.save();
    const input=document.getElementById('payment-amount');if(input)input.value=p.price;L.refreshPaymentProjection?.();
  };
  L.billSample = () => {const d=draft();document.getElementById('bill-account').value=['airtime','data'].includes(d.bill)?(L.state.profile.phone||'0241230123'):'12345678901';if(['airtime','data'].includes(d.bill))L.mobileNetwork.check(d,document.getElementById('bill-account').value);};
  L.billLookup = (advance=true) => {
    const d=draft();if(!paymentGuard(d))return;
    const destination=L.value('bill-account').replace(/[\s-]/g,'');d.destination=destination;
    if(['airtime','data'].includes(d.bill)?!validPhone(destination):!/^\d{6,16}$/.test(destination))return L.error(['airtime','data'].includes(d.bill)?'Enter a valid Ghana phone number.':'Enter a 6–16 digit account or meter number.');
    if(!['airtime','data'].includes(d.bill)&&destination!=='12345678901')return L.error('This preview uses sample account 12345678901. Live account checks aren’t available yet.');
    if(['airtime','data'].includes(d.bill)){if(!L.mobileNetwork.require(d,destination,()=>advance?L.billLookup():L.reviewTransactionDetails()))return;}
    else d.provider=providers[d.bill].length===1?providers[d.bill][0]:L.value('bill-provider');
    if(packages[d.bill]){const index=Number(L.value('bill-package'));const p=packages[d.bill][index];if(!p)return L.error('Choose a package to continue.');d.product=p.label;d.amount=p.price;d.packageIndex=index;}
    d.name=['airtime','data'].includes(d.bill)?d.provider+' '+billNames[d.bill]:d.provider+' · '+L.state.profile.name;
    d.checked=true;L.save();if(advance)L.go('bill',{kind:d.bill});return true;
  };
  L.editBillAccount = () => {const d=draft();if(!paymentGuard(d))return;L.savePaymentFields();d.checked=false;L.save();L.go('bill',{kind:d.bill});};
  L.views.bill = () => {
    let d=draft();const kind=L.params.kind||d?.bill||'airtime';if(!d||!d.bill){L.state.paymentDraft={id:uid('D'),method:'bill',bill:kind,amount:'',note:'',fee:0};d=draft();}
    if(d.submittedTxId)return L.views.paymentResult();
    const mobile=['airtime','data'].includes(d.bill);const fixed=!!packages[d.bill];
    const providerField=mobile?'':providers[d.bill].length===1?`<p class="fixed-provider">${e(providers[d.bill][0])}</p>`:select('Provider','bill-provider',providers[d.bill],d.provider);
    return entryShell(billNames[d.bill],'Choose the account and amount.',`${form(`<div class="${mobile||providers[d.bill].length===1?'automatic-mobile-details':'transaction-account-fields'}">${providerField}${field(mobile?'Phone number':d.bill==='electricity'?'Meter or account number':'Customer account number','bill-account',mobile?'0241230123':'12345678901','tel',d.destination||'')}</div>${mobile?L.mobileNetwork.status(d):''}${testOnly(btn(mobile?'Use my test number':'Use sample account','L.billSample()','text-btn'))}${fixed?`<label class="field" for="bill-package"><span>${d.bill==='data'?'Data bundle':'Package'}</span><select class="input" id="bill-package" onchange="L.selectBillPackage()">${packages[d.bill].map((p,index)=>`<option value="${index}" ${Number(d.packageIndex||0)===index?'selected':''}>${e(p.label)}</option>`).join('')}</select></label><input type="hidden" id="payment-amount" value="${d.amount}">`:cash('payment-amount',d.amount,d.bill==='airtime'?'Airtime value':'Payment amount')}${L.paymentPlanLinkFields(d)}${err}${submit('Review purchase')}${field('Note (optional)','payment-note','For your records','text',d.note||'')}${btn('Leave for now','L.leavePayment()','text-btn')}`,'L.reviewTransactionDetails()')}<p class="preview-boundary">Sample service · No real purchase</p>`);
  };
  L.newRequest = () => {const old=L.state.requestDraft;if(!old||old.created||!['form','review'].includes(old.stage))L.state.requestDraft={id:uid('RQ'),amount:'',note:'',to:'Shareable link',stage:'form'};L.save();L.go('requestCreate');};
  L.demoReceivedRequest = () => {
    let r=L.state.requests.find(x=>x.demoReceived&&x.status==='waiting');if(!r){r={id:uid('RQ'),from:'abena',name:'Abena Asante',handle:'@abena.a',to:'self',amount:45,note:'Your share of lunch 🍲',status:'waiting',expires:new Date(Date.now()+7*86400000).toISOString(),demoReceived:true};L.state.requests.unshift(r);L.save();}L.go('requestDetail',{id:r.id});
  };
  L.views.requests = () => {
    const filter=['all','received','sent'].includes(L.params.filter)?L.params.filter:'all';
    const all=[...L.state.requests].sort((a,b)=>new Date(b.created||b.expires)-new Date(a.created||a.expires)).filter(r=>filter==='all'||(filter==='sent'?r.from==='self':r.to==='self'&&r.from!=='self'));
    const page=Math.min(Math.max(0,Math.trunc(Number(L.params.page)||0)),Math.max(0,Math.ceil(all.length/3)-1));
    const rows=all.slice(page*3,page*3+3).map(r=>{if(r.status==='waiting'&&Date.now()>new Date(r.expires).getTime())r.status='expired';const status={waiting:'Waiting for payment',paid:'Paid',processing:'Payment being checked',declined:'Declined',cancelled:'Cancelled',expired:'Expired'}[r.status]||r.status;return L.row(r.from==='self'?(r.to==='Shareable link'?'Your request':'To '+r.to):r.name,`${status} · ${r.note||'Money request'}`,'arrowDown',`L.go('requestDetail',{id:'${r.id}'})`,m(r.amount));}).join('');
    const pages=all.length>3?`<div class="split" aria-label="Request pages">${page?btn('Previous',`L.go('requests',{filter:'${filter}',page:${page-1}})`,'text-btn'):'<span></span>'}<span class="tiny muted">${page+1} of ${Math.ceil(all.length/3)}</span>${(page+1)*3<all.length?btn('Next',`L.go('requests',{filter:'${filter}',page:${page+1}})`,'text-btn'):'<span></span>'}</div>`:'';
    return shell('Money requests','Your share, made simple.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><h1>A simple ask.</h1><p>Keep track of what you’ve asked for and what you owe.</p></div>${btn('Request money','L.newRequest()')}<div class="chips" aria-label="Filter requests">${[['all','All'],['received','Received'],['sent','Sent']].map(([key,label])=>`<button type="button" class="chip ${filter===key?'selected':''}" aria-pressed="${filter===key}" onclick="L.go('requests',{filter:'${key}'})">${label}</button>`).join('')}</div><div class="list">${rows||'<div class="empty"><h2>No requests here.</h2><p>New requests will appear here.</p></div>'}</div>${pages}${testOnly(`<details class="notice small"><summary>Try a received request</summary><p>Open a sample GH₵45.00 request from Abena. Pay, decline or leave.</p>${btn('Open sample request','L.demoReceivedRequest()','secondary')}</details>`)}`);
  };
  L.reviewRequest = () => {
    const d=L.state.requestDraft;if(!d)return;
    d.amount=L.value('request-amount');d.note=L.value('request-note').slice(0,120);d.to=L.value('request-to');
    if(!amountOK(d.amount))return L.error('Enter GH₵0.01 to GH₵5,000.00, using no more than 2 decimal places.','request-amount');
    d.amount=Math.round(d.amount*100)/100;d.stage='review';L.save();L.go('requestCreate');
  };
  L.createRequest = () => {
    const d=L.state.requestDraft;if(!d)return;
    const existing=req(d.id);if(existing){L.go('requestDetail',{id:existing.id});return;}
    const r={id:d.id,from:'self',name:L.state.profile.name,handle:L.state.profile.handle||'you',to:d.to,amount:d.amount,note:d.note,status:'waiting',created:new Date().toISOString(),expires:new Date(Date.now()+7*86400000).toISOString()};L.state.requests.unshift(r);d.created=true;L.save();L.go('requestDetail',{id:r.id});
  };
  L.views.requestCreate = () => {
    let d=L.state.requestDraft;if(!d){L.state.requestDraft={id:uid('RQ'),amount:'',note:'',to:'Shareable link',stage:'form'};d=L.state.requestDraft;}
    if(d.stage==='review')return shell('Review your request','The amount stays fixed after creation.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px">${amountHeading(d.amount)}<p>For ${e(d.to)}</p></div><div class="receipt">${sumLine('Requester',L.state.profile.name)}${sumLine('Receiving account',L.state.profile.account)}${sumLine('Amount',m(d.amount))}${sumLine('Reason',d.note||'Money request')}${sumLine('Expiry','7 days after creation')}</div>${notice('They choose when to pay. To change the amount later, cancel this request and create another.')}<div class="actions">${btn('Create request','L.createRequest()')}${btn('Edit request',"L.state.requestDraft.stage='form';L.save();L.go('requestCreate')",'secondary')}</div>`);
    return shell('Request money','Make the ask clear.',`<form class="form" onsubmit="event.preventDefault();L.reviewRequest()">${cash('request-amount',d.amount)}${select('Who’s it for?','request-to',['Shareable link',...people.map(p=>p.name)],d.to)}${field('Reason (optional)','request-note','e.g. Our lunch at Akua’s','text',d.note||'')}${notice('Requests expire after 7 days. Your money arrives when they pay.')}${err}${submit('Review request')}</form>`);
  };
  L.requestLink = r => `${location.origin}${location.pathname}#request=${encodeURIComponent(r.id)}`;
  L.shareRequest = async id => {const r=req(id);if(!r)return;const text=`${r.name} requests ${m(r.amount)}${r.note?' for '+r.note:''}. Sample Lumo request. No real money can be sent.${L.testMode?' '+L.requestLink(r):''}`;try{if(navigator.share)await navigator.share({title:'Lumo money request',text,...(L.testMode?{url:L.requestLink(r)}:{})});else await L.copy(text);}catch{L.toast('Sharing cancelled. Your request is saved.');}};
  L.closeRequest = (id,status) => {const r=req(id);if(!r)return;if(r.txId){L.go('txDetail',{id:r.txId});return;}if(!requestOpen(r)){L.go('requestDetail',{id});return;}r.status=status;L.save();L.go('requestDetail',{id});L.toast(status==='declined'?'Request declined. No money moved.':'Request cancelled. No money moved.');};
  L.payRequest = id => {
    if(L.platform?.requireOnline?.('Pay a request')===false)return;
    const r=req(id);if(!r||r.from==='self'||!requestOpen(r)||r.to!=='self'){L.go('requestDetail',{id});return;}
    if(r.txId){L.go('paymentResult',{id:r.txId});return;}
    if(L.requestPaymentReplacement(()=>L.payRequest(id),'request:'+id))return;
    L.state.paymentDraft={id:uid('D'),method:'request',requestId:r.id,name:r.name,destination:r.handle,amount:r.amount,fee:0,note:r.note,checked:true};L.save();L.go('paymentReview');
  };
  L.simRequestCredit = id => {
    const r=req(id);if(!r||r.from!=='self'||!requestOpen(r)||r.txId)return;
    const t=L.addTx({draftId:r.id+'credit',type:'in',name:r.to==='Shareable link'?'Sample request payer':r.to,amount:r.amount,fee:0,status:'success',category:'Transfers',method:'Lumo request',note:r.note,requestId:r.id});r.txId=t.id;r.status='paid';L.save();L.go('requestDetail',{id});
  };
  L.views.requestDetail = () => {
    const r=req(L.params.id);if(!r)return shell('Request unavailable','We couldn’t open this request.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><h1>Request unavailable.</h1><p>This request isn’t available here. Ask the sender to check it or send a new link.</p></div>${btn('Open requests',"L.go('requests')")}`);
    if(r.to!=='self'&&r.from!=='self')return shell('Request unavailable','This request belongs to another account.',btn('Back to requests',"L.go('requests')"));
    if(r.status==='waiting'&&new Date(r.expires).getTime()<Date.now()){r.status='expired';L.save();}
    const own=r.from==='self';const open=requestOpen(r);const label={waiting:'Waiting for payment',paid:'Paid',processing:'Payment being checked',declined:'Declined',cancelled:'Cancelled',expired:'Expired'}[r.status]||r.status;
    return shell(own?'Your money request':'A request for you','Take a moment to check who and what.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px"><div class="avatar">${L.icon(own?'arrowDown':'user',30)}</div>${amountHeading(r.amount)}<p>${own?'Requested by you':'From <strong>'+e(r.name)+'</strong>'}</p><span class="pill">${e(label)}</span></div><div class="receipt">${sumLine('Reason',r.note||'Money request')}${sumLine(own?'For':'Requester',own?r.to:r.name+' · '+r.handle)}${sumLine('Reference',r.id)}${sumLine('Expires',new Date(r.expires).toLocaleDateString('en-GB'))}</div>${r.txId?notice('This request is linked to payment '+e(r.txId)+'. Its actual status is on the receipt.'):''}${own&&open?`<div class="actions">${btn(L.testMode?'Share request':'Share request details',`L.shareRequest('${r.id}')`)}${testOnly(btn('Copy request link',`L.copy(L.requestLink(L.state.requests.find(r=>r.id==='${r.id}')))`,'secondary'))}${btn('Cancel request',`L.go('requestConfirm',{id:'${r.id}',action:'cancelled'})`,'text-btn')}</div><p class="tiny muted">Preview request · Saved on this device. Shared details can’t receive real payments.</p>${testOnly(`<details class="notice small"><summary>Tester controls</summary><p>Simulate a verified incoming payment linked to this request.</p>${btn('Confirm sample payer paid',`L.simRequestCredit('${r.id}')`,'secondary')}</details>`)}`:!own&&open?`<div class="actions">${btn('Pay '+m(r.amount),`L.payRequest('${r.id}')`)}${btn('Decline request',`L.go('requestConfirm',{id:'${r.id}',action:'declined'})`,'secondary')}${btn('Leave',"L.go('requests')",'text-btn')}${btn('Report this request',`L.go('supportCase',{reference:'${r.id}',kind:'Money request'})`,'text-btn')}</div>`:r.txId?`<div class="actions">${btn('View linked payment',`L.go('txDetail',{id:'${r.txId}'})`)}${btn('Done',"L.go('requests')",'secondary')}</div>`:`<div class="notice"><p>This request is closed. You can no longer pay it.</p></div>${btn('Back to requests',"L.go('requests')")}`}`);
  };
  L.views.requestConfirm = () => {
    const r=req(L.params.id);if(!r)return L.views.requests();const decline=L.params.action==='declined';
    return shell(decline?'Decline this request?':'Cancel this request?','Check before closing it.',`<div class="hero" style="display:flex;flex-direction:column;gap:12px">${amountHeading(r.amount)}<p>${e(r.note||'Money request')}</p></div>${notice(decline?'No money will move. The request will show Declined.':'The saved link will close. Cancelling a request cannot cancel a payment already accepted.')}<div class="actions">${btn(decline?'Yes, decline request':'Yes, cancel request',`L.closeRequest('${r.id}','${decline?'declined':'cancelled'}')`)}${btn('Keep request',`L.go('requestDetail',{id:'${r.id}'})`,'secondary')}</div>`);
  };
  for(const action of ['requestMomoFunding','fundingOutcome','testBankCredit','simRequestCredit']){
    const perform=L[action];
    L[action]=function(...args){
      try{return L.persistence?.transaction?L.persistence.transaction(()=>perform.apply(this,args),{financial:true,label:'Confirm incoming sample money'}):perform.apply(this,args);}
      catch(error){L.render();L.error(error.message||'The incoming money could not be saved. Keep the same reference.');return false;}
    };
  }

})();
