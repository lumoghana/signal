/* Seven shared student Budget categories. Saved legacy costs keep their IDs,
   names and payment coverage; the category is a separate planning attribute. */
(()=>{
'use strict';
if(!window.L||L.budgetCategories)return;
const E=L.e,B=L.btn,normal=x=>String(x||'').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const list=[
 {id:'food',name:'Food',category:'Food',aliases:['food','groceries','lunch','dinner','breakfast','meal','meals','waakye','jollof','gɔbɛ','gobe','beans','gari']},
 {id:'transport',name:'Transport',category:'Transport',aliases:['transport','trotro','taxi','bus','ride','rides','fare','fares','bolt','uber']},
 {id:'data-airtime',name:'Data & airtime',category:'Data',aliases:['data','airtime','phone','internet','wifi','broadband','mobile credit']},
 {id:'study-fees',name:'Study & fees',category:'Study',aliases:['study','fees','tuition','books','book','printing','print','photocopy','stationery','academic','learning']},
 {id:'housing-bills',name:'Housing & bills',category:'Bills',aliases:['housing','rent','hostel','accommodation','bills','bill','electricity','utilities','utility','water']},
 {id:'personal-social',name:'Personal & social',category:'Shopping',aliases:['personal','social','shopping','clothing','clothes','shirt','sneakers','toiletries','hair','haircut','entertainment','gifts','gift','birthday','subscriptions','subscription','fun']},
 {id:'other',name:'Other',category:'Other',aliases:['other','miscellaneous','misc','repayment','payback','medical','health','emergency','buffer']}
];
const byId=id=>list.find(x=>x.id===id);
const active=x=>x&&!x.archived&&!x.deleted;
const categoryWords=c=>c.aliases.some(alias=>(' '+normal(c._value)+' ').includes(' '+normal(alias)+' '));
function resolve(value){
 if(value&&typeof value==='object'){
  const fixed=byId(value.budgetCategory);if(fixed)return fixed;
  value=value.name||value.category||value.id||'';
 }
 const n=normal(value);if(!n)return null;
 const exact=list.find(x=>normal(x.id)===n||normal(x.name)===n||x.aliases.some(a=>normal(a)===n));if(exact)return exact;
 const matches=list.filter(x=>categoryWords({...x,_value:n}));return matches.length===1?matches[0]:null;
}
const total=items=>Math.round((items||[]).filter(active).reduce((sum,x)=>sum+Math.max(0,Number(x.amount)||0),0)*100)/100;
function group(items){
 const groups=new Map();
 for(const item of items||[]){if(!active(item)||!(Number(item.amount)>0))continue;const c=resolve(item)||byId('other');if(!groups.has(c.id))groups.set(c.id,{id:c.id,name:c.name,category:c.category,items:[],total:0});const g=groups.get(c.id);g.items.push(item);g.total=Math.round((g.total+Number(item.amount))*100)/100;}
 return list.map(c=>groups.get(c.id)).filter(Boolean);
}
function prepare(name,{items=[],editingId=''}={}){
 const current=items.find(x=>x.id===editingId&&active(x)),category=resolve(name)||current&&resolve(current);
 if(!category)return {ok:false,error:'Choose one of the seven student Budget categories.',category:null};
 const existing=items.find(x=>active(x)&&x.id!==editingId&&(resolve(x)||byId('other')).id===category.id);
 // Existing legacy duplicates remain editable. No new duplicate line is added.
 if(existing&&(!current||(resolve(current)||byId('other')).id!==category.id))return {ok:false,error:category.name+' is already in your Budget. Edit that line to change its total.',existing,category};
 const prior=current&&(resolve(current)||byId('other'));
 return {ok:true,category,name:current&&normal(current.name)!==normal(prior.name)?current.name:category.name,existing:current||null};
}
function validate(items,baseline=L.state.essentials||[]){
 const old=new Set(baseline.map(x=>x.id)),seen=new Map();
 for(const row of (items||[]).filter(active)){
  const c=resolve(row)||old.has(row.id)&&byId('other');
  if(!c)return {ok:false,error:'Choose a student category for every Budget item.'};
  const represented=seen.get(c.id);
  const previous=baseline.find(x=>x.id===row.id),previousOther=represented&&baseline.find(x=>x.id===represented.id);
  const retained=previous&&previousOther&&(resolve(previous)||byId('other')).id===c.id&&(resolve(previousOther)||byId('other')).id===c.id;
  if(represented&&!retained&&!row.namedObligation&&!represented.namedObligation)return {ok:false,error:c.name+' already has a Budget line. Keep one total for that category.'};
  if(row.namedObligation&&(items||[]).some(x=>x!==row&&active(x)&&resolve(x)?.id===c.id&&normal(x.name)===normal(row.name)))return {ok:false,error:'Give each named cost in '+c.name+' a different name.'};
  if(!row.namedObligation||!represented)seen.set(c.id,row);
 }
 return {ok:true};
}
function setCategory(row,value){const c=resolve(value)||resolve(row);if(!row||!c)return false;row.budgetCategory=c.id;return true;}
function normalise(items,baseline=L.state.essentials||[]){
 const old=new Set(baseline.map(x=>x.id));
 for(const row of items||[]){const c=resolve(row)||byId('other');row.budgetCategory=c.id;if(!old.has(row.id)&&!row.namedObligation)row.name=c.name;}
 return items;
}
function select(id,value,items=[],editingId='',change=''){
 const selected=resolve(value),current=items.find(x=>x.id===editingId),used=new Set(items.filter(x=>active(x)&&x.id!==editingId).map(x=>(resolve(x)||byId('other')).id));
 return `<label class="field budget-category-field" for="${id}"><span>Budget category</span><select class="input" id="${id}"${change?` onchange="${change}"`:''}><option value="">Choose a category</option>${list.map(c=>`<option value="${E(c.name)}"${selected?.id===c.id?' selected':''}${used.has(c.id)&&selected?.id!==c.id&&!current?' disabled':''}>${E(c.name)}${used.has(c.id)&&selected?.id!==c.id&&!current?' · already added':''}</option>`).join('')}</select></label>`;
}
L.budgetCategories={list,resolve,group,total,prepare,validate,setCategory,normalise,select};

const costView=L.views.firstEssentials;
L.views.firstEssentials=function(...args){
 let html=costView.apply(this,args),d=L.state.planDraft;if(!d)return html;
 html=html.replace(/<div class="first-cost-suggestions"[\s\S]*?<\/div>/,'');
 html=html.replace(/<label\b[^>]*for="firstEssName"[^>]*>[\s\S]*?<\/label>/,select('firstEssName',d.essentialFields?.name||'',d.essentials,d.editingEssentialId||'','L.capturePlanDraft()'));
 return html.replace('Add another cost','Add another budget item');
};
const editView=L.views.essentialEdit;
L.views.essentialEdit=function(...args){
 const html=editView.apply(this,args),x=(L.state.essentials||[]).find(x=>x.id===L.params.id);
 const obligation=x?.namedObligation||!x&&byId(L.params.obligationCategory),category=resolve(x)||byId(L.params.obligationCategory);
 if(obligation&&category)return html.replace(/<label\b[^>]*for="essName"[^>]*>[\s\S]*?<\/label>/,select('essName',category.name,L.state.essentials||[],x?.id||'')+L.field('Name this cost','essObligationName','For example, hostel rent','text',x?.name||'').replace('<input ','<input maxlength="80" ')+`<p class="small muted">A separate cost inside ${E(category.name)}. Adding it increases this category’s total. Do not add an amount already included in another item.</p>`).replace('Add a budget item','Add a named cost').replace('Edit budget item','Edit named cost');
 return html.replace(/<label\b[^>]*for="essName"[^>]*>[\s\S]*?<\/label>/,select('essName',x||'',L.state.essentials||[],x?.id||'')).replace('Remove from budget','Delete item');
};
const firstAdd=L.firstPlanAddEssential,firstReview=L.reviewFirstPlanCosts;
function setValue(field,value){
 field.value=field.localName==='select'?(resolve(value)?.name||''):value;
}
function withPreparedName(action,args,id,name){
 // The old writers still read a name from L.value(). A native category select
 // must keep one of its seven real options, while a legacy item keeps its own
 // display name and payment links. Adapt that one synchronous read only.
 const value=L.value;
 L.value=function(field,...rest){return field===id?name:value.call(this,field,...rest);};
 try{return action.apply(L,args);}finally{L.value=value;}
}
function manualAction(action,args){
 if(L.route!=='firstEssentials')return action.apply(L,args);
 const d=L.state.planDraft,field=document.getElementById('firstEssName'),amount=document.getElementById('firstEssAmount');
 if(!d||!field||!String(field.value||amount?.value||'').trim())return action.apply(L,args);
 const p=prepare(field.value,{items:d.essentials,editingId:d.editingEssentialId||''});
 if(!p.ok)return L.error(p.error,'firstEssName');
 setValue(field,p.category.name);const before=new Set(d.essentials.map(x=>x.id)),rows=JSON.stringify(d.essentials),editing=d.editingEssentialId;withPreparedName(action,args,'firstEssName',p.name);
 const wrote=rows!==JSON.stringify(d.essentials)||editing&&!d.editingEssentialId;
 if(!wrote)return;
 // The original controller clears editingEssentialId on success.
 for(const row of d.essentials)if(!before.has(row.id)||row.id===p.existing?.id)row.budgetCategory=p.category.id;
 normalise(d.essentials);L.save();const focus=document.activeElement?.id;L.render();if(L.route==='firstEssentials'&&focus)document.getElementById(focus)?.focus?.({preventScroll:true});
}
L.firstPlanAddEssential=function(...args){return manualAction(firstAdd,args);};
L.reviewFirstPlanCosts=function(...args){return manualAction(firstReview,args);};
const saveItem=L.saveEssential;
L.saveEssential=function(...args){
 const items=L.state.essentials||[],field=document.getElementById('essName'),x=items.find(x=>x.id===L.params.id);
 if(L.params.id&&!x)return L.error('This Budget item is no longer available. Return to your Budget to add a new item.');
 if(!field)return saveItem.apply(this,args);
 if(x?.namedObligation||!x&&byId(L.params.obligationCategory)){
  if(!L.state.onboarded||L.state.locked||L.state.closed)return L.error('Unlock Lumo before changing your Budget.');
  const category=resolve(field.value),name=String(L.value('essObligationName')||'').trim(),when=String(L.value('essDate')||'');
  if(!category)return L.error('Choose a Budget category.','essName');
  if(!name||name.length>80)return L.error('Give this cost a name, up to 80 characters.','essObligationName');
  if(items.some(r=>active(r)&&r.id!==x?.id&&resolve(r)?.id===category.id&&normal(r.name)===normal(name)))return L.error('That name is already in this category. Edit the existing cost or choose a different name.','essObligationName');
  if(when&&(!/^\d{4}-\d{2}-\d{2}$/.test(when)||!Number.isFinite(Date.parse(when+'T00:00:00Z'))||new Date(when+'T00:00:00Z').toISOString().slice(0,10)!==when))return L.error('Choose a valid due date, or leave it empty.','essDate');
  if(!x&&items.filter(active).length>=30)return L.error('Keep up to 30 Budget items. Edit an existing cost before adding another.');
  const ids=new Set(items.map(r=>r.id)),before=JSON.stringify(items),origin=L.route;
  const result=withPreparedName(saveItem,args,'essName',name);
  if(JSON.stringify(L.state.essentials)!==before||origin==='essentialEdit'&&L.route!=='essentialEdit'){
   const saved=(L.state.essentials||[]).find(r=>x?r.id===x.id:!ids.has(r.id));if(saved){saved.namedObligation=true;saved.budgetCategory=category.id;L.save();L.render();}
  }
  return result;
 }
 const p=prepare(field.value,{items,editingId:x?.id||''});if(!p.ok)return L.error(p.error,'essName');
 const ids=new Set(items.map(x=>x.id)),before=JSON.stringify(items),origin=L.route,priorCategory=x&&(resolve(x)||byId('other')).id;setValue(field,p.category.name);
 const result=withPreparedName(saveItem,args,'essName',p.name);
 if(JSON.stringify(L.state.essentials)!==before||origin==='essentialEdit'&&L.route!=='essentialEdit'){const saved=(L.state.essentials||[]).find(row=>x?row.id===x.id:!ids.has(row.id));if(saved){saved.budgetCategory=p.category.id;if(!x)saved.name=p.category.name;if(x&&priorCategory!==p.category.id)L.state.budgetPurposeRules=(L.state.budgetPurposeRules||[]).filter(r=>r.sourceId!==saved.id);L.save();L.render();}}
 return result;
};
// A new named cost has its own form draft per category. Reuse the existing
// draft store with a scoped temporary key; never alias it to a saved cost ID.
const scopedParams=(route,params)=>route==='essentialEdit'&&!params?.id&&byId(params?.obligationCategory)?{...params,id:'new-obligation:'+params.obligationCategory}:params;
for(const method of ['captureFormDraft','restoreFormDraft']){
 const original=L[method];L[method]=function(...args){const params=L.params;L.params=scopedParams(L.route,params);try{return original?.apply(this,args);}finally{L.params=params;}};
}
const clearDraft=L.clearFormDraft;
L.clearFormDraft=function(route=L.route,params=L.params){return clearDraft?.call(this,route,scopedParams(route,params));};
const savePlan=L.saveFirstPlan;
L.saveFirstPlan=function(...args){
 const before=new Map((L.state.essentials||[]).map(x=>[x.id,(resolve(x)||byId('other')).id])),hadDraft=!!L.state.planDraft;
 if(L.route==='firstPlanReview'&&L.state.planDraft){const d=L.state.planDraft,v=validate(d.essentials);if(!v.ok)return L.error(v.error);normalise(d.essentials);}
 const result=savePlan.apply(this,args);
 if(hadDraft&&!L.state.planDraft){
  const changed=new Set((L.state.essentials||[]).filter(x=>before.has(x.id)&&before.get(x.id)!==(resolve(x)||byId('other')).id).map(x=>x.id));
  if(changed.size){L.state.budgetPurposeRules=(L.state.budgetPurposeRules||[]).filter(r=>!changed.has(r.sourceId));L.save();}
 }
 return result;
};
// Older unfinished suggestions may have separate Phone/Data or Rent/Bills
// rows. Combine their entered totals in the draft only and retain the inputs.
function standardiseDraftRows(d,key){
 if(!d||d.budgetCategoryVersion===1)return;
 const rows=d[key]||[],groups=new Map();
 d.previousCategoryInputs=JSON.parse(JSON.stringify(rows));
 for(const row of rows){
  const c=resolve(row)||byId('other'),g=groups.get(c.id)||{...row,name:c.name,budgetCategory:c.id,amount:0,include:false,previousIds:[],categoryParts:[]};
  g.categoryParts.push({...row});if(row.previousId)g.previousIds.push(row.previousId);g.previousIds.push(...(row.previousIds||[]));
  if(row.include!==false){g.include=true;const n=Number(row.amount);g.amount=typeof g.amount==='number'&&String(row.amount).trim()&&Number.isFinite(n)&&n>0?Math.round((g.amount+n)*100)/100:'';}
  groups.set(c.id,g);
 }
 d[key]=list.map(c=>groups.get(c.id)).filter(Boolean).map(g=>({...g,amount:typeof g.amount==='number'?String(g.amount):g.amount,previousIds:[...new Set(g.previousIds)],previousId:g.previousIds.length===1?g.previousIds[0]:''}));
 d.budgetCategoryVersion=1;L.save();
}
const historyView=L.views.budgetHistory;
if(historyView)L.views.budgetHistory=function(...args){standardiseDraftRows(L.state.budgetHistoryDraft,'rows');return historyView.apply(this,args);};
const cycleView=L.views.budgetCycle;
if(cycleView)L.views.budgetCycle=function(...args){standardiseDraftRows(L.state.budgetCycleDraft,'costs');return cycleView.apply(this,args);};
})();
