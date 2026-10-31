/* Guided Budget drafting. The shared planDraft is the only editable Budget.
   Conversation prepares a proposal; the existing review and Save own commitment. */
(()=>{
'use strict';
if(!window.L||L.budgetGuide)return;
const E=L.e,M=L.money,B=L.btn,DAY=86400000;
let handoff=null;
const clone=x=>JSON.parse(JSON.stringify(x));
const normal=x=>String(x||'').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const today=()=>new Date().toISOString().slice(0,10);
const dateOK=x=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(x||''))return false;const n=Date.parse(x+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===x;};
const dateLabel=x=>new Date(x+'T12:00:00Z').toLocaleDateString('en-GH',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'});
const activeCost=x=>x&&!x.archived&&!x.deleted;
const amountOK=x=>/^\d+(?:\.\d{1,2})?$/.test(String(x))&&Number(x)>0&&Number(x)<=1000000;
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const session=()=>L.state.budgetGuideSession;
const draft=()=>L.state.planDraft;
const same=()=>!!session()&&!!draft()&&session().draftId===draft().guideId;
const active=()=>allowed()&&same()&&!session().paused&&session().status!=='saved';
const quoteMark=()=>{if(!draft())return '';const p=L.firstPlanPosition();return JSON.stringify([p.available,p.essentialsBefore,p.room,p.totalGap]);};
const baseMark=()=>JSON.stringify([(L.state.essentials||[]).map(x=>[x.id,x.name,x.amount,x.date||'',x.budgetCategory||'',!!x.archived,!!x.deleted]),L.state.planHorizon||{},L.state.allowance||{},!!L.state.planSaved,L.state.accounts?.version||0]);
const stale=()=>same()&&session().baseMark!==baseMark();
function retireGuide(id){for(const r of L.state.chats||[])if(r.guideDraftId===id){for(const key of ['action','route','secondaryAction','secondaryRoute','guideChoices'])delete r[key];r.guideComplete=true;}}
const pendingBudgetPayment=()=>{const ids=new Set((L.state.essentials||[]).map(x=>x.id));return (L.state.txs||[]).find(t=>t.status==='pending'&&t.type==='out'&&ids.has(t.essentialId));};
function ensureDraft(){
 if(!draft()){L.state.planDraft={step:'firstEssentials',allowance:clone(L.state.allowance||{}),essentials:clone(L.state.essentials||[]),goals:clone(L.state.goals||[]),planHorizon:clone(L.state.planHorizon||{mode:'unspecified',date:''}),essentialFields:{name:'',amount:''}};L.capturePlanDraftBaseline?.(L.state.planDraft,{createdFromSaved:true});}
 const d=draft();d.essentials||=[];d.goals||=[];d.allowance||=clone(L.state.allowance||{});d.essentialFields||={name:'',amount:''};d.planHorizon||={mode:'unspecified',date:''};return d;
}
function summary(){
 if(!allowed()||!same())return {active:false,hasDraft:false,count:0,total:0,room:0,gap:0,period:'',status:'unavailable'};
 const d=draft(),p=L.firstPlanPosition(),count=d.essentials.filter(x=>activeCost(x)&&amountOK(x.amount)).length,h=d.planHorizon;
 return {active:active(),hasDraft:true,count,total:Math.round(d.essentials.filter(activeCost).reduce((n,x)=>n+(Number(x.amount)||0),0)*100)/100,room:p.room,gap:p.totalGap,period:h.mode==='unspecified'?'No end date yet':dateOK(h.date)?'Through '+dateLabel(h.date):'Review dates',status:pendingBudgetPayment()?'pending':stale()?'changed':session().status||'draft',pending:session().pending?clone(session().pending):null};
}
function reply(headline,support='',extra={}){
 const s=session();return {intent:'budgetGuide',headline,support,text:[headline,support].filter(Boolean).join(' '),context:{days:30,category:''},guideDraftId:s?.draftId,guideRevision:s?.revision||0,...extra};
}
function readyReply(prefix=''){
 const z=summary(),d=draft(),s=session();
 if(pendingBudgetPayment())return reply('A Budget payment is still pending.','Your draft is kept. Wait for its result before changing these saved costs.',{action:'Check pending payment',route:'budgetGuidePending'});
 if(stale())return reply('Your saved Budget changed.','Your conversation draft is kept. Open the current Budget before replacing anything.',{action:'Open current Budget',route:'budgetGuideCurrent',secondaryAction:'Restart from current Budget',secondaryRoute:'budgetGuideRestart'});
 if(s.pending){
  const p=s.pending;
  if(p.kind==='category')return reply(`Where should ${p.name} go?`,'Choose one Budget category. Your amount is kept; nothing has been saved.',{guideChoices:categoryChoices()});
  if(p.kind==='duplicate')return reply(`${p.categoryName} already has ${M(p.existingAmount)}.`,`Is ${M(p.amount)} a new total or an extra cost? I won’t count it twice.`,{guideChoices:[['Use new total','Use new total'],[`Add to total · ${M(p.existingAmount+p.amount)}`,'Add to total'],['Keep existing total','Keep existing total']]});
  if(p.kind==='combine-limit')return reply(`${p.categoryName} needs one total up to ${M(1000000)}.`,`Those costs add up to ${M(p.amount)}. Enter a smaller single total, or keep your draft unchanged.`,{guideChoices:[['Keep draft unchanged','Keep draft unchanged']]});
  if(p.kind==='combine')return reply(`One ${p.categoryName} line, or separate totals?`,`You gave more than one cost in this category. Together they are ${M(p.amount)}.`,{guideChoices:[[`Use ${M(p.amount)} total`,'Combine into one total'],['Keep draft unchanged','Keep draft unchanged']]});
  if(p.kind==='legacy-category')return reply(`Which ${p.categoryName} item should change?`,'Your earlier item names and payment links are kept. Choose the item whose total should change.',{guideChoices:p.candidates.map(x=>[x.name,'Choose budget item '+x.id])});
  if(p.kind==='relative')return reply('Which Budget item should change?','Choose one item. Your proposed change has not been saved.',{guideChoices:p.candidates.map(x=>[x.name,'Adjust draft item '+x.id])});
  if(p.kind==='confirm')return reply(`Keep ${p.name} at ${M(p.amount)}?`,'This is the total you entered in the form, not a daily amount.',{guideChoices:[['Use this total','Use this total'],['Help me estimate','Help me estimate']]});
  if(p.kind==='daily-rate')return reply(`What do you usually pay for ${p.name} each day?`,'Tell me your own daily amount. I’ll work out a total for the days you choose.');
  if(p.kind==='rate')return reply(`How many ${p.basis==='lecture'?'lecture days':'days'} should ${p.name} cover?`,`${M(p.rate)} for each day. I’ll show the multiplication before you review.`,{guideChoices:p.basis==='lecture'?[]:[['Seven days','Seven days'],['Not sure yet','Not sure yet']]});
  if(p.kind==='name')return reply(`What is the ${M(p.amount)} for?`,'For example, food, transport or data.');
  return reply(`What total should ${p.name} cover?`,'Enter the total in GH₵, or say something like “GH₵30 a day for five days”.');
 }
 if(!z.count)return reply(prefix||'What does this money need to cover?','For example, “Food 250 and transport 100 for seven days”. Your money stays in Everyday money.',{...(L.budgetHistory?.summary().eligible?{action:'Start from my spending',route:'budgetGuideHistory'}:{}),guideChoices:taxonomy()?categoryChoices():[['Food','Food'],['Transport','Transport'],['Data','Data']]});
 if(d.planHorizon.mode==='unspecified'&&!s.dateAsked)return reply(prefix||'How long should these costs cover?','Choose a period, or keep totals without an end date for now.',{guideChoices:[['Seven days','Seven days'],...(L.state.allowance?.date>today()?[['Until expected allowance','Until expected allowance']]:[]),['Not sure yet','Not sure yet']]});
 const conclusion=z.gap?`${M(z.gap)} of this draft Budget would be uncovered.`:`${M(z.room)} left after this draft Budget.`;
 return reply(prefix&&prefix!=='Kept in your draft.'?prefix+' '+conclusion:conclusion,'Check the costs and dates before saving. Nothing has moved.',{guideFinancialMark:quoteMark(),action:'Review Budget',route:'budgetGuideReview',secondaryAction:'Edit in the form',secondaryRoute:'budgetGuideForm',guideChoices:[['Add another item','Add another item']]});
}
function append(question,answer){
 const value=document.getElementById('chatText')?.value||'';(L.state.chats||=[]).push({q:question,...answer});L.params={...(answer.context||{})};L.save();L.render();const input=document.getElementById('chatText');if(input)input.value=value;L.captureFormDraft?.();L.announceChat?.(answer.text);return true;
}
function pendingFromFields(){
 const d=draft(),f=d.essentialFields||{},name=String(f.name||'').trim(),a=String(f.amount||'').trim();
 if(name&&amountOK(a))return {kind:'confirm',name,amount:Number(a),editingId:d.editingEssentialId||''};
 if(name)return {kind:'total',name,editingId:d.editingEssentialId||''};
 if(amountOK(a))return {kind:'name',amount:Number(a),editingId:d.editingEssentialId||''};
 return null;
}
function prepare(options={}){
 if(!allowed())return false;
 if(pendingBudgetPayment()){L.toast('A payment linked to your Budget is pending. Check its result before changing these costs.');return false;}
 if(L.state.budgetCycleDraft&&!draft()){L.toast('Your next-period Budget draft is kept. Continue it before starting another.');return false;}
 L.captureFormDraft?.();if(['firstEssentials','firstPlanReview','planSetup'].includes(L.route))L.capturePlanDraft?.();
 const d=ensureDraft();
 if(!same()){
  if(session()?.draftId)retireGuide(session().draftId);
  d.guideId=L.id('BG');L.state.budgetGuideSession={draftId:d.guideId,baseMark:baseMark(),revision:0,status:'draft',paused:false,dateAsked:d.planHorizon.mode!=='unspecified',pending:pendingFromFields(),mode:options.mode||'create'};
 }else{
  session().paused=false;session().mode=options.mode||session().mode;session().status='draft';
  // Only the form can have changed these uncommitted fields. Its exact edit ID
  // takes precedence over an older conversational pending amount.
  if(L.route==='firstEssentials'){const previous=session().pending,next=pendingFromFields(),f=d.essentialFields||{};session().pending=previous&&['category','duplicate','combine','combine-limit','legacy-category','relative'].includes(previous.kind)?previous:previous&&['rate','daily-rate'].includes(previous.kind)&&normal(previous.name)===normal(f.name)&&!String(f.amount||'').trim()?previous:next;session().revision++;}
 }
 if(options.mode==='estimate'&&session().pending?.kind==='confirm')session().pending={kind:'total',name:session().pending.name,editingId:session().pending.editingId};
 L.save();return true;
}
function start(options={}){
 if(!prepare(options))return false;
 if(options.silent)return true;
 const a=readyReply(),fromTask=!!L.taskSheet?.active;
 if((L.state.essentials||[]).some(x=>!x.archived&&!x.deleted)&&!session().pending)a.support='Your saved Budget is the starting point. Tell me what to change or add, then review before saving.';
 a.text=[a.headline,a.support].filter(Boolean).join(' ');
 if(fromTask){
  // The task controller queues navigation while native history is closing.
  // A second request acknowledges that settled destination after popstate.
  // This also reconciles browsers whose older core popstate listener rendered
  // the parent just before the task controller restores its final history entry.
  session().queuedIntro={question:'Build my Budget with Lumo',answer:a};
  handoff={account:L.state,draftId:session().draftId};L.save();
  L.openTab('chat');L.openTab('chat');return true;
 }
 L.openTab('chat');
 if(L.route==='chat'&&!L.taskSheet?.active)return append('Build my Budget with Lumo',a);
 session().queuedIntro={question:'Build my Budget with Lumo',answer:a};L.save();return true;
}
function pause(){if(!allowed()||!same())return false;session().paused=true;L.save();if(L.route==='chat')L.render();return true;}
function resume(){return start({mode:session()?.mode||'create'});}
function invalidateForm(){L.clearFormDraft?.('firstEssentials',{});}
const taxonomy=()=>L.budgetCategories;
const categoryChoices=()=>taxonomy()?.list.map(c=>[c.name,c.name])||[];
const categoryFor=x=>taxonomy()?.resolve(x)||null;
function keepCategoryQuestion(kind,queue,extra){
 const s=session();s.pending={kind,queue,...extra};s.revision++;
 const item=queue.items[queue.index||0];if(item)draft().essentialFields={name:item.name,amount:String(item.amount||'')};
 invalidateForm();L.save();return false;
}
// Proposals are staged as a whole. Asking about a category or an existing
// total cannot partly replace a Budget or silently drop the other typed costs.
function applyProposals(items,p={},calculation=''){
 const d=draft(),s=session(),authority=taxonomy(),queue={items:clone(items),period:clone(p),calculation};
 if(authority){
  for(let i=0;i<queue.items.length;i++){
   const x=queue.items[i],c=categoryFor(x.budgetCategory||x.name);
   if(!c)return keepCategoryQuestion('category',{...queue,index:i},{name:x.name});
   x.budgetCategory=c.id;x.categoryName=c.name;
  }
  const repeated=queue.items.find(x=>queue.items.filter(y=>y.budgetCategory===x.budgetCategory).length>1);
  if(repeated){const entries=queue.items.filter(x=>x.budgetCategory===repeated.budgetCategory),amount=Math.round(entries.reduce((n,x)=>n+Number(x.amount),0)*100)/100;return keepCategoryQuestion(amountOK(amount)?'combine':'combine-limit',queue,{categoryId:repeated.budgetCategory,categoryName:repeated.categoryName,amount});}
  for(let i=0;i<queue.items.length;i++){
   const x=queue.items[i],exact=d.essentials.find(r=>activeCost(r)&&(x.editingId?r.id===x.editingId:normal(r.name)===normal(x.name)));
   if(exact){x.editingId=exact.id;continue;}
   const matches=d.essentials.filter(r=>(categoryFor(r)?.id||'other')===x.budgetCategory&&!r.archived&&!r.deleted);
   if(matches.length>1)return keepCategoryQuestion('legacy-category',{...queue,index:i},{categoryName:x.categoryName,candidates:matches.map(r=>({id:r.id,name:r.name}))});
   if(matches.length===1){
    const existing=matches[0];
    if(normal(x.name)===normal(x.categoryName)){x.editingId=existing.id;continue;}
    return keepCategoryQuestion('duplicate',{...queue,index:i},{name:x.name,categoryName:x.categoryName,amount:Number(x.amount),existingId:existing.id,existingAmount:Number(existing.amount)});
   }
  }
 }
 applyPeriod(p);
 for(const item of queue.items){
  const n=String(item.name).trim().replace(/\s+/g,' ');if(!n||n.length>80||!amountOK(item.amount))return false;
  let x=d.essentials.find(r=>activeCost(r)&&item.editingId&&r.id===item.editingId)||d.essentials.find(r=>activeCost(r)&&normal(r.name)===normal(n));
  const c=categoryFor(item.budgetCategory||n),saved=x&&L.state.essentials.some(r=>r.id===x.id);
  if(x){if(!saved)x.name=c?.name||n;x.amount=Number(item.amount);if(c)x.budgetCategory=c.id;}
  else d.essentials.push({id:L.id('ess'),name:c?.name||n,...(c?{budgetCategory:c.id}:{}),amount:Number(item.amount),paid:0,externalPaid:0,coverageVersion:1,date:''});
 }
 d.essentialFields={name:'',amount:''};delete d.editingEssentialId;s.pending=null;s.revision++;invalidateForm();L.save();return true;
}
function upsert(name,amount,editingId=''){return applyProposals([{name,amount,editingId}]);}
function continueCategoryChoice(raw){
 const s=session(),p=s.pending,q=normal(raw),queue=p.queue;
 if(p.kind==='category'){
  const c=categoryFor(raw);if(!c||!taxonomy().list.some(x=>normal(x.name)===q||x.id===raw))return readyReply();
  const item=queue.items[queue.index];item.budgetCategory=c.id;
  // Keep the original alias until a duplicate is resolved; it expresses a
  // different cost from the existing category total.
  return applyProposals(queue.items,queue.period,queue.calculation),readyReply(queue.calculation||'Kept in your draft.');
 }
 if(p.kind==='combine-limit'){
  if(q==='keep draft unchanged'){s.pending=null;draft().essentialFields={name:'',amount:''};s.revision++;L.save();return readyReply('Your earlier totals are unchanged.');}
  const bare=String(raw).trim().match(/^(?:(?:GH₵|GHS|₵)\s*)?(\d+(?:\.\d{1,2})?)$/i),parsed=bare?null:parseItems(raw),value=bare?Number(bare[1]):Array.isArray(parsed)&&parsed.length===1&&categoryFor(parsed[0].name)?.id===p.categoryId?parsed[0].amount:null;
  if(!amountOK(value))return readyReply();
  const first=queue.items.find(x=>x.budgetCategory===p.categoryId),others=queue.items.filter(x=>x.budgetCategory!==p.categoryId);first.amount=value;first.name=p.categoryName;
  return applyProposals([first,...others],queue.period,queue.calculation),readyReply('Kept your corrected category total.');
 }
 if(p.kind==='combine'){
  if(q==='keep draft unchanged'){s.pending=null;draft().essentialFields={name:'',amount:''};s.revision++;L.save();return readyReply('Your earlier totals are unchanged.');}
  if(q!=='combine into one total')return readyReply();
  const first=queue.items.find(x=>x.budgetCategory===p.categoryId),others=queue.items.filter(x=>x.budgetCategory!==p.categoryId);
  first.amount=p.amount;first.name=p.categoryName;
  return applyProposals([first,...others],queue.period,queue.calculation),readyReply(queue.calculation||'Kept as one category total.');
 }
 if(p.kind==='duplicate'){
  if(!['use new total','add to total','keep existing total'].includes(q))return readyReply();
  const x=queue.items[queue.index],existing=draft().essentials.find(r=>r.id===p.existingId);if(!existing){s.pending=null;L.save();return invalidReply('That Budget item changed. Review your current draft.');}
  if(q==='keep existing total')queue.items.splice(queue.index,1);else{const proposed=q==='add to total'?Math.round((Number(existing.amount)+Number(x.amount))*100)/100:Number(x.amount);if(!amountOK(proposed))return invalidReply('That combined total is too large. Use the new total, keep the existing total, or return to the form.');x.editingId=existing.id;x.amount=proposed;}
  if(queue.items.some(x=>!amountOK(x.amount)))return invalidReply('That combined total is too large. Review the amount.');
  return applyProposals(queue.items,queue.period,queue.calculation),readyReply(q==='keep existing total'?'Kept your existing total.':'Kept your chosen category total.');
 }
 if(p.kind==='legacy-category'){
  const selected=p.candidates.find(x=>raw==='Choose budget item '+x.id||normal(x.name)===q);if(!selected)return readyReply();queue.items[queue.index].editingId=selected.id;
  return applyProposals(queue.items,queue.period,queue.calculation),readyReply('Kept your chosen item total.');
 }
}

const words={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,fourteen:14,twenty:20,thirty:30};
const countOf=x=>/^\d+$/.test(x)?Number(x):words[x];
function period(raw,allowBare=false){
 const q=normal(raw);let rest=raw;
 if(/^(?:not sure(?: yet)?|skip(?: the)? date|no (?:end )?date(?: yet)?)$/.test(q))return {skip:true,rest:''};
 if(/^until (?:my |the )?(?:expected )?allowance$/.test(q))return L.state.allowance?.date>today()?{date:L.state.allowance.date,mode:'allowance',rest:''}:{error:'What date is your allowance expected? It will not count as money until it arrives.'};
 const m=raw.match(/\b(?:for\s+(?:the\s+next\s+)?|next\s+)(\d+|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|twenty|thirty)\s*(days?|weeks?)\b/i)||(allowBare?raw.match(/^(?:for\s+)?(\d+|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|twenty|thirty)\s*(days?|weeks?)\s*[.!]?$/i):null);
 if(m){const count=countOf(m[1].toLowerCase())*(/^week/i.test(m[2])?7:1);if(!count||count>366)return {error:'Choose a period from one to 366 days, or enter an exact end date.'};rest=raw.replace(m[0],' ').trim();return {date:new Date(Date.parse(today()+'T00:00:00Z')+(count-1)*DAY).toISOString().slice(0,10),days:count,mode:'date',rest};}
 const until=raw.match(/\b(?:until|through|till)\s+(.+)$/i),date=L.chatPlanning?.parseDate(until?until[1]:allowBare?raw:'');
 if(date)return {date,days:Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(today()+'T00:00:00Z'))/DAY)+1,mode:'date',rest:until?raw.slice(0,until.index).trim():''};
 if(until)return {error:'What exact end date should I use? You can say “Friday” or enter YYYY-MM-DD.'};
 return {rest};
}
function applyPeriod(p){if(p.skip){draft().planHorizon={mode:'unspecified',date:''};session().dateAsked=true;}else if(p.date){draft().planHorizon={mode:p.mode||'date',date:p.date};session().dateAsked=true;}else return;session().revision++;invalidateForm();L.save();}
function canonical(name){
 let n=String(name||'').trim().replace(/^(?:and|plus)\s+/i,'').replace(/^(?:(?:i\s+(?:need|spend|want|budget))|(?:add|put|set|change|update|make|budget)(?:\s+my)?|my)(?:\s+|$)/i,'').replace(/\s+(?:will be|is about|costs? about|is around|is|at|to|should be|costs?|about|around)$/i,'').trim();
 const aliases={food:'Food',transport:'Transport',data:'Data',phone:'Phone',rent:'Rent',study:'Study',bills:'Bills'};return aliases[normal(n)]||n.replace(/^\w/,c=>c.toUpperCase());
}
function parseItems(raw){
 const text=raw.trim().replace(/[.!]$/,'');if(!text)return [];
 // Split after a complete amount, not inside a compound item name such as
 // “Food and transport”. More than one unnamed amount remains a question.
 const chunks=text.split(/\s*(?:,(?=\s*\p{L})|;|\band\b(?=\s+(?:\p{L}|\d|₵))|\n)\s*/iu),items=[];
 for(let chunk of chunks){
  if(!chunk.trim())continue;
  // Rejoin a bare item-name fragment before a compound-label amount.
  if(!/[0-9]/.test(chunk)&&chunks.length>1){items.push({bare:chunk});continue;}
  const m=chunk.match(/^(.*?)\s*(?:(?:GH₵|GHS|₵)\s*)?([+-]?\d[\d,.]*)\s*(.*)$/i);
  if(!m)return {error:'Tell me one named cost and its total, for example “Food 250”.'};
  const token=m[2].replace(/\.$/,'');if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(token)||!amountOK(token.replace(/,/g,'')))return {error:'Use a positive total in GH₵ with up to two decimal places, no more than GH₵1,000,000.'};
  let name=canonical(m[1]),tail=m[3].trim();
  if(!name&&/^(?:for|on)\s+/i.test(tail)){name=canonical(tail.replace(/^(?:for|on)\s+/i,''));tail='';}
  const dailyFor=!name&&tail.match(/^((?:(?:a|per|each)\s+day)|daily)\s+(?:on|for)\s+(.+)$/i);if(dailyFor){name=canonical(dailyFor[2]);tail=dailyFor[1];}
  if(!name&&items.length===0&&chunks.length===1)return {bareAmount:Number(token.replace(/,/g,'')),tail};
  if(items.at(-1)?.bare){name=canonical(items.pop().bare+' and '+name);}
  if(!name||name.length>80||!/^\p{L}[\p{L}\p{M} &'’/()\-]*$/u.test(name)||/^(?:i have|my balance|balance|available|money|i|have)$/i.test(name))return {error:'Which everyday cost is that for? Name it, for example Food or Transport.'};
  const rate=/^(?:(?:cedis?|GH₵|GHS|₵)\s*)?(?:(?:a|per|each)\s+day|daily|on\s+(?:my\s+)?(?:lecture|class)\s+days?)$/i.test(tail),lecture=/lecture|class/i.test(tail);
  if(tail&&!rate&&!/^(?:cedis?|GH₵|GHS|₵)$/i.test(tail))return {error:'Is that one total or a daily cost? Use “Food 250” or “Food 30 a day for seven days”.'};
  items.push({name,amount:Number(token.replace(/,/g,'')),rate,lecture});
 }
 if(items.some(x=>x.bare))return {error:'Give each item a total, or use one combined name and total.'};
 if(new Set(items.map(x=>normal(x.name))).size!==items.length)return {error:'I found the same item twice. What single total should it have?'};
 return items;
}
function invalidReply(message){return reply(message,'Your draft is kept. Nothing has been saved or moved.');}
function consume(raw){
 const s=session(),d=draft(),q=normal(raw);
 if(/^(?:cancel|cancel (?:(?:my|this|the) )?(?:budget|plan)|pause|stop|later|not now|leave for now)$/.test(q)){s.paused=true;L.save();return reply('Your Budget draft is kept.','Come back when you’re ready. Your saved Budget and any payment are unchanged.',{action:'Continue Budget',route:'budgetGuideResume'});}
 if(stale()||pendingBudgetPayment())return readyReply();
 if(s.pending?.kind==='relative'){
  const request=s.pending,candidate=request.candidates.find(x=>raw==='Adjust draft item '+x.id||normal(x.name)===q),x=candidate&&d.essentials.find(item=>activeCost(item)&&item.id===candidate.id);
  if(!x)return readyReply();if(candidate.mark!==itemMark(x))return invalidReply('That draft item changed. Return to your draft before choosing a new change.');
  s.pending=null;return applyRelative(x,request);
 }
 if(s.pending&&['category','duplicate','combine','combine-limit','legacy-category'].includes(s.pending.kind))return continueCategoryChoice(raw);
 if(/^(?:review(?: my)? budget|review(?: my)? plan|save(?: it| my budget| my plan)?|done|thats all|finished)$/.test(q))return readyReply('Ready to check it.');
 if(q==='add another item'||q==='add another cost'){s.pending=null;L.save();return reply('What else should this money cover?','Give me the item and its total, for example “Data 30”.');}
 if(q==='help me estimate'||q==='work out daily cost'){if(s.pending?.name)s.pending={...s.pending,kind:'daily-rate'};else s.estimateNext=true;s.revision++;L.save();return reply(s.pending?.name?`How much is ${s.pending.name} each day?`:'What cost would you like to work out?','Use your own usual daily cost. I’ll ask how many days it needs to cover.');}
 if(s.pending?.kind==='confirm'&&/^(?:no|change it|another amount)$/.test(q)){s.pending={kind:'total',name:s.pending.name,editingId:s.pending.editingId};d.essentialFields.amount='';L.save();return readyReply();}
 if(s.pending?.kind==='confirm'&&/^(?:yes|keep it|use this total|use it)$/.test(q)){const p=s.pending;upsert(p.name,p.amount,p.editingId);return readyReply('Kept in your draft.');}
 if(/^remove\s+/.test(q)){const name=normal(q.replace(/^remove\s+/,''));if(s.pending?.name&&normal(s.pending.name)===name){const wasEditing=!!s.pending.editingId;s.pending=null;d.essentialFields={name:'',amount:''};delete d.editingEssentialId;s.revision++;invalidateForm();L.save();return readyReply(wasEditing?'Stopped editing that item.':'Removed the unfinished entry.');}const found=d.essentials.filter(x=>normal(x.name)===name);if(found.length!==1)return invalidReply('Which draft item should I remove? Use its full name.');d.essentials=d.essentials.filter(x=>x.id!==found[0].id);s.revision++;invalidateForm();L.save();return readyReply('Removed from this draft.');}
 if(/[$€£¥]|\b(?:USD|EUR|GBP|NGN)(?=\s*[+-]?\d)|\b(?:USD|EUR|GBP|NGN|dollars?|euros?|pounds?|naira)\b/i.test(raw))return invalidReply('What is the total in Ghana cedis?');
 if(/\b(?:or|between|maybe)\b/i.test(raw)&&/\d/.test(raw))return invalidReply('Which single total should I use?');
 if(/^(?:(?:this|next) (?:week|month)|for (?:a|one) month)$/.test(q))return invalidReply('What exact end date should I use? You can choose seven days or enter YYYY-MM-DD.');
 const p=period(raw,!s.pending||s.pending.kind==='rate');if(p.error)return invalidReply(p.error);
 const count=normal(raw).match(/^(\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+(?:lecture |class )?days?)?$/);
 if(s.pending?.kind==='rate'&&(p.days||count)){
  const x=s.pending,n=count?countOf(count[1]):p.days,total=Math.round(x.rate*n*100)/100;if(!Number.isInteger(n)||n<1||n>366)return invalidReply('Choose a count from one to 366 days.');if(!amountOK(total))return invalidReply('That total is too large. Review the daily amount or number of days.');
  if(x.basis!=='lecture')applyPeriod(p.date?p:{...p,date:new Date(Date.parse(today()+'T00:00:00Z')+(n-1)*DAY).toISOString().slice(0,10),mode:'date'});upsert(x.name,total,x.editingId);return readyReply(`${M(x.rate)} × ${n} days = ${M(total)} for ${x.name}.`);
 }
 const rest=String(p.rest??raw).trim();
 if(!rest){if(p.skip&&s.pending?.kind==='rate')return invalidReply('A daily cost needs a number of days. You can enter a total instead.');applyPeriod(p);return readyReply();}
 if(s.pending?.kind==='name'&&!/\d/.test(rest)){const name=canonical(rest);if(!name||name.length>80)return invalidReply('What should this cost be called?');const x=s.pending;applyPeriod(p);upsert(name,x.amount,x.editingId);return readyReply('Kept in your draft.');}
 const explicitTotal=rest.match(/^(?:use |make it |the )?total\s+(?:(?:GH₵|GHS|₵)\s*)?(\d+(?:\.\d{1,2})?)$/i);
 if(s.pending?.name&&explicitTotal&&amountOK(explicitTotal[1])){const x=s.pending;applyPeriod(p);upsert(x.name,Number(explicitTotal[1]),x.editingId);return readyReply('Kept as one total.');}
 const bare=rest.match(/^(?:(?:GH₵|GHS|₵)\s*)?(\d+(?:\.\d{1,2})?)\s*(?:cedis?|GH₵|GHS|₵)?$/i);
 if(s.pending?.kind==='daily-rate'&&bare&&amountOK(bare[1])){const x=s.pending,rate=Number(bare[1]);applyPeriod(p);const h=d.planHorizon,n=h.mode!=='unspecified'&&dateOK(h.date)?Math.round((Date.parse(h.date+'T00:00:00Z')-Date.parse(today()+'T00:00:00Z'))/DAY)+1:0;s.pending={kind:'rate',name:x.name,rate,basis:'day',editingId:x.editingId||''};d.essentialFields={name:x.name,amount:''};L.save();if(n>0&&n<=366&&amountOK(Math.round(rate*n*100)/100)){upsert(x.name,Math.round(rate*n*100)/100,x.editingId);return readyReply(`${M(rate)} × ${n} days = ${M(Math.round(rate*n*100)/100)} for ${x.name}.`);}return readyReply();}
 if(s.pending&&['total','confirm'].includes(s.pending.kind)&&bare&&amountOK(bare[1])){const x=s.pending;applyPeriod(p);upsert(x.name,Number(bare[1]),x.editingId);return readyReply('Kept in your draft.');}
 // A short item name begins a question, rather than inventing its price.
 if(!/[0-9]/.test(rest)&&/^\p{L}[\p{L}\p{M} '&/\-]{0,79}$/u.test(rest)){
  const name=canonical(rest);if(/\b(?:not sure|dont know|help|hello|hi|thanks)\b/.test(normal(name)))return invalidReply('Tell me one cost you want this money to cover.');
  applyPeriod(p);const estimating=!!s.estimateNext;delete s.estimateNext;s.pending={kind:estimating?'daily-rate':'total',name};d.essentialFields={name,amount:''};s.revision++;L.save();return estimating?reply(`What do you usually pay for ${name} each day?`,'Tell me your own daily amount. I’ll ask how many days it needs to cover.'):readyReply();
 }
 const parsed=parseItems(rest);if(parsed.error)return invalidReply(parsed.error);
 let items=parsed;
 if(parsed.bareAmount!==undefined){
  if(s.pending?.name)items=[{name:s.pending.name,amount:parsed.bareAmount,rate:/^(?:a|per|each) day|^daily$/.test(normal(parsed.tail)),lecture:/lecture|class/.test(normal(parsed.tail)),editingId:s.pending.editingId}];
  else return invalidReply('What cost is this amount for? For example, “Food 250”.');
 }
 if(!Array.isArray(items)||!items.length)return invalidReply('What should I add to your Budget?');
 const pendingItem=s.pending;
 // A direct change command is an explicit edit, even when the student uses a
 // familiar alias such as Data for the fixed Data & airtime category.
 if(taxonomy()&&/^(?:change|update|set|make)\b/i.test(rest))for(const item of items){const c=categoryFor(item.name),matches=d.essentials.filter(x=>activeCost(x)&&c&&categoryFor(x)?.id===c.id);if(matches.length===1)item.editingId=matches[0].id;}
 if(pendingItem?.name&&!items.some(x=>normal(x.name)===normal(pendingItem.name)))return reply(`Let’s keep your ${pendingItem.name} entry safe.`,pendingItem.kind==='confirm'?`You entered ${M(pendingItem.amount)}. Choose “Use this total”, estimate it, or return to the form before adding a different item.`:'Finish this amount, return to the form, or say “Remove '+pendingItem.name+'” before adding a different item.',{guideChoices:pendingItem.kind==='confirm'?[['Use this total','Use this total'],['Help me estimate','Help me estimate']]:[]});
 const rates=items.filter(x=>x.rate),days=p.days||(d.planHorizon.mode!=='unspecified'&&dateOK(d.planHorizon.date)?Math.max(0,Math.round((Date.parse(d.planHorizon.date+'T00:00:00Z')-Date.parse(today()+'T00:00:00Z'))/DAY)+1):0);
 if(items.some(x=>/\s+(?:and|&)\s+/i.test(x.name)&&!d.essentials.some(y=>normal(y.name)===normal(x.name))&&x.name.split(/\s+(?:and|&)\s+/i).some(part=>d.essentials.some(y=>normal(y.name)===normal(part)))))return invalidReply('Is that one combined cost, or a change to an existing item? Use one existing item name to change its total.');
 if(rates.length&&items.length>1&&(!days||rates.some(x=>x.lecture)))return invalidReply('Let’s work out one daily cost at a time. What does the first cost need to cover?');
 if(items.some(x=>x.rate&&days&&Math.round(x.amount*days*100)/100>1000000))return invalidReply('That total is too large. Review the daily amount or period.');
 let calculation='';const proposals=[];
 for(const x of items){
  if(x.rate&&(!days||x.lecture)){applyPeriod(p);s.pending={kind:'rate',name:x.name,rate:x.amount,basis:x.lecture?'lecture':'day',editingId:x.editingId||''};d.essentialFields={name:x.name,amount:''};L.save();return readyReply();}
  const total=x.rate?Math.round(x.amount*days*100)/100:x.amount;if(x.rate)calculation=`${M(x.amount)} × ${days} days = ${M(total)} for ${x.name}.`;
  proposals.push({name:x.name,amount:total,editingId:x.editingId||(pendingItem?.name&&normal(x.name)===normal(pendingItem.name)?pendingItem.editingId:'')||''});
 }
 applyProposals(proposals,p,calculation);
 return readyReply(calculation||'Kept in your draft.');
}
const itemMark=x=>JSON.stringify([x.id,x.name,x.amount,x.budgetCategory||'',!!x.archived,!!x.deleted]);
function applyRelative(x,request){
 const total=Math.round((Number(x.amount)+request.direction*request.delta)*100)/100;
 if(!amountOK(total))return invalidReply('That change needs a total above zero and no more than GH₵1,000,000. You can delete an item from your Budget instead.');
 const before=Number(x.amount);applyProposals([{name:x.name,amount:total,editingId:x.id}]);
 return readyReply(`${M(before)} ${request.direction>0?'+':'−'} ${M(request.delta)} = ${M(total)} for ${x.name}.`);
}
function relativeInGuide(raw){
 const d=draft(),s=session(),request=L.chatPlanning?.relativeChange?.(raw,d.essentials.filter(activeCost));if(!request)return null;
 if(request.cancelled)return reply('Your Budget draft is unchanged.','Tell me the change you want to review when you’re ready.');
 if(request.error)return invalidReply(request.error);
 if(s.pending){const current=readyReply();return reply('Finish your current Budget entry first.',current.headline+' '+current.support,{guideChoices:current.guideChoices||[]});}
 if(!d.essentials.filter(activeCost).length)return reply('There is no Budget item to adjust yet.','Choose a category and enter its total first.',{guideChoices:categoryChoices()});
 if(request.matches.length===1)return applyRelative(request.matches[0],request);
 const candidates=(request.matches.length?request.matches:d.essentials.filter(activeCost)).map(x=>({id:x.id,name:x.name,mark:itemMark(x)}));
 s.pending={kind:'relative',delta:request.delta,direction:request.direction,candidates};s.revision++;L.save();return readyReply();
}
function resourceInGuide(raw){
 const text=String(raw||'').trim(),match=text.match(/^i\s*(?:have(?:\s+got)?|['’]?ve\s+got|got)\s*(?:(?:GH₵|GHS|GH|₵)\s*)?([0-9][0-9,.]*)\s+to\s+(?:last|cover|make)(?:\s+(?:me|it))?\s*(.*)$/i);
 if(!match)return null;
 const token=match[1].replace(/\.$/,'');if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(token)||!amountOK(token.replace(/,/g,'')))return invalidReply('Use one positive planning amount in Ghana cedis, with up to two decimal places.');
 const amount=Number(token.replace(/,/g,'')),tail=match[2].replace(/^(?:last)\s+/i,'').trim(),p=tail?period(tail,true):{};
 if(p.error)return invalidReply(p.error);
 const s=session(),d=draft(),available=L.firstPlanPosition().available;
 s.resourceContext={amount,availableAtEntry:available,...(p.date?{date:p.date}:{}),recordedAt:new Date().toISOString()};
 if(s.pending){L.save();return reply(`I’ve kept ${M(amount)} as your stated planning amount.`,'Finish the current Budget entry first. This does not add money or replace an entered cost.',{guideChoices:readyReply().guideChoices||[]});}
 applyPeriod(p);s.estimateNext=true;s.revision++;L.save();
 const actual=amount>available?`Only ${M(available)} is currently available. I’ll check your Budget against that amount.`:`${M(available)} is currently available in your account.`;
 return reply(p.date?`Let’s plan through ${dateLabel(p.date)}.`:'What does this money need to cover?',`${M(amount)} is your stated planning amount, not new money. ${actual} Choose one cost to estimate.`,{guideChoices:categoryChoices()});
}
function uncertaintyInGuide(raw){
 const q=normal(raw),scope=q.match(/\s+(?:on|for)\s+(.+)$/),concern=scope?q.slice(0,scope.index):q;if(!/^(?:(?:i (?:dont|do not) know|im not sure|i am not sure|not sure)(?:\s+(?:(?:how much|what) i (?:spend|spent|need)|(?:how much|what) to (?:budget|plan)|what (?:i spend|this should cover)|about (?:my )?(?:spending|budget)))|help me (?:estimate|work out)(?: my)? (?:spending|budget))$/.test(concern))return null;
 const s=session();
 if(s.pending&&['category','duplicate','combine','combine-limit','legacy-category','relative'].includes(s.pending.kind))return readyReply();
 if(s.pending?.name)return reply('An estimate is okay.',`We can work out ${s.pending.name} from your usual daily amount and the number of days. Nothing has been saved.`,{guideChoices:[['Help me estimate','Help me estimate']]});
 const category=scope&&categoryFor(scope[1]);if(category){const matches=L.chatBudgetMatches?.(scope[1],draft().essentials.filter(activeCost))||[];s.pending={kind:'daily-rate',name:category.name,...(matches.length===1?{editingId:matches[0].id}:{})};draft().essentialFields={name:category.name,amount:''};s.revision++;invalidateForm();L.save();return readyReply();}
 s.estimateNext=true;s.revision++;L.save();return reply('Let’s estimate one cost at a time.','Choose a category, then tell me what you usually pay each day. I won’t invent a price.',{guideChoices:categoryChoices()});
}
function explain(raw){
 const q=normal(raw),s=session();
 if(/^(?:what is (?:a |the )?budget|what does (?:a |the )?budget (?:do|mean)|explain (?:a |the )?budget)$/.test(q))return reply('A Budget tells Lumo what your money needs to cover.','Save costs such as food and transport. Before you pay, Lumo can show what that payment would change. Your money stays in Everyday money.');
 if(/^(?:why (?:do i )?need (?:this|a budget|it)|what is this for|why should i (?:do this|budget))$/.test(q))return reply('So a payment comes with a clearer consequence.','Your Budget gives Lumo the costs to check before you spend. Start with one cost; you can add more later.');
 if(/\b(?:lock|move|transfer|deduct|take)\b/.test(q)&&/\b(?:budget|this|my money|money)\b/.test(q)&&!/\d/.test(q))return reply('Creating a Budget does not move or lock your money.','It plans costs in your Everyday account. Money Boxes hold separate savings and require a separate transfer.');
 if(/^(?:what (?:is|does) (?:the )?left after (?:my )?budget(?: mean)?|what does left after budget mean)$/.test(q))return reply('It is the money outside your saved Budget costs.','It is part of the same Everyday balance, not another account. Other costs may be missing.');
 const estimate=q.match(/^how much should i (?:budget|plan|put aside) for (.+)$/);
 if(estimate){const name=canonical(estimate[1]);if(s.pending?.name&&normal(s.pending.name)!==normal(name))return reply(`You’ve started ${s.pending.name}.`,'Keep or finish that entry first. For another item, I can work out your own daily cost × days without guessing a price.');s.pending={kind:'daily-rate',name,editingId:s.pending?.editingId||''};draft().essentialFields={name,amount:draft().essentialFields?.amount||''};L.save();return reply(`What do you usually pay for ${name} each day?`,'Tell me your own daily amount. I’ll work out the total for the days you choose.');}
 if(/^(?:i dont know|i do not know|not sure|help|im confused)$/.test(q))return s.pending?.name?reply('An estimate is okay.','Use “Help me estimate” to work out your own daily cost, or return to the form. Nothing has been saved.',{guideChoices:[['Help me estimate','Help me estimate']]}):reply('Start with one cost you know.','Food, transport or data is enough to begin. We can add the others later.',{guideChoices:taxonomy()?categoryChoices():[['Food','Food'],['Transport','Transport'],['Data','Data']]});
 return null;
}
const previousAnswer=L.chatAnswer;
L.chatAnswer=function(question,options={}){
 const raw=String(question||'').trim().slice(0,500),q=normal(raw);
 if(!allowed())return previousAnswer.apply(this,arguments);
 if(!active()&&/^(?:help me |lets |please )?(?:create|build|make|start|edit|adjust|update)(?: me)?(?: a| my)? (?:new )?(?:budget|plan)(?: with lumo)?$/.test(q)){
  if(prepare({mode:'create'}))return readyReply();return reply('Continue your saved period draft first.','Your entries are kept.');
 }
 if(!active())return previousAnswer.apply(this,arguments);
 if(/^(?:cancel|cancel (?:(?:my|this|the) )?(?:budget|plan)|pause|stop|later|not now|leave for now)$/.test(q))return consume(raw);
 if(stale()||pendingBudgetPayment())return readyReply();
 const natural=uncertaintyInGuide(raw)||resourceInGuide(raw)||relativeInGuide(raw);if(natural)return natural;
 const explanation=explain(raw);if(explanation)return explanation;
 // An unrelated money question ends this guided turn. No amount from it can
 // become a new Budget cost, and existing payment drafts remain untouched.
 if((/^(?:what|why|how|when|where|who|can|could|should|is|does|do|will|would|are)\b/.test(q)||/\b(?:pay|payments?|send|transfer|buy|spent|spend|withdraw|money\s*box(?:es)?|savings|balance|allowance received)\b/.test(q))&&!/^i spend\b/.test(q)){
  session().paused=true;L.save();return previousAnswer.apply(this,arguments);
 }
 return consume(raw);
};
function choose(index,text){
 const r=L.state.chats?.[index];if(L.route!=='chat'||!active()||index!==(L.state.chats?.length||0)-1||r?.guideDraftId!==session().draftId||r.guideRevision!==session().revision)return false;
 return append(text,L.chatAnswer(text));
}
function returnToForm(){
 if(!allowed()||!same())return false;session().paused=true;L.save();invalidateForm();L.go('firstEssentials');return true;
}
function review(){
 if(!allowed()||!same())return false;
 if(stale()||pendingBudgetPayment()){if(L.route==='chat')append('Review my Budget',readyReply());else L.error('Your saved Budget changed. Your draft is kept; review the current Budget before replacing it.');return false;}
 if(session().pending){if(L.route==='chat')append('Review my Budget',readyReply());return false;}
 if(!draft().essentials.length){if(L.route==='chat')append('Review my Budget',readyReply());return false;}
 session().paused=true;L.save();invalidateForm();L.go('firstEssentials');
 if(L.route==='firstEssentials')L.reviewFirstPlanCosts();else session().queuedReview=true;
 return true;
}
const draftMark=()=>JSON.stringify([draft()?.essentials,draft()?.essentialFields,draft()?.editingEssentialId,draft()?.planHorizon]);
function restart(){
 if(!allowed()||!same()||L.route!=='chat')return false;
 session().restartMark=baseMark();session().restartDraftMark=draftMark();L.save();
 return append('Restart from current Budget',reply('Replace this unsaved draft?','Your conversation will stay in Chat. Your unsaved Budget edits will be replaced with your current saved Budget. No money moves.',{action:'Replace unsaved draft',route:'budgetGuideRestartConfirm',secondaryAction:'Keep my draft',secondaryRoute:'budgetGuideKeep'}));
}
function confirmRestart(){
 if(!allowed()||!same()||L.route!=='chat')return false;
 if(pendingBudgetPayment())return append('Restart Budget draft',readyReply());
 if(session().restartMark!==baseMark()||session().restartDraftMark!==draftMark())return append('Restart Budget draft',reply('Your Budget or draft changed again.','Your entries are kept. Review the current Budget before choosing to restart.',{action:'Restart from current Budget',route:'budgetGuideRestart'}));
 retireGuide(session().draftId);L.state.planDraft=null;L.state.budgetGuideSession=null;invalidateForm();prepare({mode:'create'});return append('Use current saved Budget',readyReply('Started from your current saved costs.'));
}
const openAnswer=L.chatOpenAnswer;
L.chatOpenAnswer=function(index,secondary=false){
 const r=L.state.chats?.[index],route=secondary?r?.secondaryRoute:r?.route;
 if(!/^budgetGuide/.test(route||''))return openAnswer.apply(this,arguments);
 if(!allowed()||!same()||r.guideDraftId!==session().draftId)return false;
 if(route==='budgetGuideRestart')return restart();
 if(route==='budgetGuideRestartConfirm')return confirmRestart();
 if(route==='budgetGuideKeep'){delete session().restartMark;delete session().restartDraftMark;L.save();return append('Keep my draft',reply('Your unsaved draft is kept.','No Budget costs or money have changed.',{action:'Open current Budget',route:'budgetGuideCurrent'}));}
 if(route==='budgetGuideHistory'){if(!active()||r.guideRevision!==session().revision||draft().essentials.length||session().pending||!L.budgetHistory?.summary().eligible)return false;return L.budgetHistory.open();}
 if(route==='budgetGuideCurrent')return L.go('planEdit');
 if(route==='budgetGuidePending'){const t=pendingBudgetPayment();return t?L.go('txDetail',{id:t.id}):false;}
 if(route==='budgetGuideResume')return resume();
 if(r.guideRevision!==session().revision){L.toast('Your draft changed. Use the current Budget draft controls.');return false;}
 return route==='budgetGuideForm'?returnToForm():review();
};
const extra=L.chatExtraControls;
L.chatExtraControls=function(r,index){
 const before=extra?.apply(this,arguments)||'';if(!active()||index!==(L.state.chats?.length||0)-1||r.guideDraftId!==session().draftId||r.guideRevision!==session().revision)return before;
 const choices=r.guideChoices||[];
 return before+(choices.length?`<div class="chips budget-guide-choices" role="group" aria-label="Budget guide suggestions">${choices.map(([label,text])=>B(E(label),`L.budgetGuide.choose(${index},${E(JSON.stringify(text))})`,'chip')).join('')}</div>`:'');
};
const save=L.saveFirstPlan;
L.saveFirstPlan=function(...args){
 const guided=same();if(guided&&pendingBudgetPayment())return L.error('A payment linked to your Budget is pending. Wait for its result before saving changed costs.');if(guided&&(!allowed()||stale()))return L.error('Your saved Budget changed. Your draft is kept. Review the current Budget before replacing it.');
 if(guided&&draft().essentials.some(x=>!String(x.name||'').trim()||!amountOK(x.amount)))return L.error('Review each Budget item name and positive total before saving.');
 if(guided&&['category','duplicate','combine','combine-limit','legacy-category','relative'].includes(session().pending?.kind))return L.error('Finish the category or total choice in Chat before saving. Your proposed costs are kept.');
 const id=guided?session().draftId:null,result=save.apply(this,args);
 if(guided&&!draft()){
  session().status='saved';session().paused=true;retireGuide(id);
  if(!(L.state.chats||[]).some(r=>r.budgetGuideSavedId===id)){
   const answer=L.chatAnswer('What is left after my budget?'),headline='Budget saved. '+(answer.headline||answer.text||'Your saved costs are ready.'),confirmed={...answer,headline,text:[headline,answer.support].filter(Boolean).join(' '),budgetGuideSavedId:id};
   if(L.route==='chat'&&!L.taskSheet?.active)append('Saved my Budget',confirmed);else{(L.state.chats||=[]).push({q:'Saved my Budget',...confirmed});L.save();}
  }else L.save();
 }
 return result;
};
const openTab=L.openTab;
L.openTab=function(route,...args){
 if(handoff){
  if(!allowed()||!same()||handoff.account!==L.state||handoff.draftId!==session().draftId){handoff=null;}
  else if(route!=='chat'){delete session().queuedIntro;handoff=null;L.save();}
  else if(!L.taskSheet?.active&&window.history?.state?.route==='chat'&&!window.history.state.taskSheet){
   const state=window.history.state;handoff=null;
   // History already owns Chat. Reconcile its rendered outlet rather than
   // pushing a duplicate page or re-entering a closed task.
   if(L.route!=='chat'){L.beforeNavigate?.('chat',state.params||{});L.route='chat';L.params=clone(state.params||{});L.history=clone(state.stack||[]);}
   L.render();return;
  }
 }
 return openTab.call(this,route,...args);
};
const render=L.render;
L.render=function(...args){
 const result=render.apply(this,args),s=session();
 if(!allowed()||!same())return result;
 if(s.queuedIntro&&L.route==='chat'&&!L.taskSheet?.active&&!handoff){const q=s.queuedIntro;delete s.queuedIntro;append(q.question,q.answer);}
 if(s.queuedReview&&L.route==='firstEssentials'){delete s.queuedReview;L.reviewFirstPlanCosts();}
 return result;
};
const snapshot=L.chatSnapshotStatusExtra;
L.chatSnapshotStatusExtra=r=>{
 const previous=snapshot?.(r);if(previous)return previous;
 if(r.intent!=='budgetGuide'||!r.guideFinancialMark)return '';
 if(!allowed()||r.guideDraftId!==draft()?.guideId||r.guideRevision!==session()?.revision)return 'Earlier Budget draft projection. Review the current draft before saving.';
 return r.guideFinancialMark!==quoteMark()?'Earlier draft projection. Your money or Budget coverage changed. Review current figures.':'';
};
L.budgetGuide={start,returnToForm,review,pause,resume,reply,active,summary,choose,restart,confirmRestart};
})();
