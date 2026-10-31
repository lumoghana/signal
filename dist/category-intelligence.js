/* Optional category correction never changes funds or fulfils planned costs.
   An explicit Pay from budget choice supplies the initial payment purpose.
   Local deterministic preview: no live enrichment or production accuracy claim. */
(()=>{
'use strict';
const E=L.e,B=L.btn,M=L.money,Q=value=>E(JSON.stringify(value??''));
const categories=['Food','Transport','Study','Data','Phone','Shopping','Bills','Rent','Gifts','Repayment','Transfers','Other'];
const words=[['Food',/\b(food|lunch|dinner|breakfast|waakye|g[oɔ]b[eɛ]|gari|beans|meal|groceries)\b/i],['Transport',/\b(transport|trotro|taxi|uber|bolt|bus fare|ride)\b/i],['Study',/\b(printing|print|books?|study|photocop(?:y|ies)|stationery)\b/i],['Data',/\b(data|internet|wifi|broadband)\b/i],['Phone',/\b(airtime|phone credit)\b/i],['Rent',/\b(rent|hostel|accommodation)\b/i],['Bills',/\b(electricity|water bill|utility|utilities)\b/i],['Shopping',/\b(shopping|sneakers|clothes|shirt)\b/i],['Gifts',/\b(gift|birthday)\b/i],['Repayment',/\b(repayment|payback|pay back|owe|owed)\b/i]];
const norm=v=>String(v||'').toLowerCase().replace(/[’']/g,'').replace(/\s+/g,' ').trim();
const get=id=>(L.state.txs||[]).find(t=>t.id===id);
const eligible=t=>t?.type==='out'&&t.status==='success';
const canEdit=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed;
const metadata=()=>{if(!Array.isArray(L.state.categoryRules))L.state.categoryRules=[];return L.state.categoryRules;};
L.categoryRecipientKey=record=>{
 if(!record)return '';if(record.categoryRecipientKey)return record.categoryRecipientKey;
 const d=record.paymentDraft||record,method=norm(d.method),id=d.merchantId||d.recipient||d.destination;
 return id?[method,norm(d.provider),norm(id).replace(/[\s-]/g,'')].join('|'):'';
};
const matchingRule=d=>{const key=L.categoryRecipientKey(d);return key?metadata().find(r=>r.key===key&&categories.includes(r.category)):null;};
const merchantCategories={AK01:'Food',CP02:'Study',RB03:'Transport'};
const noteCategory=d=>{const matches=words.filter(([,pattern])=>pattern.test(d?.note||''));return matches.length===1?matches[0][0]:'';};
const budgetPurpose=d=>{
 if(d?.method==='box'||!d?.essentialId)return null;
 const source=L.paymentSourceInfo?.(d);if(source?.type!=='budget-line')return null;
 const saved=(L.state.essentials||[]).find(c=>c.id===source.id),fixed=L.budgetCategories?.resolve(saved||source.name);
 const exact=categories.find(c=>norm(c)===norm(source.name)),matches=words.filter(([,pattern])=>pattern.test(source.name));
 // A mixed/custom budget label is an explicit customer purpose in its own
 // right. Keep it verbatim rather than guessing a narrower canonical category.
 const canonical=exact||(matches.length===1?matches[0][0]:'');
 return {category:fixed?.name||canonical||source.name,source:'budget-source',confidence:'confirmed',purpose:source.name,budgetLineId:source.id,canonicalCategory:canonical,...(fixed?{budgetCategory:fixed.id}:{})};
};
L.predictCategory=d=>{
 if(!d)return {category:'',source:'unknown',confidence:'unknown'};
 if(d.categoryChoiceKey===L.categoryRecipientKey(d)&&categories.includes(d.categoryChoice))return {category:d.categoryChoice,source:'customer',confidence:'confirmed'};
 const purpose=budgetPurpose(d);if(purpose)return purpose;
 const rule=matchingRule(d),note=noteCategory(d);
 if(rule){
  if(note&&note!==rule.category)return {category:note,source:'rule-conflict',confidence:'suggested',usualCategory:rule.category};
  return {category:rule.category,source:'rule',confidence:'high'};
 }
 if(d.merchantId&&merchantCategories[d.merchantId])return {category:merchantCategories[d.merchantId],source:'merchant',confidence:'high'};
 if(d.merchantSaleId)return {category:d.category||'Food',source:'merchant',confidence:'high'};
 if(d.bill)return {category:d.bill==='data'||d.bill==='internet'?'Data':d.bill==='airtime'?'Phone':'Bills',source:'biller',confidence:'high'};
 if(note)return {category:note,source:'description',confidence:'suggested'};
 const key=L.categoryRecipientKey(d),history=key?(L.state.txs||[]).filter(t=>eligible(t)&&t.categoryMeta?.source==='customer'&&L.categoryRecipientKey(t)===key):[];
 const labels=[...new Set(history.map(t=>t.category))];
 if(history.length&&labels.length===1)return {category:labels[0],source:'history',confidence:'suggested'};
 return {category:'',source:'unknown',confidence:'unknown'};
};
L.needsCategory=t=>eligible(t)&&!['confirmed','high'].includes(t.categoryMeta?.confidence)&&(['Uncategorised','Transfers','Other',''].includes(t.category||'')||t.categoryMeta?.confidence==='suggested');
L.categoryCandidates=(days=30)=>{const now=Date.now(),cutoff=now-Number(days)*86400000;return (L.state.txs||[]).filter(t=>L.needsCategory(t)&&new Date(t.date).getTime()>=cutoff&&new Date(t.date).getTime()<=now);};
const addTx=L.addTx;
L.addTx=data=>{
 const d=L.state.paymentDraft;
 if(data.type==='out'&&d&&d.method!=='box'&&data.draftId===d.id){const p=L.predictCategory(d),automatic=['confirmed','high'].includes(p.confidence);data={...data,category:automatic?p.category:'Uncategorised',budgetSource:L.paymentSourceInfo?.(d)||undefined,categoryRecipientKey:L.categoryRecipientKey(d),...(d.categoryHelpDismissedKey===L.categoryRecipientKey(d)?{categoryPromptDismissed:true}:{}),categoryMeta:{...p,suggestion:automatic?'':p.category,category:automatic?p.category:'',version:1}};}
 return addTx(data);
};
L.assignCategory=(id,category)=>{
 const t=get(id);if(!canEdit()||!eligible(t)||!categories.includes(category))return false;
 t.category=category;t.categoryMeta={category,source:'customer',confidence:'confirmed',version:1,revision:L.id('category'),updatedAt:new Date().toISOString()};L.save();return true;
};
L.openCategory=(id='',draft=false)=>{
 if(draft)L.savePaymentFields?.();
 L.go('categoryEdit',{id,draft});
};
L.chooseCategory=(category,scope='once')=>{
 if(!canEdit()||!categories.includes(category))return;
 if(L.params.draft){const d=L.state.paymentDraft;if(!d||d.submittedTxId)return;d.categoryChoice=category;d.categoryChoiceKey=L.categoryRecipientKey(d);L.save();}
 else if(!L.assignCategory(L.params.id,category))return;
 if(scope==='future')return L.chooseCategoryScope('future');
 // The answer is the category tap. Remembering a recipient is a separate,
 // optional action after returning, never a second required confirmation.
 L.back();L.toast(category+' saved. Just this payment.');return true;
};
L.chooseCategoryScope=scope=>{
 if(!canEdit()||!['once','future'].includes(scope))return false;
 const draft=!!L.params.draft,t=draft?L.state.paymentDraft:get(L.params.id),key=L.categoryRecipientKey(t);
 const category=draft&&t?.categoryChoiceKey===key?t.categoryChoice:!draft&&t?.categoryMeta?.source==='customer'?t.category:'';
 if(!t||draft&&t.submittedTxId||!draft&&!eligible(t)||!categories.includes(category))return false;
 if(scope==='future'){
  if(!key)return false;
  L.rememberCategory(L.params.id||'',draft);
 }
 L.back();return true;
};
L.resolveCategoryConflict=category=>{
 const d=L.state.paymentDraft;if(!canEdit()||!d||d.submittedTxId||!['send','bill'].includes(L.route))return false;
 const p=L.predictCategory(d);if(p.source!=='rule-conflict'||![p.category,p.usualCategory].includes(category))return false;
 d.categoryChoice=category;d.categoryChoiceKey=L.categoryRecipientKey(d);L.save();L.refreshCategoryEntry();
 document.getElementById('entry-category')?.querySelector('button')?.focus?.({preventScroll:true});
 L.toast(category+' for this payment. Your usual category stays the same.');return true;
};
L.rememberCategory=(id='',draft=false)=>{
 const t=draft?L.state.paymentDraft:get(id),key=L.categoryRecipientKey(t),category=draft?t?.categoryChoice:t?.category;
 if(!canEdit()||!key||!categories.includes(category)||(!draft&&!eligible(t)))return;
 const rules=metadata(),i=rules.findIndex(r=>r.key===key),rule={key,category,name:t.name,updatedAt:new Date().toISOString()};if(i>=0)rules[i]=rule;else rules.push(rule);L.save();L.render();L.toast('Remembered for this recipient. You can change it any time.');
};
L.forgetCategoryRule=(id='',draft=false)=>{if(!canEdit())return;const key=L.categoryRecipientKey(draft?L.state.paymentDraft:get(id));L.state.categoryRules=metadata().filter(r=>r.key!==key);L.save();L.render();L.toast('Recipient rule removed.');};
const chip=(category,action,selected=false)=>B(E(category),action,'chip category-chip'+(selected?' selected':'' )).replace('<button ',`<button aria-pressed="${selected}" `);
const choices=(selected,action)=>`<div class="category-options" role="group" aria-label="Choose spending category">${categories.map(c=>chip(c,action(c),c===selected)).join('')}</div>`;
L.views.categoryEdit=()=>{
 const d=L.params.draft,t=d?L.state.paymentDraft:get(L.params.id);
 if(!t||d&&t.submittedTxId||!d&&!eligible(t))return L.header('Category unavailable','Only completed outgoing payments can be updated here.')+B('Back','L.back()');
 const key=L.categoryRecipientKey(t),chosen=d?(t.categoryChoiceKey===key?t.categoryChoice:''):t.category,confirmed=d?!!chosen:t.categoryMeta?.source==='customer',p=d?L.predictCategory(t):t.categoryMeta||{},rule=matchingRule(t);
 return `<section class="category-edit">${L.header(d?'What’s it for?':'What was it for?','Tap a category to save just this payment.')}<p class="category-context">${Number(t.amount)>0?`<strong>${M(t.amount)}</strong> to `:'To '}${E(t.name||'your recipient')}</p>${p.source==='rule-conflict'?`<p class="category-suggestion">Usually ${E(p.usualCategory)}. Your note suggests ${E(p.suggestion||p.category)}.</p>`:p.confidence==='suggested'&&(p.suggestion||p.category)?`<p class="category-suggestion">Suggested: ${E(p.suggestion||p.category)} · please check</p>`:''}${choices(chosen,c=>`L.chooseCategory(${Q(c)})`)}${confirmed?`<p class="category-saved" role="status">${E(chosen)} saved for this payment.</p>`:''}${rule?`<div class="category-memory"><p>Usual category: ${E(rule.category)}</p>${B('Stop remembering',`L.forgetCategoryRule(${Q(L.params.id||'')},${!!d})`,'text-btn')}</div>`:''}<p class="small muted">Your balance and plan stay unchanged.</p>${confirmed?`<div class="actions category-scope" aria-label="Remember category">${B('Done',"L.chooseCategoryScope('once')")}${key?B('Future payments too',"L.chooseCategoryScope('future')",'secondary'):''}</div><p class="tiny muted">Past payments stay as they are.</p>`:B('Not now','L.back()','secondary')}</section>`;
};
let promptedAccount=null,promptedId='';
L.receiptCategory=id=>{
 const t=get(id);if(!eligible(t))return '';
 if(promptedAccount!==L.state){promptedAccount=L.state;promptedId='';}
 if(!promptedId&&L.needsCategory(t)&&!t.categoryPromptDismissed)promptedId=id;
 const open=L.needsCategory(t)&&!t.categoryPromptDismissed&&promptedId===id,p=t.categoryMeta;
 if(!open)return `<div class="receipt-category"><span>${E(t.category||'Uncategorised')}${p?.source==='rule'||p?.source==='customer'&&matchingRule(t)?.category===t.category?' · remembered':p?.source==='customer'?' · this payment':p?.source==='budget-source'?' · budget choice':p?.source==='merchant'||p?.source==='biller'?' · recognised':''}</span>${B(L.needsCategory(t)?'Add category':'Change',`L.openCategory(${Q(id)})`,'text-btn')}</div>${p?.source==='customer'&&L.categoryRecipientKey(t)&&matchingRule(t)?.category!==t.category?B('Future payments too',`L.rememberCategory(${Q(id)})`,'text-btn'):''}`;
 const conflict=p?.source==='rule-conflict',suggestions=conflict?[p.suggestion,p.usualCategory]:[...new Set([p?.suggestion,...L.categoryHelpOptions(t)].filter(c=>c&&c!=='Other'))].slice(0,2).concat('Other');
 return `<section class="category-nudge" aria-label="Optional payment category"><div><strong>${conflict?`Usually ${E(p.usualCategory)}. Different this time?`:'What was this for?'}</strong><small>${conflict?'Your note suggests '+E(p.suggestion)+'.':'Optional · helps your money story'}</small></div><div class="category-quick">${suggestions.map(c=>B((conflict?(c===p.usualCategory?'Keep ':'Use '):'')+E(c),`L.quickCategory(${Q(id)},${Q(c)})`,'chip category-chip')).join('')}${B('Something else',`L.openCategory(${Q(id)})`,'chip category-chip')}</div>${B('Not now',`L.dismissCategory(${Q(id)})`,'text-btn')}</section>`;
};
L.quickCategory=(id,category)=>{if(L.assignCategory(id,category)){L.render();L.toast(category+' saved.');}};
L.dismissCategory=id=>{const t=get(id);if(!t)return;t.categoryPromptDismissed=true;L.save();L.render();};
for(const route of ['paymentResult','txDetail']){const view=L.views[route];L.views[route]=()=>{
 const html=view(),id=L.params.id||L.state.paymentDraft?.submittedTxId,t=get(id);if(!eligible(t))return html;
 const ui=route==='paymentResult'?L.receiptCategory(id):`<div class="receipt-category"><span>${E(t.category||'Uncategorised')}</span>${B('Change category',`L.openCategory(${Q(id)})`,'text-btn')}</div>`;
 if(route==='txDetail')return html.replace(/<details class="card"><summary>Correct spending category<\/summary>[\s\S]*?<\/details>/,'').replace('<div class="receipt">',ui+'<div class="receipt">');
 return html.replace('<div class="actions result-actions">',ui+'<div class="actions result-actions">');
};}
const shelf=days=>{const txs=L.categoryCandidates(days);if(!txs.length)return '';const total=txs.reduce((n,t)=>n+Number(t.amount)+Number(t.fee||0),0);return `<details class="category-shelf"><summary><span><strong>${M(total)} needs a category</strong><small>${txs.length} payment${txs.length===1?'':'s'} · included in money out</small></span>${L.icon('chevron',18)}</summary><p>A little context makes your money story clearer.</p>${B('Sort '+Math.min(3,txs.length)+' payment'+(txs.length===1?'':'s'),`L.go('categorySort',{days:${Number(days)}})`,'secondary')}</details>`;};
L.categoryShelf=shelf;
for(const route of ['homeMoneyStory','story']){const view=L.views[route];L.views[route]=()=>{const html=view(),ui=shelf([7,30,90].includes(Number(L.params.days))?Number(L.params.days):route==='homeMoneyStory'?7:30);return html.replace('<div class="actions">',ui+'<div class="actions">');};}
// The Home story stays one focus item: sorting is inside its expandable detail.
L.views.categorySort=()=>{
 const days=[7,30,90].includes(Number(L.params.days))?Number(L.params.days):30;
 if(!Array.isArray(L.params.queue))L.params.queue=L.categoryCandidates(days).slice(0,3).map(t=>t.id);
 const queue=L.params.queue;let at=Math.max(0,Number.isSafeInteger(Number(L.params.at))?Number(L.params.at):0);
 while(at<queue.length&&!eligible(get(queue[at])))at++;
 L.params.at=at;const t=get(queue[at]);
 if(!t||at>=queue.length){
  const changed=Number(L.params.categoryChoicesMade)>0;
  return `<section class="category-sort">${L.header(changed?'A little clearer.':queue.length?'Finished for now.':'Nothing to sort right now.',changed?'Your choices are saved. Skipped payments can be sorted later.':queue.length?'No category changes were made. You can sort payments later.':'No completed payments need a category right now.')}${changed?`<div class="category-complete">${L.icon('check',30)}</div>`:''}${B('Done','L.back()')}</section>`;
 }
 return `<section class="category-sort">${L.header('What was it for?',`${at+1} of ${queue.length} · always optional`)}<div class="category-sort-payment"><strong>${M(t.amount)}</strong><h2>${E(t.name)}</h2><p class="small muted">${E(new Date(t.date).toLocaleDateString('en-GB'))}</p></div>${choices('',c=>`L.sortCategory(${Q(c)})`)}${B('Skip this payment',"L.sortCategory('')",'text-btn')}${B('Close','L.back()','secondary')}</section>`;
};
L.sortCategory=category=>{const id=L.params.queue?.[Number(L.params.at)||0];if(category&&!L.assignCategory(id,category))return;if(category)L.params.categoryChoicesMade=(Number(L.params.categoryChoicesMade)||0)+1;L.params.at=(Number(L.params.at)||0)+1;L.render();};
// Receipt and historical category controls now use one confirmed mutation path.
L.setCategory=id=>{if(L.assignCategory(id,L.value('category')))L.go('story',{days:L.params.days||30});};
L.correctCategory=id=>{if(L.assignCategory(id,L.value('tx-category')))L.go('txDetail',{id});};
// These are choices, not predictions. Prefer context the student has actually
// supplied; amount, time of day and an arbitrary recipient name are not evidence.
L.categoryHelpOptions=d=>{
 const key=L.categoryRecipientKey(d),counts=new Map();
 const recent=(L.state.txs||[]).filter(t=>eligible(t)&&t.categoryMeta?.source==='customer'&&L.categoryRecipientKey(t)===key&&key)
  .sort((a,b)=>new Date(b.date)-new Date(a.date));
 for(const t of recent)if(categories.includes(t.category)&&t.category!=='Other')counts.set(t.category,(counts.get(t.category)||0)+1);
 const ranked=[...counts].sort((a,b)=>b[1]-a[1]).map(([c])=>c);
 const plan=(L.state.essentials||[]).map(x=>x.name||'').join(' ');
 for(const [c,re]of words)if(re.test(plan)&&!ranked.includes(c))ranked.push(c);
 return [...ranked.slice(0,2),'Other'];
};
// The daily story uses its exact displayed calendar window, rather than a
// rolling category queue that could silently include another day's payments.
let dailyAccount=null,dailyReturn=null;
const dailyDone=new Set();
const dailyScope=s=>s?.valid===true?`${s.period}:${s.start}:${s.period==='range'?s.end:''}`:'';
const checkDailyAccount=()=>{if(dailyAccount!==L.state){dailyAccount=L.state;dailyDone.clear();dailyReturn=null;}};
const dailyEligible=t=>L.needsCategory(t)&&!t.internal&&!t.internalTransfer&&!t.boxId&&t.type!=='internal'&&t.method!=='Money Box transfer'&&!t.originalId&&!t.refunded&&!t.refundId;
const dailyCandidate=s=>(s?.txs||[]).find(t=>dailyEligible(t)&&get(t.id)===t);
const currentDailySummary=()=>{
 if(L.route!=='dailyMoneyStory'||typeof L.dailySpendingSummary!=='function')return null;
 const range=Number.isFinite(Number(L.params.start))&&Number.isFinite(Number(L.params.end));
 return L.dailySpendingSummary(range?{period:'range',start:Number(L.params.start),end:Number(L.params.end)}:{period:['today','yesterday','thisWeek','lastWeek'].includes(L.params.period)?L.params.period:'today'});
};
const dailyControl=id=>{
 checkDailyAccount();if(!canEdit())return null;
 const summary=currentDailySummary(),scope=dailyScope(summary),t=dailyCandidate(summary);
 return scope&&!dailyDone.has(scope)&&t?.id===id?{summary,scope,t}:null;
};
const finishDailyPrompt=(scope,message)=>{
 dailyDone.add(scope);if(dailyDone.size>32)dailyDone.delete(dailyDone.values().next().value);
 const root=document.getElementById('view'),scroll=root?.scrollTop||0;
 L.render();const current=document.getElementById('view');if(current)current.scrollTop=scroll;
 current?.querySelector('.daily-story-details summary')?.focus?.({preventScroll:true});
 if(message)L.toast(message);
};
L.dailyStoryCategoryPrompt=summary=>{
 checkDailyAccount();const scope=dailyScope(summary),t=dailyCandidate(summary);
 if(!canEdit()||!scope||dailyDone.has(scope)||!t)return '';
 const suggestions=[...new Set([t.categoryMeta?.suggestion,...L.categoryHelpOptions(t)].filter(c=>categories.includes(c)&&c!=='Other'))].slice(0,2);
 return `<section class="category-nudge" data-daily-category-prompt data-tx-id="${E(t.id)}" aria-label="Optional category for this payment"><div><strong>What was this payment for?</strong><small>${M(Number(t.amount)+Number(t.fee||0))} to ${E(t.name||'your recipient')}${Number(t.fee)>0?' · includes fee':''} · Optional</small></div><div class="category-quick">${suggestions.map(c=>B(E(c),`L.quickDailyStoryCategory(${Q(t.id)},${Q(c)})`,'chip category-chip')).join('')}${B('Something else',`L.openDailyStoryCategory(${Q(t.id)})`,'chip category-chip')}</div>${B('Not now',`L.dismissDailyStoryCategory(${Q(t.id)})`,'text-btn')}</section>`;
};
L.quickDailyStoryCategory=(id,category)=>{
 const selected=dailyControl(id);if(!selected||!categories.includes(category)||!L.assignCategory(id,category))return false;
 finishDailyPrompt(selected.scope,category+' saved for this payment.');return true;
};
L.dismissDailyStoryCategory=id=>{const selected=dailyControl(id);if(!selected)return false;finishDailyPrompt(selected.scope);return true;};
L.openDailyStoryCategory=id=>{
 const selected=dailyControl(id);if(!selected)return false;
 dailyReturn={account:L.state,scope:selected.scope,id,scroll:document.getElementById('view')?.scrollTop||0};
 L.openCategory(id);return true;
};
const dailyRender=L.render;
L.render=function(...args){
 checkDailyAccount();const returning=L.route==='dailyMoneyStory'&&dailyReturn?.account===L.state&&dailyReturn.scope===dailyScope(currentDailySummary())?dailyReturn:null;
 if(returning&&!dailyEligible(get(returning.id)))dailyDone.add(returning.scope);
 const result=dailyRender.apply(this,args);
 if(returning){const root=document.getElementById('view');if(root)root.scrollTop=returning.scroll;root?.querySelector('[data-daily-category-prompt] button,.daily-story-details summary')?.focus?.({preventScroll:true});dailyReturn=null;}
 else if(dailyReturn&&!['categoryEdit','help','dailyMoneyStory'].includes(L.route))dailyReturn=null;
 return result;
};
L.chooseDraftCategory=(category,expected)=>{
 const d=L.state.paymentDraft;
 if(!canEdit()||!d||d.submittedTxId||!['send','bill'].includes(L.route)||!categories.includes(category))return false;
 if(expected&&JSON.stringify([d.id,L.categoryRecipientKey(d)])!==JSON.stringify(expected))return false;
 d.categoryChoice=category;d.categoryChoiceKey=L.categoryRecipientKey(d);delete d.categoryHelpDismissedKey;L.save();L.refreshCategoryEntry();
 document.getElementById('entry-category')?.querySelector('button')?.focus?.({preventScroll:true});
 L.toast(category+' saved for this payment.');return true;
};
L.dismissDraftCategory=()=>{
 const d=L.state.paymentDraft;if(!canEdit()||!d||d.submittedTxId||!['send','bill'].includes(L.route))return false;
 d.categoryHelpDismissedKey=L.categoryRecipientKey(d);L.save();L.refreshCategoryEntry();
 document.getElementById('entry-category')?.querySelector('button')?.focus?.({preventScroll:true});return true;
};
// Draft category is an editable hint. It never fills payment-essential.
const entryCategoryBody=()=>{
 const d=L.state.paymentDraft,p=L.predictCategory(d),expected=Q([d?.id,L.categoryRecipientKey(d)]);
 if(p.source==='rule-conflict')return `<div class="category-conflict" role="status"><p>Usually ${E(p.usualCategory)}. ${p.category==='Gifts'?'A gift':E(p.category)} this time?</p><div class="category-quick">${B('Use '+E(p.category),`L.resolveCategoryConflict(${Q(p.category)})`,'chip category-chip')}${B('Keep '+E(p.usualCategory),`L.resolveCategoryConflict(${Q(p.usualCategory)})`,'chip category-chip')}</div><small>Optional · just this payment</small></div>`;
 if(['confirmed','high'].includes(p.confidence))return `<span class="entry-category-known">${p.source==='budget-source'?'Category:':'For:'} <strong>${E(p.category)}</strong>${p.source==='rule'?' · remembered':''}</span>${B('Change',"L.openCategory('',true)",'text-btn')}`;
 if(d?.categoryHelpDismissedKey===L.categoryRecipientKey(d))return `${B('Category (optional)',"L.openCategory('',true)",'text-btn')}`;
 const suggestions=p.category?[p.category]:L.categoryHelpOptions(d);
 return `<div class="entry-category-help"><div class="category-help-heading"><span>${p.category?'For '+E(p.category)+'?':'What’s this for?'}</span><small>Optional</small></div><div class="category-quick">${suggestions.map(c=>B((p.category?'Use ':'')+E(c),`L.chooseDraftCategory(${Q(c)},${expected})`,'chip category-chip')).join('')}${B('Change',"L.openCategory('',true)",'text-btn')}${B('Not now','L.dismissDraftCategory()','text-btn')}</div></div>`;
};
L.refreshCategoryEntry=()=>{const row=document.getElementById('entry-category');if(row)row.innerHTML=entryCategoryBody();};
for(const route of ['send','bill']){const view=L.views[route];L.views[route]=()=>{let html=view();if(!html.includes('data-payment-entry'))return html;const d=L.state.paymentDraft;if(d?.method==='box')return html;if(!d?.bill&&(!d?.name||['momo','bank'].includes(d.method)&&(!d.checked||!d.destination)))return html;const ui=`<div class="entry-category" id="entry-category">${entryCategoryBody()}</div>`;return html.includes('payment-plan-link')?html.replace(/(<div class="payment-plan-link">[\s\S]*?<\/p><\/div>)/,'$1'+ui):html.replace('<div id="error"',ui+'<div id="error"');};}
document.addEventListener('input',event=>{if(event.target?.id==='payment-note'&&['send','bill'].includes(L.route))L.refreshCategoryEntry();});
document.addEventListener('change',event=>{if(event.target?.id==='payment-essential'&&['send','bill','paymentPlanLink'].includes(L.route)&&document.getElementById('payment-essential')===event.target)L.refreshCategoryEntry();});
const entry=L.entryConsequence;
L.entryConsequence=impact=>{const html=entry(impact),d=L.state.paymentDraft;if(d&&!d.essentialId)return html.replace('If you pay this','If this is extra spending');return html;};
// Chat proposes a specific metadata change, then requires a tap to confirm it.
const chatAnswer=L.chatAnswer,chatOpen=L.chatOpenAnswer;
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const categoryState=t=>({hasCategory:Object.prototype.hasOwnProperty.call(t,'category'),category:t.category,hasMeta:Object.prototype.hasOwnProperty.call(t,'categoryMeta'),meta:copy(t.categoryMeta)});
const categorySignature=t=>JSON.stringify(categoryState(t));
const paymentIdentity=t=>JSON.stringify([t.id,t.date,t.name,t.amount,t.fee,t.type,t.status,L.categoryRecipientKey(t)]);
const updateCategoryReply=(index,reply)=>{
 const composer=document.getElementById('chatText'),unsent=composer?.value||'';
 L.captureFormDraft?.();L.save();L.render();
 const input=document.getElementById('chatText');if(input)input.value=unsent;L.captureFormDraft?.();
 const action=[...document.getElementById('view')?.querySelectorAll('button')||[]].find(b=>b.getAttribute('onclick')===`L.chatOpenAnswer(${index})`);action?.focus?.({preventScroll:true});
 L.announceChat?.(reply.text);
};
L.chatAnswer=(question,options={})=>{
 const raw=String(question||''),intent=/\b(was|were|tag|categoris[eza]|categorize|put that|put the|mark)\b/i.test(raw),matches=words.filter(([,re])=>re.test(raw));
 if(intent&&matches.length===1){
 const amount=raw.match(/(?:GH\s*[₵¢]|GHS|₵)\s*(\d+(?:\.\d{1,2})?)/i),n=amount?Number(amount[1]):null;
 const txs=(L.state.txs||[]).filter(t=>eligible(t)&&(n===null||Math.abs(Number(t.amount)-n)<.001)),recipient=raw.match(/\bto\s+(.+?)\s+(?:was|were|as|under)\b/i)?.[1],named=txs.filter(t=>norm(t.name).split(' ').some(part=>part.length>2&&norm(recipient||raw).includes(part))),selected=recipient?named:named.length?named:amount?txs:[];
 const category=matches[0][0];
 if(selected.length===1){const t=selected[0];return {text:`Put ${M(t.amount)} to ${t.name} under ${category}?`,action:'Use '+category,route:'categoryEdit',params:{id:t.id,proposed:category},intent:'category-correction',categoryTxIds:[t.id],categoryProposed:category,categoryProposalSignature:categorySignature(t),categoryPaymentIdentity:paymentIdentity(t),context:{days:30,category:''}};}
 if(selected.length>1)return {text:`I found ${selected.length} matching payments. Choose which one was for ${category.toLowerCase()}.`,action:'Choose payment',route:'categoryMatch',intent:'category-correction',categoryTxIds:selected.map(t=>t.id),categoryProposed:category,context:{days:30,category:''}};
 return {text:'Which completed payment do you mean? Include the amount in GH₵ and the recipient’s name.',intent:'category-correction',context:{days:30,category:''}};
 }
 const reply=chatAnswer(question,options);
 if(reply.intent==='spending'){const unknown=L.categoryCandidates(reply.context?.days||30);if(unknown.length){reply.text=reply.text.replace(/Uncategorised was the biggest category at GH₵[\d,.]+\./,'Some payments still need a category.');reply.text+=` ${M(unknown.reduce((n,t)=>n+Number(t.amount)+Number(t.fee||0),0))} still needs a category; it is included in money out.`;}}
 return reply;
};
L.chatOpenAnswer=(index,secondary=false)=>{
 const reply=L.state.chats?.[index];if(reply?.intent!=='category-correction')return chatOpen(index,secondary);
 if(L.route!=='chat'||!canEdit())return false;
 if(secondary)return L.undoChatCategory(index);
 if(reply.categoryTxIds?.length!==1)return L.go('categoryMatch',{ids:reply.categoryTxIds,proposed:reply.categoryProposed});
 const t=get(reply.categoryTxIds[0]);
 if(!eligible(t)){reply.text='This payment is no longer available for a category change.';delete reply.action;delete reply.secondaryAction;delete reply.categoryUndo;updateCategoryReply(index,reply);return false;}
 if(['applied','stale'].includes(reply.categoryStage))return L.go('categoryEdit',{id:t.id});
 if(!categories.includes(reply.categoryProposed))return false;
 // Saved v9 messages promised a review sheet, not a direct metadata change.
 if(!reply.categoryProposalSignature||!reply.categoryPaymentIdentity)return L.go('categoryEdit',{id:t.id,proposed:reply.categoryProposed});
 if(reply.categoryProposalSignature&&reply.categoryProposalSignature!==categorySignature(t)||reply.categoryPaymentIdentity&&reply.categoryPaymentIdentity!==paymentIdentity(t)){
  reply.text='This payment has changed. Check its category before updating it.';reply.action='Change category';reply.categoryStage='stale';delete reply.secondaryAction;updateCategoryReply(index,reply);return false;
 }
 const previous=categoryState(t);
 if(!L.assignCategory(t.id,reply.categoryProposed))return false;
 reply.categoryUndo={previous,applied:categorySignature(t),identity:paymentIdentity(t),txId:t.id};
 reply.categoryStage='applied';reply.text=`${reply.categoryProposed} saved for the ${M(t.amount)} payment to ${t.name}. Just this payment.`;reply.action='Change category';reply.secondaryAction='Undo';
 updateCategoryReply(index,reply);return true;
};
L.undoChatCategory=index=>{
 const reply=L.state.chats?.[index],undo=reply?.categoryUndo,t=get(undo?.txId);
 if(L.route!=='chat'||!canEdit()||!undo)return false;
 if(!eligible(t)||undo.identity!==paymentIdentity(t)||undo.applied!==categorySignature(t)){
  delete reply.categoryUndo;delete reply.secondaryAction;reply.categoryStage='stale';reply.text='This payment changed again. Your latest category has been kept.';reply.action=eligible(t)?'Change category':'';updateCategoryReply(index,reply);return false;
 }
 if(undo.previous.hasCategory)t.category=undo.previous.category;else delete t.category;
 if(undo.previous.hasMeta)t.categoryMeta=copy(undo.previous.meta);else delete t.categoryMeta;
 reply.categoryStage='undone';reply.text='Category change undone.';reply.action='Use '+reply.categoryProposed;delete reply.secondaryAction;delete reply.categoryUndo;reply.categoryProposalSignature=categorySignature(t);reply.categoryPaymentIdentity=paymentIdentity(t);
 updateCategoryReply(index,reply);return true;
};
L.views.categoryMatch=()=>{
 const txs=(Array.isArray(L.params.ids)?L.params.ids:[]).map(get).filter(eligible);
 if(!txs.length)return L.header('Those payments are no longer available.','Go back and choose another completed payment.')+B('Go back','L.back()','secondary');
 return L.header('Which payment?','Choose one. Nothing changes until you confirm a category.')+`<div class="list">${txs.map(t=>L.row(t.name,new Date(t.date).toLocaleDateString('en-GB'),'receipt',`L.go('categoryEdit',{id:${Q(t.id)},proposed:${Q(L.params.proposed)}})`,M(t.amount))).join('')}</div>`+B('Not now','L.back()','secondary');
};
const edit=L.views.categoryEdit;
L.views.categoryEdit=()=>{const html=edit(),c=L.params.proposed;if(!categories.includes(c)||get(L.params.id)?.categoryMeta?.source==='customer'&&get(L.params.id)?.category===c)return html;return html.replace('<div class="category-options"',`<div class="category-chat-proposal">${B('Use '+E(c),`L.chooseCategory(${Q(c)})`,'primary')}</div><div class="category-options"`);};
})();
