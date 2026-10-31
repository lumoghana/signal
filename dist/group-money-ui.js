/* Small, private group-money journeys. All contributions in this static
   prototype are explicitly simulated and remain outside personal balances. */
(()=>{
'use strict';
if(!window.L||!L.groupMoney||L.gm)return;
const G=L.groupMoney,E=L.e,M=G.format,B=L.btn;
const authenticated=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed;
const access=item=>G.access?.(item)||{isOrganiser:item?.people?.some(p=>p.id==='self'&&p.isOwner),isApprover:false,canView:false,canContribute:false,canPropose:false,canApprove:false,canExecute:false,canCancel:false};
const roleLabel=item=>{const a=access(item);return a.isOrganiser?'Organiser':a.isApprover?'Approver':'Contributor';};
const memberName=(p,item)=>p.id===(access(item).localPersonId||'self')?'You':p.isOwner?(item?.ownerName||p.name):p.name;
const owner=()=>String(L.state.profile?.account||L.state.profile?.handle||L.state.profile?.phone||L.state.profile?.name);
const store=()=>{G.list();return L.state.groupMoney;};
const draft=()=>{if(!authenticated())return null;const d=store()?.draft;return d?.account===owner()?d:null;};
const save=()=>L.save();
const go=(route,params={})=>{if(authenticated())L.go(route,params);else L.toast('Sign in to your demo account first.');};
const boundary='<p class="gm-boundary">Same-device preview · No real money moves</p>';
const error='<div id="error" class="gm-error" role="alert"></div>';
const button=(label,js,cls='primary')=>B(label,js,cls);
const date=v=>{const time=Date.parse(v+'T12:00:00Z');return Number.isFinite(time)?new Date(time).toLocaleDateString('en-GH',{day:'numeric',month:'short',year:'numeric'}):v;};
const field=(label,id,value='',type='text',extra='')=>`<label class="field" for="${id}"><span>${E(label)}</span><input class="input" id="${id}" name="${id}" type="${type}" value="${E(value)}" ${type==='number'?'inputmode="decimal" min="0.01" max="1000000" step="0.01"':type==='date'?'':'maxlength="60" autocomplete="off"'} oninput="L.gm.capture()" ${extra}></label>`;
const row=(label,value)=>`<div><dt>${E(label)}</dt><dd>${E(value)}</dd></div>`;
const note=text=>`<p class="gm-note">${text}</p>`;
const shell=(title,sub,body,actions='',form=false)=>`<section class="gm-page">${L.header(title,sub)}${form?'<form class="gm-form" onsubmit="event.preventDefault();L.gm.next()">':''}<div class="gm-body">${body}${error}</div>${actions?`<div class="gm-actions">${actions}</div>`:''}${form?'</form>':''}${boundary}</section>`;
const choice=(title,sub,icon,action)=>`<button type="button" class="gm-choice-row" onclick="${E(action)}"><span class="gm-choice-icon">${L.icon(icon,23)}</span><span class="gm-choice-copy"><strong>${E(title)}</strong><small>${E(sub)}</small></span>${L.icon('chevron',18)}</button>`;
const statusLabels={due:'Awaiting repayment',partial:'Part repaid',settled:'Settled',collecting:'Collecting',completed:'Target reached',expired:'Deadline passed',cancelled:'Cancelled',refunded:'Sample refunds recorded'};
const itemRow=item=>{const f=G.summary(item);if(!f)return '';return `<button type="button" class="gm-item" onclick="L.gm.open('${item.id}')"><span class="gm-choice-icon">${L.icon(item.type==='split'?'receipt':'target',20)}</span><span class="gm-choice-copy"><strong>${E(item.title)}</strong><small>${E(item.type==='split'?'Expense split':access(item).isOrganiser?'Collection':roleLabel(item)+' · Joined')} · ${E(statusLabels[f.status]||f.status)}</small></span><span class="gm-trailing">${M(item.type==='split'?f.dueCents:f.balanceCents)}<small>${item.type==='split'?'unpaid':'sample balance'}</small></span></button>`;};
const inputFor=d=>d.type==='split'?{title:d.title,total:d.total,mode:d.mode,people:d.people,sourceTxId:d.sourceTxId||null,idempotencyKey:d.key}:{title:d.title,target:d.target,deadline:d.deadline,members:d.people,mandateApproval:d.mandateApproval||'majority',...(d.mandateApproval==='named'?{mandateApproverIds:d.mandateApproverIds||[],mandateRequiredApprovals:d.mandateRequiredApprovals}:{}),idempotencyKey:d.key};
const preview=d=>d?.type==='split'?G.previewSplit(inputFor(d)):G.previewCollection(inputFor(d));
const equalShares=d=>{const total=G.cents(d.total);if(total===null||!d.people.length)return;const each=Math.floor(total/d.people.length);d.people.forEach(p=>p.amount=((each+(p.id==='self'?total-each*d.people.length:0))/100).toFixed(2));};
const reconcileApprovers=d=>{if(!d||d.type!=='collection'||!Array.isArray(d.mandateApproverIds))return;const ids=new Set(d.people.map(p=>p.id));d.mandateApproverIds=d.mandateApproverIds.filter(id=>ids.has(id));d.mandateRequiredApprovals=Math.max(2,Math.min(Number(d.mandateRequiredApprovals)||2,d.mandateApproverIds.length));};
const invalidate=()=>{const d=draft();if(d){reconcileApprovers(d);d.stage='people';delete d.review;}};
const emptyDraft=type=>({account:owner(),key:L.id('GD'),type,title:'',total:'',target:'',deadline:new Date(Date.now()+14*86400000).toISOString().slice(0,10),mode:'equal',mandateApproval:'majority',sourceTxId:null,people:[{id:'self',name:'You',isOwner:true,amount:''},{id:L.id('GM'),name:'',amount:''}],stage:'basics'});
const legacyNewRequest=L.newRequest;
L.openMoneyRequests=()=>go('groupMoneyHome');
// Keep the existing Home button and individual request engine. The button now
// opens this small chooser; choosing one person uses its original saved draft.
L.newRequest=()=>L.openMoneyRequests();
const capture=()=>{
 captureProposal();
 const d=draft();if(!d)return;
 for(const [id,key]of [['gm-title','title'],['gm-total','total'],['gm-target','target'],['gm-deadline','deadline']]){const el=document.getElementById(id);if(el)d[key]=el.value.slice(0,60);}
 d.people.forEach((p,i)=>{const name=document.getElementById('gm-name-'+i),amount=document.getElementById('gm-share-'+i);if(name&&!p.isOwner)p.name=name.value.slice(0,60);if(amount)p.amount=amount.value;});
 save();
};
const start=(type,sourceTxId)=>{
 if(!authenticated())return L.toast('Sign in to your demo account first.');
 if(type==='split'&&sourceTxId){const existing=G.splitForSource?.(sourceTxId);if(existing)return go(existing.kind==='current'?'groupMoneyDetail':'sharedGroup',{id:existing.id});}
 let d=draft();
 if(!d||d.type!==type||d.createdId||sourceTxId&&d.sourceTxId!==sourceTxId){d=emptyDraft(type);store().draft=d;}
 if(sourceTxId){const t=L.state.txs.find(t=>t.id===sourceTxId);if(!G.eligibleSource(t))return L.toast('Choose a completed payment.');d.sourceTxId=t.id;d.total=(G.sourceAmount(t)/100).toFixed(2);d.title=String(t.note||t.name||'Shared expense').slice(0,60);d.stage='basics';}
 save();go(d.stage==='review'?'groupMoneyReview':d.stage==='people'?'groupMoneyPeople':type==='split'?'groupMoneySplit':'groupMoneyCollection');
};
const next=()=>{
 capture();const d=draft();if(!d)return go('groupMoneyHome');
 if(['groupMoneySplit','groupMoneyCollection'].includes(L.route)){
  if(!d.title.trim())return L.error(d.type==='split'?'Give the expense a short name.':'Give your collection a short name.','gm-title');
  const amount=G.cents(d.type==='split'?d.total:d.target);
  if(amount===null||amount<=0)return L.error('Enter an amount above zero, with no more than two decimals.',d.type==='split'?'gm-total':'gm-target');
  if(d.type==='collection'){const end=Date.parse(d.deadline+'T23:59:59.999Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(d.deadline)||!Number.isFinite(end)||new Date(end).toISOString().slice(0,10)!==d.deadline||end<Date.now())return L.error('Choose today or a future date.','gm-deadline');}
  if(d.type==='split')equalShares(d);d.stage='people';save();return go('groupMoneyPeople');
 }
 const result=preview(d);if(!result.ok)return L.error(result.error);
 d.stage='review';d.review=JSON.stringify(result.item);save();go('groupMoneyReview');
};
const create=()=>{
 if(!authenticated())return;
 const d=draft();if(!d)return go('groupMoneyHome');
 if(d.createdId)return go('groupMoneyDetail',{id:d.createdId});
 const check=preview(d);if(!check.ok)return L.error(check.error);
 if(!d.review||d.review!==JSON.stringify(check.item))return L.error('These details changed. Go back and review them again.');
 const result=d.type==='split'?G.createSplit(inputFor(d)):G.createCollection({...inputFor(d),acceptMandate:true});
 if(!result.ok)return L.error(result.error);d.createdId=result.item.id;save();go('groupMoneyDetail',{id:result.item.id});
};
const renderPeople=()=>{L.clearFormDraft?.('groupMoneyPeople',{});L.render();};
const setMode=mode=>{capture();const d=draft();if(!d||!['equal','custom'].includes(mode))return;d.mode=mode;equalShares(d);invalidate();save();renderPeople();};
const setMandate=approval=>{capture();const d=draft();if(!d||d.type!=='collection'||!['majority','everyone','named'].includes(approval))return;if(approval==='named')return openApprovers();d.mandateApproval=approval;invalidate();save();renderPeople();};
const openApprovers=()=>{capture();const d=draft();if(!d||d.type!=='collection')return;const check=G.previewCollection({...inputFor(d),mandateApproval:'majority'});if(!check.ok)return L.error(check.error);if(!Array.isArray(d.mandateApproverIds))d.mandateApproverIds=d.people.map(p=>p.id);d.mandateApproval='named';reconcileApprovers(d);invalidate();save();go('groupMoneyApprovers');};
const toggleApprover=id=>{const d=draft();if(!d||L.route!=='groupMoneyApprovers'||!d.people.some(p=>p.id===id))return;const at=d.mandateApproverIds.indexOf(id);if(at<0)d.mandateApproverIds.push(id);else d.mandateApproverIds.splice(at,1);invalidate();save();L.render();};
const setRequiredApprovals=()=>{const d=draft();if(!d||L.route!=='groupMoneyApprovers')return;d.mandateRequiredApprovals=Number(document.getElementById('gm-required-approvals')?.value);invalidate();save();};
const saveApprovers=()=>{const d=draft();if(!d||L.route!=='groupMoneyApprovers')return;setRequiredApprovals();const check=preview(d);if(!check.ok)return L.error(check.error);save();go('groupMoneyPeople');};
const addPerson=()=>{capture();const d=draft();if(!d||d.people.length>=9)return;d.people.push({id:L.id('GM'),name:'',amount:''});if(d.mode==='equal')equalShares(d);invalidate();save();renderPeople();};
const removePerson=i=>{capture();const d=draft();if(!d||!Number.isInteger(i)||!d.people[i]||d.people[i].isOwner||d.people.length<=2)return;d.people.splice(i,1);if(d.mode==='equal')equalShares(d);invalidate();save();renderPeople();};
const edit=stage=>{const d=draft();if(!d)return go('groupMoneyHome');d.stage=stage;delete d.review;save();go(stage==='people'?'groupMoneyPeople':d.type==='split'?'groupMoneySplit':'groupMoneyCollection');};
const share=async id=>{
 const text=G.shareText(id);if(!text)return;
 try{if(navigator.share)await navigator.share({title:'Lumo · '+G.get(id).title,text});else await L.copy(text);}catch{L.toast('Sharing cancelled. Your details are saved.');}
};
const showSample=(id,personId)=>{
 const item=G.get(id),f=G.summary(item);if(!item||!f?.canReceive)return L.toast('This record is closed to new sample payments.');
 const a=access(item),people=f.people.filter(p=>item.type==='collection'?(a.isOrganiser||p.id==='self'):!p.isOwner&&p.dueCents>0),person=people.find(p=>p.id===personId)||people[0];if(!person)return;
 store().sampleDraft={itemId:id,personId:person.id,amount:((item.type==='split'?person.dueCents:Math.min(f.remainingCents,Math.ceil(item.targetCents/item.people.length)))/100).toFixed(2),reference:L.id('GSP')};save();go('groupMoneySample',{id});
};
const samplePerson=()=>{const d=store()?.sampleDraft,item=G.get(d?.itemId);if(!d||!item)return;const selected=document.getElementById('gm-sample-person')?.value,f=G.summary(item),p=f.people.find(p=>p.id===selected);if(!p)return;d.personId=p.id;d.amount=((item.type==='split'?p.dueCents:Math.min(f.remainingCents,Math.ceil(item.targetCents/item.people.length)))/100).toFixed(2);save();L.render();};
const recordSample=()=>{
 const d=store()?.sampleDraft;if(!d||d.itemId!==L.params.id)return L.error('Open a saved collection or split first.');
 const amount=document.getElementById('gm-sample-amount');if(amount)d.amount=amount.value;
 const result=G.recordSamplePayment(d);if(!result.ok)return L.error(result.error,'gm-sample-amount');save();go('groupMoneyDetail',{id:d.itemId});
};
const cancel=id=>{const result=G.cancel(id);if(!result.ok)return L.error(result.error);go('groupMoneyDetail',{id});};
const refund=id=>{const result=G.refund(id);if(!result.ok)return L.error(result.error);go('groupMoneyDetail',{id});};
const normal=value=>String(value||'').trim().normalize('NFKC').toLowerCase();
const appPeople=()=>{
 // Read the existing recipient directory without starting a payment or copying
 // its financial draft. Only displayed names and handles are used here.
 const holder=document.createElement('div');holder.innerHTML=L.peopleHTML?.('')||'';
 return [...holder.querySelectorAll('button')].flatMap(b=>{
  const id=(b.getAttribute('onclick')||'').match(/^L\.pickPerson\('([A-Za-z0-9_-]+)'\)$/)?.[1],name=b.querySelector('strong')?.textContent.trim(),handle=b.querySelector('small')?.textContent.split(' · ')[0];
  return id&&name?[{id:'lumo-'+id,name,handle,source:'Lumo contact'}]:[];
 });
};
const pickerCandidates=()=>{const d=draft(),sources=[...G.recentPeople().map(p=>({...p,source:'Recent person'})),...appPeople(),...(d?.picker?.device||[])];const seen=new Set();return sources.filter(p=>{if(seen.has(p.id))return false;seen.add(p.id);return true;});};
const picker=()=>draft()?.picker;
const openPeople=tab=>{capture();const d=draft();if(!d)return;d.picker={tab:tab==='groups'?'groups':'recent',selected:[],device:[]};save();go('groupMoneyContacts');};
const backToPeople=()=>{const d=draft();if(!d)return go('groupMoneyHome');delete d.picker;save();L.clearFormDraft?.('groupMoneyPeople',{});go('groupMoneyPeople');};
const peopleTab=tab=>{const d=draft();if(!d?.picker||!['recent','lumo','groups','phone'].includes(tab))return;d.picker.tab=tab;save();L.render();};
const togglePerson=id=>{const d=draft(),p=pickerCandidates().find(p=>p.id===id);if(!d?.picker||!p)return;const selected=d.picker.selected,index=selected.indexOf(id);if(index>=0)selected.splice(index,1);else selected.push(id);save();L.render();};
const addSelected=()=>{
 const d=draft();if(!d?.picker)return;const selected=pickerCandidates().filter(p=>d.picker.selected.includes(p.id));if(!selected.length)return L.error('Choose at least one person.');
 const people=d.people.filter(p=>p.isOwner||p.name.trim()),names=new Set(people.map(p=>normal(p.name)));
 const additions=[];for(const p of selected){if(names.has(normal(p.name)))continue;if(['you','me',normal(L.state.profile?.name)].includes(normal(p.name)))return L.error('Your share is already included.');names.add(normal(p.name));additions.push({...p,id:people.some(x=>x.id===p.id)?L.id('GM'):p.id,isOwner:false,amount:''});}
 if(!additions.length)return L.error('These people are already in your list.');
 if(people.length+additions.length>G.limits.maxFriends+1)return L.error('Use up to eight friends in this group. Remove a person before adding more.');
 const result=G.rememberPeople(additions);if(!result.ok)return L.error(result.error);
 const changedCustom=d.type==='split'&&d.mode==='custom';d.people=people.concat(additions);if(d.type==='split'){d.mode='equal';equalShares(d);d.peopleResetNote=changedCustom?'The new people start with equal shares. Choose amounts to adjust them.':'';}
 invalidate();backToPeople();
};
const deviceContactsSupported=()=>window.isSecureContext===true&&window.top===window&&typeof navigator.contacts?.select==='function';
const pickDevice=async()=>{
 const d=draft(),p=d?.picker,account=L.state,key=d?.key;if(!authenticated()||L.route!=='groupMoneyContacts'||!p||!deviceContactsSupported())return L.toast('Choose a Lumo contact or enter a name instead.');
 try{
  // select must be invoked directly from the user's tap, before any await.
  const chosen=await navigator.contacts.select(['name'],{multiple:true});
  if(L.state!==account||!authenticated()||draft()!==d||d.key!==key||d.picker!==p||L.route!=='groupMoneyContacts')return;
  const seen=new Set(),people=[];for(const entry of chosen||[]){const name=String(entry.name?.[0]||'').trim().slice(0,60);if(!name||seen.has(normal(name)))continue;seen.add(normal(name));people.push({id:L.id('GPER'),name,source:'Selected from phone'});}
  if(people.length>G.limits.maxFriends)return L.error('Choose no more than eight people from your phone.');
  if(!people.length)return L.toast('No names selected. Your current list is unchanged.');
  p.device=people;p.selected=people.map(p=>p.id);p.tab='phone';save();L.render();
 }catch(ex){if(L.state===account&&authenticated()&&draft()===d&&d.picker===p&&L.route==='groupMoneyContacts')L.toast(ex?.name==='AbortError'?'No contacts added.':'Contact selection is unavailable. Choose a Lumo contact or enter a name.');}
};
const openSaveGroup=()=>{capture();const d=draft();if(!d)return;const result=G.previewCollection({title:'People',target:'1',deadline:new Date(Date.now()+86400000).toISOString().slice(0,10),members:d.people});if(!result.ok)return L.error(result.error);go('groupMoneySaveGroup');};
const saveGroup=()=>{const d=draft();if(!d)return;const result=G.saveTemplate({name:document.getElementById('gm-group-name')?.value,people:d.people});if(!result.ok)return L.error(result.error,'gm-group-name');d.savedGroupName=result.template.name;save();go('groupMoneyPeople');L.toast('Group saved. Use these people again next time.');};
const useGroup=id=>{
 const d=draft(),group=G.template(id);if(!d||!group)return L.error('This saved group is unavailable.');
 d.people=group.people.map(p=>({...p,amount:''}));if(d.type==='split'){d.mode='equal';equalShares(d);d.peopleResetNote='This group starts with equal shares. Choose amounts to adjust them.';}
 d.savedGroupName=group.name;invalidate();backToPeople();
};
const removeGroup=id=>{const result=G.deleteTemplate(id);if(!result.ok)return L.error(result.error);go('groupMoneyContacts');L.toast('Saved group removed. Existing splits and collections are unchanged.');};
const mandateLabel=m=>m?`${m.requiredApprovals} of ${m.approverCount||m.approverIds?.length||m.memberCount||m.memberIds?.length||0} ${m.approval==='named'?'named approvers':'members'} approve each payment`:'';
const approverNames=m=>(m.people||[]).filter(p=>p.isApprover===true||(m.approverIds||m.memberIds||[]).includes(p.id)).map(p=>p.name).join(', ');
const fullMandate=m=>`<div class="gm-mandate-summary"><span class="gm-status">Mandate · version ${m.version}</span><h2>${E(mandateLabel(m))}</h2><p>${m.approval==='named'?'Approvers: '+E(approverNames(m)):'One member, one vote.'}</p></div><ol class="gm-mandate-rules">${m.rules.map(rule=>`<li>${E(rule)}</li>`).join('')}</ol>`;
const draftMandate=()=>{const d=draft(),p=d?.type==='collection'?preview(d):null;return p?.ok?G.mandateSummary(p.item):null;};
const openMandate=id=>{capture();if(id&&!G.get(id))return;go('groupMoneyMandate',id?{id}:{});};
const openMember=(id,personId,proposalId)=>{const item=G.get(id),m=G.mandateSummary?.(item);if(!item||!access(item).isOrganiser||!m?.valid||['cancelled','refunded'].includes(item.status))return;const member=m.people.find(p=>p.id===personId)||m.people.find(p=>p.id!=='self'&&!p.accepted)||m.people.find(p=>p.id!=='self'&&p.isApprover)||m.people.find(p=>p.id!=='self')||m.people[0];go('groupMoneyMember',{id,personId:member.id,...(proposalId?{proposalId}:{})});};
const memberPerson=()=>{const {id,proposalId}=L.params,personId=document.getElementById('gm-member-person')?.value;openMember(id,personId,proposalId);};
const acceptMember=(id,personId)=>{if(!authenticated()||L.route!=='groupMoneyMember'||L.params.id!==id||L.params.personId!==personId)return;const m=G.mandateSummary(id);if(!m?.valid)return;const result=G.acceptMandate({itemId:id,personId,version:m.version,sample:personId!=='self'});if(!result.ok)return L.error(result.error);go('groupMoneyMandate',{id});};
const proposalDraft=()=>{if(!authenticated())return null;const d=L.state.groupMoney?.proposalDraft;return d?.account===owner()?d:null;};
const proposalDraftMark=d=>JSON.stringify([d.recipient.trim(),d.purpose.trim(),d.amount,(d.supportingReference||'').trim(),d.attachment||null]);
const captureProposal=()=>{if(!authenticated()||L.route!=='groupMoneyProposal')return;const d=proposalDraft();if(!d||L.params.id!==d.itemId)return;for(const [key,max]of [['recipient',100],['purpose',160],['amount',60],['supportingReference',240]]){const el=document.getElementById('gm-proposal-'+key);if(el)d[key]=el.value.slice(0,max);}save();};
const openPayments=id=>go('groupMoneyPayments',{id});
const startProposal=id=>{const item=G.get(id),m=G.mandateSummary?.(item),s=G.summary(item);if(!item||!access(item).canPropose||!m?.allAccepted||!s||s.availableCents<=0||['cancelled','refunded'].includes(s.status))return L.toast('The organiser proposes payments after everyone accepts the mandate.');const old=proposalDraft();if(!old||old.itemId!==id||old.createdId)store().proposalDraft={account:owner(),itemId:id,key:L.id('GPD'),recipient:'',purpose:'',amount:'',supportingReference:''};save();go('groupMoneyProposal',{id});};
const reviewProposal=()=>{captureProposal();const d=proposalDraft();if(!d||L.params.id!==d.itemId)return;const item=G.get(d.itemId),f=G.summary(item),amount=G.cents(d.amount);if(!item||!f)return;if(!d.recipient.trim())return L.error('Name the sample recipient.','gm-proposal-recipient');if(!d.purpose.trim())return L.error('Explain what this payment is for.','gm-proposal-purpose');if(amount===null||amount<=0)return L.error('Enter an amount above zero with no more than two decimals.','gm-proposal-amount');if(amount>f.availableCents)return L.error('Use no more than '+M(f.availableCents)+'.','gm-proposal-amount');d.review=proposalDraftMark(d);save();go('groupMoneyProposalReview',{id:d.itemId});};
const createProposal=()=>{if(!authenticated()||L.route!=='groupMoneyProposalReview')return;const d=proposalDraft();if(!d||d.itemId!==L.params.id)return;if(d.createdId)return go('groupMoneyProposalDetail',{id:d.itemId,proposalId:d.createdId});if(!d.review||d.review!==proposalDraftMark(d))return L.error('These details changed. Review the proposal again.');const result=G.createProposal({itemId:d.itemId,recipient:d.recipient,purpose:d.purpose,amount:d.amount,...((d.supportingReference||'').trim()?{supportingReference:d.supportingReference.trim()}:{}),...(d.attachment?{attachment:d.attachment}:{}),idempotencyKey:d.key});if(!result.ok)return L.error(result.error);const p=result.proposal;d.createdId=p.id;save();go('groupMoneyProposalDetail',{id:d.itemId,proposalId:p.id});};
// A decision is bound to the details actually rendered, including supporting
// evidence. These quotes and the release grant never enter saved app state.
const decisionReviews=new Map();
const decisionKey=(id,proposalId,personId)=>id+'|'+proposalId+'|'+personId;
const decisionReview=(id,proposalId,personId)=>{
 const key=decisionKey(id,proposalId,personId),p=G.proposal(id,proposalId);if(!p)return null;
 let q=decisionReviews.get(key);if(!q||q.state!==L.state||q.account!==owner()){q={state:L.state,account:owner(),fingerprint:p.fingerprint,version:p.mandateVersion};decisionReviews.set(key,q);}return q;
};
const decisionCurrent=(q,p)=>q&&p&&q.state===L.state&&q.account===owner()&&q.fingerprint===p.fingerprint&&q.version===p.mandateVersion;
const refreshProposalReview=(id,proposalId)=>{if(!authenticated()||L.route!=='groupMoneyProposalDetail'||L.params.id!==id||L.params.proposalId!==proposalId)return;const a=access(G.get(id));decisionReviews.delete(decisionKey(id,proposalId,a.localPersonId||'self'));L.render();};
const approveOwn=(id,proposalId)=>{if(!authenticated()||L.route!=='groupMoneyProposalDetail'||L.params.id!==id||L.params.proposalId!==proposalId)return;const item=G.get(id),a=access(item),q=decisionReview(id,proposalId,a.localPersonId||'self');if(!a.canApprove||!q)return;const r=G.approveProposal({itemId:id,proposalId,personId:a.localPersonId||'self',version:q.version,fingerprint:q.fingerprint,sample:false});if(!r.ok)return L.error(r.error);L.render();};
const approveMember=(id,proposalId,personId)=>{if(!authenticated()||L.route!=='groupMoneyMember'||L.params.id!==id||L.params.proposalId!==proposalId||L.params.personId!==personId)return;const item=G.get(id),q=decisionReview(id,proposalId,personId);if(!access(item).isOrganiser||!q)return;const r=G.approveProposal({itemId:id,proposalId,personId,version:q.version,fingerprint:q.fingerprint,sample:personId!==(access(item).localPersonId||'self')});if(!r.ok)return L.error(r.error);go('groupMoneyProposalDetail',{id,proposalId});};
let declineReview=null,withdrawReview=null,payoutReview=null,releasing=false;
const openDecline=(id,proposalId,personId)=>{
 if(!authenticated()||!['groupMoneyProposalDetail','groupMoneyMember'].includes(L.route)||L.params.id!==id||L.params.proposalId!==proposalId)return;
 const item=G.get(id),a=access(item),local=a.localPersonId||'self',person=personId||local;
 if(person!==local&&(!a.isOrganiser||L.route!=='groupMoneyMember'||L.params.personId!==person)||person===local&&!a.canApprove)return;
 const q=decisionReview(id,proposalId,person),p=G.proposal(id,proposalId);if(!decisionCurrent(q,p))return L.error('These payout details changed. Review the latest details first.');
 declineReview={...q,id,proposalId,personId:person,sample:person!==local};go('groupMoneyProposalDecline',{id,proposalId,personId:person});
};
const declineProposal=()=>{
 const q=declineReview;if(!authenticated()||L.route!=='groupMoneyProposalDecline'||!q||q.state!==L.state||q.account!==owner()||L.params.id!==q.id||L.params.proposalId!==q.proposalId||L.params.personId!==q.personId)return L.error('Open and review this payout again.');
 const r=G.declineProposal({itemId:q.id,proposalId:q.proposalId,personId:q.personId,version:q.version,fingerprint:q.fingerprint,sample:q.sample});if(!r.ok)return L.error(r.error);declineReview=null;go('groupMoneyProposalDetail',{id:q.id,proposalId:q.proposalId});
};
const openWithdrawal=(id,proposalId)=>{
 if(!authenticated()||L.route!=='groupMoneyProposalDetail'||L.params.id!==id||L.params.proposalId!==proposalId||!access(G.get(id)).isOrganiser)return;
 const p=G.proposal(id,proposalId),s=G.proposalSummary(id,proposalId),q=decisionReview(id,proposalId,access(G.get(id)).localPersonId||'self');
 if(!decisionCurrent(q,p)||!['pending','ready','failed'].includes(s?.status))return L.error('Review the current payout before withdrawing it.');
 withdrawReview={...q,id,proposalId};go('groupMoneyPayoutWithdraw',{id,proposalId});
};
const withdrawProposal=()=>{
 const q=withdrawReview;if(!authenticated()||L.route!=='groupMoneyPayoutWithdraw'||!q||q.state!==L.state||q.account!==owner()||L.params.id!==q.id||L.params.proposalId!==q.proposalId)return L.error('Open and review this payout again.');
 const r=G.cancelProposal({itemId:q.id,proposalId:q.proposalId,fingerprint:q.fingerprint});if(!r.ok)return L.error(r.error);withdrawReview=null;go('groupMoneyProposalDetail',{id:q.id,proposalId:q.proposalId});
};
const clearPayoutReview=()=>{const pin=document.getElementById('gm-payout-pin');if(pin)pin.value='';if(payoutReview)G.discardPayoutReview?.({reviewToken:payoutReview.quote.token});payoutReview=null;};
const executeProposal=(id,proposalId)=>{
 if(!authenticated()||L.route!=='groupMoneyProposalDetail'||L.params.id!==id||L.params.proposalId!==proposalId)return;
 clearPayoutReview();const r=G.preparePayout({itemId:id,proposalId});if(!r.ok)return L.error(r.error);
 payoutReview={state:L.state,account:owner(),id,proposalId,quote:r.quote};L.clearFormDraft?.('groupMoneyPayoutRelease',{id,proposalId});go('groupMoneyPayoutRelease',{id,proposalId});
};
const releasePayout=()=>{
 const q=payoutReview;if(releasing||L.route!=='groupMoneyPayoutRelease')return false;
 if(!authenticated()||!q||q.state!==L.state||q.account!==owner()||L.params.id!==q.id||L.params.proposalId!==q.proposalId){clearPayoutReview();L.render();if(!authenticated())return false;return L.error('Review this payout again before releasing it.');}
 const field=document.getElementById('gm-payout-pin'),pin=field?.value||'';if(field)field.value='';
 const outcome=L.testMode?(document.getElementById('gm-payout-outcome')?.value||'Pending'):'Pending';releasing=true;
 let result;try{result=G.executeSampleProposal({itemId:q.id,proposalId:q.proposalId,reviewToken:q.quote.token,pin,outcome});}finally{releasing=false;}
 if(!result.ok){if(result.needsReview||!authenticated())clearPayoutReview();if(!authenticated()){L.render();return;}if(result.needsReview)L.render();return L.error(result.error,result.needsReview?undefined:'gm-payout-pin');}
 clearPayoutReview();go('groupMoneyProposalDetail',{id:q.id,proposalId:q.proposalId});
};
const checkPayoutStatus=(id,proposalId,attemptId,reference)=>{
 if(!authenticated()||L.route!=='groupMoneyProposalDetail'||L.params.id!==id||L.params.proposalId!==proposalId)return;
 const item=G.get(id),proposal=G.proposal(id,proposalId),a=access(item);if(!a.isOrganiser&&!(item?.invitedSample&&proposal?.rail&&a.canView))return;
 const s=G.proposalSummary(id,proposalId);if(s?.status!=='processing')return;if(!attemptId||!reference)return L.error('Review this payout’s current processing reference first.');
 const outcome=L.testMode?(document.getElementById('gm-payout-settlement')?.value||'Completed'):'Completed';
 if(outcome==='Pending')return L.toast('The sample payment is still processing. Its amount remains reserved.');
 const r=G.settleSamplePayout({itemId:id,proposalId,reference,attemptId,outcome,sample:true});if(!r.ok)return L.error(r.error);L.render();
};
const invitationReviews=new Map();
const invitationSnapshot=s=>({account:owner(),state:L.state,fingerprint:s.fingerprint,version:s.mandate?.version});
const openInvitation=id=>{if(!authenticated())return;const s=G.invitationSummary?.(id);if(!s)return L.toast('This invitation is unavailable.');invitationReviews.set(id,invitationSnapshot(s));go('groupMoneyInvitation',{id});};
const sampleInvitation=scenario=>{if(!authenticated()||L.route!=='groupMoneySampleInvitations')return;const result=G.createSampleInvitation({scenario,idempotencyKey:L.id('GSI')});if(!result.ok)return L.error(result.error);openInvitation(result.invitation.id);};
const acceptInvitation=id=>{if(!authenticated()||L.route!=='groupMoneyInvitation'||L.params.id!==id)return;const quote=invitationReviews.get(id);if(!quote||quote.account!==owner()||quote.state!==L.state)return L.error('Open and read this invitation again.');const result=G.acceptInvitation({invitationId:id,version:quote.version,fingerprint:quote.fingerprint});if(!result.ok)return L.error(result.error);go('groupMoneyDetail',{id:result.item.id});};
const declineInvitation=id=>{if(!authenticated()||L.route!=='groupMoneyInvitationDecline'||L.params.id!==id)return;const result=G.declineInvitation({invitationId:id});if(!result.ok)return L.error(result.error);openInvitation(id);};
L.gm={capture,captureProposal,next,create,setMode,setMandate,openApprovers,toggleApprover,setRequiredApprovals,saveApprovers,addPerson,removePerson,edit,share,recordSample,showSample,samplePerson,cancel,refund,openPeople,backToPeople,peopleTab,togglePerson,addSelected,pickDevice,deviceContactsSupported,openSaveGroup,saveGroup,useGroup,removeGroup,openMandate,openMember,memberPerson,acceptMember,openPayments,startProposal,reviewProposal,createProposal,approveOwn,approveMember,openDecline,declineProposal,openWithdrawal,withdrawProposal,refreshProposalReview,executeProposal,releasePayout,checkPayoutStatus,openInvitation,refreshInvitation:openInvitation,sampleInvitation,acceptInvitation,declineInvitation,open:id=>go('groupMoneyDetail',{id}),startSplit:id=>start('split',id),startCollection:()=>start('collection'),onePerson:()=>legacyNewRequest(),newDraft:()=>{store().draft=null;save();go('groupMoneyHome');}};
// All ordinary entry points use the current split journey. Earlier records
// remain readable, including their already confirmed incoming repayments.
L.openExpenseSplit=id=>L.gm.startSplit(id);
L.startSharedExpense=id=>L.openExpenseSplit(id);
L.openSharedExpenses=()=>go('groupMoneyList',{filter:'split'});
const earlierSplitRow=item=>{const f=L.sharedExpenses?.summary?.(item);return f?`<button type="button" class="gm-item" onclick="L.go('sharedGroup',{id:'${E(item.id)}'})"><span class="gm-choice-icon">${L.icon('receipt',20)}</span><span class="gm-choice-copy"><strong>${E(item.title)}</strong><small>Earlier split · Saved repayments retained</small></span><span class="gm-trailing">${M(f.dueCents)}<small>unpaid</small></span></button>`:'';};
for(const route of ['txDetail','paymentResult']){const previous=L.views[route];L.views[route]=function(...args){let html=previous.apply(this,args);const t=(L.state.txs||[]).find(row=>row.id===(L.params.id||L.state.paymentDraft?.submittedTxId));if(!G.eligibleSource(t))return html;const existing=G.splitForSource?.(t.id),entry=`<div class="shared-receipt-entry">${button(existing?'View split':'Split this payment',`L.openExpenseSplit('${t.id}')`,'secondary')}</div>`;return /<div class="shared-receipt-entry">/.test(html)?html.replace(/<div class="shared-receipt-entry">[\s\S]*?<\/div>/,entry):html+entry;};}
L.views.groupMoneyHome=()=>{
 const items=G.list(),legacy=(L.state.sharedExpenses?.groups||[]).length,pending=(G.invitations?.()||[]).filter(i=>G.invitationSummary(i.id)?.status==='pending').length;
 const choices=choice('One person','Ask someone for a specific amount','user','L.gm.onePerson()')+choice('Split an expense','Already paid? Work out everyone’s share.','receipt','L.gm.startSplit()')+choice('Collect together','Build towards a target or an event.','target','L.gm.startCollection()');
 const recent=items.length?`<div class="gm-section-head"><h2>Splits & collections</h2>${button('See all',"L.go('groupMoneyList')",'text-btn')}</div>${items.slice(0,2).map(itemRow).join('')}`:'';
 const tools=`<div class="gm-hub-tools">${button('Your collections',"L.go('groupMoneyList',{filter:'collection'})",'secondary')}${button('Invitations'+(pending?' ('+pending+')':''),"L.go('groupMoneyInvitations')",'secondary')}</div>`;
 return shell('Collect','Request money, split a cost or collect together.',`<div class="gm-choices">${choices}</div>${tools}${recent}`,button('Money requests',"L.go('requests')",'text-btn')+(legacy?button('Earlier splits',"L.openSharedExpenses()",'text-btn'):''));
};
L.views.groupMoneyList=()=>{
 const filter=['all','split','collection'].includes(L.params.filter)?L.params.filter:'all',items=G.list().filter(i=>filter==='all'||i.type===filter),earlier=filter!=='collection'?(L.state.sharedExpenses?.groups||[]):[],page=Math.max(0,Math.min(Number(L.params.page)||0,Math.max(0,Math.ceil(items.length/5)-1)));
 const tabs=`<div class="gm-tabs" role="group" aria-label="Filter group records">${[['all','All'],['split','Splits'],['collection','Collections']].map(([k,label])=>button(label,`L.go('groupMoneyList',{filter:'${k}'})`,'chip '+(filter===k?'selected':''))).join('')}</div>`;
 const pages=items.length>5?`<div class="gm-section-head">${page?button('Previous',`L.go('groupMoneyList',{filter:'${filter}',page:${page-1}})`,'text-btn'):'<span></span>'}<small>${page+1} / ${Math.ceil(items.length/5)}</small>${(page+1)*5<items.length?button('Next',`L.go('groupMoneyList',{filter:'${filter}',page:${page+1}})`,'text-btn'):''}</div>`:'';
 const empty=filter==='split'?['No splits yet','Split an expense you already paid to work out everyone’s share.']:filter==='collection'?['No collections yet','Create a collection for a target or event, or join from an invitation.']:['Nothing here yet','Split an expense, create a collection or join from an invitation.'];
 const records=items.slice(page*5,page*5+5).map(itemRow).join(''),emptyMarkup=!records&&!earlier.length?'<div class="gm-empty">'+L.icon(filter==='split'?'receipt':'target',32)+'<h2>'+empty[0]+'</h2><p>'+empty[1]+'</p></div>':'';
 return shell('Splits & collections','Created and joined, in one place.',tabs+records+emptyMarkup+pages+(earlier.length?`<details class="gm-earlier-splits"><summary>Earlier splits · ${earlier.length}</summary>${earlier.map(earlierSplitRow).join('')}</details>`:''),button('Collect',"L.go('groupMoneyHome')")+button('Invitations',"L.go('groupMoneyInvitations')",'text-btn'));
};
L.views.groupMoneySplit=()=>{
 const d=draft();if(!d||d.type!=='split')return L.views.groupMoneyHome();
 const t=d.sourceTxId&&(L.state.txs||[]).find(t=>t.id===d.sourceTxId);
 return shell('Split an expense','1 of 3 · Tell us what you already paid.',`<div class="gm-step">Expense</div>${field('What was it for?','gm-title',d.title,'text','placeholder="e.g. Project materials"')}${field('Total paid · GH₵','gm-total',d.total,'number',t?'readonly aria-readonly="true"':'placeholder="0.00"')}<div class="gm-summary">${row('Paid with',t?t.name:'Outside Lumo')}</div>${note(t?'Only the payment amount is split. Fees are excluded.':'This records an expense you already paid. It does not charge you again.')}${button(t?'Choose a different payment':'Use a completed Lumo payment',"L.go('groupMoneySource')",'text-btn')}`, '<button type="submit" class="primary">Choose people</button>',true);
};
L.views.groupMoneySource=()=>{
 const available=(L.state.txs||[]).filter(G.eligibleSource).filter(t=>!G.list().some(i=>i.sourceTxId===t.id)&&!(L.state.sharedExpenses?.groups||[]).some(g=>g.txId===t.id)).slice(0,12);
 return shell('Choose a payment','Only completed outgoing payments can be split.',available.map(t=>choice(t.name,M(G.sourceAmount(t))+' · '+new Date(t.date).toLocaleDateString('en-GH',{day:'numeric',month:'short'}),'receipt',`L.gm.startSplit('${t.id}')`)).join('')||'<div class="gm-empty"><h2>No completed payments yet</h2><p>You can still split an expense paid outside Lumo.</p></div>',button('Paid outside Lumo',"L.gm.useOutside()",'secondary'));
};
L.gm.useOutside=()=>{let d=draft();if(!d||d.type!=='split'){store().draft=emptyDraft('split');d=draft();}d.sourceTxId=null;d.total='';d.stage='basics';save();go('groupMoneySplit');};
L.views.groupMoneyCollection=()=>{
 const d=draft();if(!d||d.type!=='collection')return L.views.groupMoneyHome();
 return shell('Collect together','1 of 3 · What are you planning?',`<div class="gm-step">Target or event</div>${field('Collection name','gm-title',d.title,'text','placeholder="e.g. Cape Coast trip"')}${field('Target · GH₵','gm-target',d.target,'number','placeholder="0.00"')}${field('Deadline','gm-deadline',d.deadline,'date','min="'+new Date().toISOString().slice(0,10)+'"')}${note('Small group preview · Up to 9 people, including you. Contributions stay in this separate collection account.')}`, '<button type="submit" class="primary">Choose people</button>',true);
};
L.views.groupMoneyPeople=()=>{
 const d=draft();if(!d)return L.views.groupMoneyHome();
 if(d.type==='split'&&d.mode==='equal')equalShares(d);
 const isSplit=d.type==='split',total=G.cents(isSplit?d.total:d.target)||0;
 reconcileApprovers(d);const needed=d.mandateApproval==='named'?d.mandateRequiredApprovals:d.mandateApproval==='everyone'?d.people.length:Math.floor(d.people.length/2)+1;
 const modes=isSplit?`<div class="gm-tabs" role="group" aria-label="How to split">${button('Split equally',"L.gm.setMode('equal')",'chip '+(d.mode==='equal'?'selected':''))}${button('Choose amounts',"L.gm.setMode('custom')",'chip '+(d.mode==='custom'?'selected':''))}</div>`:`<div class="gm-mandate-choice"><h2>Who approves spending?</h2><div class="gm-tabs" role="group" aria-label="Collection mandate">${[['majority','Majority'],['everyone','Everyone'],['named','Choose approvers']].map(([key,label])=>button(label,`L.gm.setMandate('${key}')`,'chip '+((d.mandateApproval||'majority')===key?'selected':'')).replace('<button ',`<button aria-pressed="${(d.mandateApproval||'majority')===key}" `)).join('')}</div><p>${needed||2} of ${d.mandateApproval==='named'?(d.mandateApproverIds||[]).length:d.people.length} ${d.mandateApproval==='named'?'named approvers':'members'} must approve each payment.</p>${d.mandateApproval==='named'?`<p>${E(d.people.filter(p=>d.mandateApproverIds.includes(p.id)).map(p=>p.name).join(', ')||'Choose at least two approvers.')}</p>`:''}</div>`;
 const people=d.people.map((p,i)=>`<div class="gm-person"><span class="gm-avatar" aria-hidden="true">${p.isOwner?L.icon('user',17):i}</span><div class="gm-person-copy">${p.isOwner?'<strong>You</strong><small>'+(isSplit?'Your share is included':'Organiser')+'</small>':`<label for="gm-name-${i}" class="sr-only">Person ${i}</label><input class="input" id="gm-name-${i}" name="gm-name-${i}" placeholder="Friend’s name" value="${E(p.name)}" maxlength="60" autocomplete="off" oninput="L.gm.capture()">`}</div>${isSplit?(d.mode==='custom'?`<label class="gm-person-amount"><span class="sr-only">${p.isOwner?'Your share':'Share for person '+i} · GH₵</span><input class="input" id="gm-share-${i}" name="gm-share-${i}" type="number" min="0" step="0.01" inputmode="decimal" aria-label="${p.isOwner?'Your share':'Share for person '+i} · GH₵" value="${E(p.amount)}" oninput="L.gm.capture()"></label>`:`<strong class="gm-person-amount">${M(G.cents(p.amount)||0)}</strong>`):''}${!p.isOwner&&d.people.length>2?`<button type="button" class="gm-remove icon-btn" aria-label="Remove person ${i}" onclick="L.gm.removePerson(${i})">${L.icon('close',16)}</button>`:''}</div>`).join('');
 const shortcuts=`<div class="gm-people-tools">${button(L.icon('user',16)+' Choose people',"L.gm.openPeople('recent')",'secondary')}${G.templates().length?button('Saved groups',"L.gm.openPeople('groups')",'secondary'):''}</div>`;
 const reusable=d.people.some(p=>!p.isOwner&&p.name.trim())?button(d.savedGroupName?'Save as another group':'Save these people as a group','L.gm.openSaveGroup()','text-btn'):'';
 return shell(isSplit?'Who shared it?':'Who’s joining?','2 of 3 · '+(isSplit?'Include yourself in the total.':'Keep the collection between your people.'),`<p class="gm-overline">${E(d.title)} · ${M(total)}</p>${shortcuts}${modes}${d.peopleResetNote&&d.mode==='equal'?note(E(d.peopleResetNote)):''}<div class="gm-people">${people}</div><div class="gm-people-tools gm-people-tools-small">${d.people.length<9?button(L.icon('plus',17)+' Add a person','L.gm.addPerson()','text-btn'):''}${reusable}</div>${isSplit&&d.mode==='equal'&&total%d.people.length?note('Any extra pesewas are included in your share.'):''}`, '<button type="submit" class="primary">Review '+(isSplit?'split':'collection')+'</button>'+button('Edit '+(isSplit?'expense':'target'),"L.gm.edit('basics')",'text-btn'),true);
};
L.views.groupMoneyApprovers=()=>{
 const d=draft();if(!d||d.type!=='collection')return L.views.groupMoneyHome();reconcileApprovers(d);
 const ids=d.mandateApproverIds||[],count=ids.length,options=Array.from({length:Math.max(0,count-1)},(_,i)=>i+2);
 const people=`<div class="gm-approver-list">${d.people.map(p=>`<button type="button" class="gm-contact${ids.includes(p.id)?' selected':''}" aria-label="${E(p.name)}" aria-pressed="${ids.includes(p.id)}" onclick="L.gm.toggleApprover('${p.id}')"><span class="gm-avatar">${L.icon(ids.includes(p.id)?'check':'user',17)}</span><span class="gm-person-copy"><strong>${E(p.name)}</strong><small>${p.isOwner?'Organiser · may be an approver':'Group member'}</small></span><span class="gm-contact-check" aria-hidden="true">${L.icon(ids.includes(p.id)?'check':'plus',17)}</span></button>`).join('')}</div>`;
 const select=count>=2?`<label class="field" for="gm-required-approvals"><span>Approvals needed</span><select class="input" id="gm-required-approvals" onchange="L.gm.setRequiredApprovals()">${options.map(n=>`<option value="${n}"${n===d.mandateRequiredApprovals?' selected':''}>${n} of ${count} approvers</option>`).join('')}</select></label>`:note('Choose at least two different members as approvers.');
 return shell('Choose approvers',d.title,note('Choose who can approve payments. Everyone can contribute and follow the pot.')+people+`<div class="gm-section-head"><h2>How many must agree?</h2></div>`+select+note('The organiser has a vote only if selected. Everyone accepts these roles before contributing.'),button('Use these approvers','L.gm.saveApprovers()')+button('Back to people',"L.go('groupMoneyPeople')",'secondary'));
};
L.views.groupMoneyContacts=()=>{
 const d=draft(),p=d?.picker;if(!d||!p)return L.views.groupMoneyPeople();
 const tab=p.tab,tabs=[['recent','Recent'],['lumo','Lumo contacts'],['groups','Saved groups'],...(p.device.length?[['phone','From phone']]:[])];
 const tabMarkup=`<div class="gm-tabs" role="group" aria-label="People sources">${tabs.map(([key,label])=>button(label,`L.gm.peopleTab('${key}')`,'chip '+(tab===key?'selected':'')).replace('<button ',`<button aria-pressed="${tab===key}" `)).join('')}</div>`;
 let body='';
 if(tab==='groups'){
  const groups=G.templates();body=note(d.type==='split'?'Using a group replaces these people and starts with equal shares. You can adjust them next.':'Using a group replaces these people. Your target and deadline stay the same.')+(groups.length?groups.map(g=>`<div class="gm-saved-group"><button type="button" class="gm-contact" onclick="L.gm.useGroup('${g.id}')"><span class="gm-avatar">${L.icon('user',17)}</span><span class="gm-person-copy"><strong>${E(g.name)}</strong><small>${g.people.filter(p=>!p.isOwner).map(p=>E(p.name)).join(', ')}</small></span>${L.icon('chevron',17)}</button><button type="button" class="icon-btn gm-remove" aria-label="Remove saved group ${E(g.name)}" onclick="L.go('groupMoneyRemoveGroup',{id:'${g.id}'})">${L.icon('close',17)}</button></div>`).join(''):'<div class="gm-empty"><h2>No saved groups yet</h2><p>Add people, then save the group to use them again.</p></div>');
 }else{
  const candidates=tab==='lumo'?appPeople():tab==='phone'?p.device:G.recentPeople(),names=new Set(d.people.filter(p=>p.isOwner||p.name.trim()).map(p=>normal(p.name)));
  body=(deviceContactsSupported()?button('Choose from phone','L.gm.pickDevice()','secondary gm-phone-picker'):'')+(candidates.length?`<div class="gm-contact-list">${candidates.map(person=>{const included=names.has(normal(person.name)),selected=p.selected.includes(person.id);return `<button type="button" class="gm-contact${selected?' selected':''}" aria-pressed="${selected}" onclick="L.gm.togglePerson('${person.id}')"${included?' disabled':''}><span class="gm-avatar">${L.icon(selected?'check':'user',17)}</span><span class="gm-person-copy"><strong>${E(person.name)}</strong><small>${included?'Already in this group':E(person.handle||person.source||'Recent person')}</small></span><span class="gm-contact-check" aria-hidden="true">${L.icon(selected?'check':'plus',17)}</span></button>`;}).join('')}</div>`:'<div class="gm-empty"><h2>No recent people yet</h2><p>Choose Lumo contacts or enter a name on the previous screen.</p></div>');
 }
 const selected=pickerCandidates().filter(person=>p.selected.includes(person.id)).length;
 return shell('Choose people','Select names once. Keep them for your next shared plan.',tabMarkup+body,(tab!=='groups'?button('Add selected'+(selected?' ('+selected+')':''),'L.gm.addSelected()'):'')+button('Back to people','L.gm.backToPeople()','text-btn'));
};
L.views.groupMoneySaveGroup=()=>{
 const d=draft();if(!d)return L.views.groupMoneyHome();
 return shell('Save these people','Reuse the people, with fresh amounts each time.',field('Group name','gm-group-name',d.title||'','text','placeholder="e.g. Project team"')+`<div class="gm-people">${d.people.map(p=>`<div class="gm-person"><span class="gm-avatar">${L.icon('user',17)}</span><span class="gm-person-copy"><strong>${E(p.name)}</strong><small>${p.isOwner?'You are included once':'Group member'}</small></span></div>`).join('')}</div>`,button('Save group','L.gm.saveGroup()')+button('Back to people',"L.go('groupMoneyPeople')",'text-btn'));
};
L.views.groupMoneyRemoveGroup=()=>{
 const group=G.template(L.params.id);if(!group)return L.views.groupMoneyContacts();
 return shell('Remove saved group?',group.name,note('Only this saved list of people is removed. Existing splits, collections and their records stay unchanged.'),button('Remove group',`L.gm.removeGroup('${group.id}')`)+button('Keep group',"L.go('groupMoneyContacts')",'secondary'));
};
L.views.groupMoneyReview=()=>{
 const d=draft();if(!d)return L.views.groupMoneyHome();const result=preview(d);
 if(!result.ok)return shell('Check the details',result.error,'',button('Edit details',"L.gm.edit('people')"));
 const p=result.item,isSplit=d.type==='split',amount=isSplit?p.totalCents:p.targetCents;
 const summary=`<dl class="gm-summary">${isSplit?p.people.map(person=>row(person.name,M(person.amountCents))).join(''):row('Account','Separate group collection')+row('Deadline',date(p.deadline))+row('Members',p.people.map(person=>person.name).join(', '))}${row('Money movement','None when you create this')}</dl>`;
 const m=isSplit?null:G.mandateSummary(p),mandate=isSplit?'':`<div class="gm-mandate-preview"><h2>Your group’s mandate</h2><p><strong>${E(mandateLabel(m))}</strong></p>${m.approval==='named'?`<p>${E(approverNames(m))}</p>`:''}<p>Everyone accepts before contributions begin.</p><p>If cancelled, unspent money returns proportionally.</p>${button('View full mandate',"L.gm.openMandate()",'text-btn')}</div>`;
 return shell(isSplit?'Check everyone’s share':'Create a collection account','3 of 3 · '+d.title,`<div class="gm-hero"><span class="gm-overline">${isSplit?'Already paid':'Collection target'}</span><strong class="gm-amount">${M(amount)}</strong></div>${summary}${mandate}${note(isSplit?'Only your friends’ shares are requested. Your share is already included.':'By creating this collection, you accept its mandate. Other members accept before contributing. This preview creates a sample account only.')}`,button(isSplit?'Create split':'Agree & create collection','L.gm.create()')+button('Edit people',"L.gm.edit('people')",'secondary'));
};
L.views.groupMoneyDetail=()=>{
 const item=G.get(L.params.id),f=G.summary(item);if(!item||!f)return shell('Record unavailable','Open a saved split or collection.','',button('Your requests',"L.go('groupMoneyHome')"));
 const isSplit=item.type==='split',m=isSplit?null:G.mandateSummary(item),a=access(item),headline=isSplit?f.dueCents:f.balanceCents;
 const hero=`<div class="gm-hero"><span class="gm-status">${E(!isSplit&&m.legacy?'Earlier collection':!isSplit&&!m.valid?'Mandate needs review':!isSplit&&!m.allAccepted?'Awaiting mandate acceptance':statusLabels[f.status]||f.status)}</span><strong class="gm-amount">${M(headline)}</strong><p class="gm-caption">${isSplit?'still unpaid by friends':'Collection account balance · sample'}</p><div class="gm-progress" role="progressbar" aria-label="${isSplit?'Repayment':'Collection'} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(f.progress*100)}"><span style="width:${Math.round(f.progress*100)}%"></span></div></div>`;
 const meta=isSplit?`<p class="gm-overline">Expense ${M(item.totalCents)} · Your share ${M(f.ownerCents)}</p>`:`<p class="gm-overline">${M(f.grossReceivedCents)} contributed · ${M(item.targetCents)} target</p>${!a.isOrganiser?`<div class="gm-role-summary"><strong>Your role: ${roleLabel(item)}</strong><p>${a.isApprover?'Contribute and approve payouts.':'Contribute and follow the pot.'} Organised by ${E(item.ownerName)}.</p></div>`:''}${m.legacy?note('This earlier collection has no agreed mandate. Its history and sample refunds remain available.'):`<button type="button" class="gm-mandate-card" onclick="L.gm.openMandate('${item.id}')"><span><strong>Mandate</strong><small>${!m.valid?'Mandate needs review':m.allAccepted?E(mandateLabel(m)):m.acceptedCount+' of '+m.memberCount+' members accepted'}</small></span>${L.icon('chevron',18)}</button>`}<p class="gm-overline">${M(f.reservedCents)} reserved · ${M(f.availableCents)} available</p>`;
 const members=`<div class="gm-section-head"><h2>${isSplit?'Everyone’s share':'Contributions'}</h2><small>${item.people.length} people</small></div><div class="gm-people">${f.people.map(p=>`<div class="gm-person"><span class="gm-avatar" aria-hidden="true">${L.icon('user',17)}</span><div class="gm-person-copy"><strong>${E(memberName(p,item))}</strong><small>${isSplit?(p.isOwner?'Your part of the expense':p.dueCents===0?'Sample repayment recorded':M(p.dueCents)+' unpaid'):(p.refundedCents?M(p.refundedCents)+' sample refunded':p.receivedCents?'Sample contribution':'No contribution yet')}</small></div><strong class="gm-person-amount">${M(isSplit?p.amountCents:p.receivedCents)}</strong></div>`).join('')}</div>`;
 const stale=!f.sourceCurrent?note('The original payment changed. New sample repayments are paused.'):'',closed=['cancelled','refunded'].includes(f.status);
 if(isSplit){const actions=(f.canReceive?button('Share details',`L.gm.share('${item.id}')`):button('Copy summary',`L.copy(L.groupMoney.shareText('${item.id}'))`,'secondary'))+(f.canReceive?button('Try a sample repayment',`L.gm.showSample('${item.id}')`,'secondary'):'')+button('Details & activity',`L.go('groupMoneyRules',{id:'${item.id}'})`,'text-btn');return shell(item.title,'Expense split',hero+meta+stale+members+(closed?note('This record is closed. Its history stays available.') :''),actions);}
 const attention=(item.proposals||[]).map(p=>G.proposalSummary(item.id,p.id)).filter(p=>p&&['pending','ready','processing','failed'].includes(p.status));
 const attentionBody=!m.valid?'<p class="gm-quiet">Review the mandate before requesting a payout.</p>':!m.allAccepted?choice('Member acceptance needed',m.acceptedCount+' of '+m.memberCount+' accepted the mandate','user',`L.gm.openMandate('${item.id}')`):attention.length?attention.map(p=>payoutRow(item,p)).join(''):'<p class="gm-quiet">Nothing needs your attention.</p>';
 const attentionSection=`<section class="gm-payout-section" aria-labelledby="gm-attention-title"><div class="gm-section-head"><h2 id="gm-attention-title">Needs attention</h2>${attention.length?`<small>${attention.length}</small>`:''}</div>${attentionBody}</section>`;
 const activitySection=`<section class="gm-payout-section" aria-labelledby="gm-activity-title"><div class="gm-section-head"><h2 id="gm-activity-title">Activity</h2>${button('See all',`L.go('groupMoneyRules',{id:'${item.id}'})`,'text-btn')}</div>${collectionActivity(item)}</section>`;
 const contributions=`<details class="gm-contributions"><summary>Contributions · ${item.people.length} people</summary>${members}</details>`;
 const actions=(!m.legacy&&!m.allAccepted&&!closed?button('View mandate',`L.gm.openMandate('${item.id}')`):a.canPropose&&f.availableCents>0?button('Pay from collection',`L.gm.startProposal('${item.id}')`):'')+(f.canReceive?button('Try a sample contribution',`L.gm.showSample('${item.id}')`,'secondary'):'')+(m.valid?button('Payments & approvals',`L.gm.openPayments('${item.id}')`,'text-btn'):button('Details & activity',`L.go('groupMoneyRules',{id:'${item.id}'})`,'text-btn'));
 return shell(item.title,'Group collection account',hero+meta+attentionSection+activitySection+contributions+(closed?note('This collection is closed. Its history stays available.') :''),actions);
};
L.views.groupMoneySample=()=>{
 const d=store()?.sampleDraft,item=G.get(L.params.id),f=G.summary(item);if(!d||!item||d.itemId!==item.id||!f?.canReceive)return L.views.groupMoneyDetail();
 const people=f.people.filter(p=>item.type==='collection'?(access(item).isOrganiser||p.id==='self'):!p.isOwner&&p.dueCents>0);
 const body=`<p class="gm-note">Simulate a payment on this device. No one is contacted or charged, and your personal balance stays unchanged.</p><label class="field" for="gm-sample-person"><span>${item.type==='split'?'Repayment from':'Contribution from'}</span><select class="input" id="gm-sample-person" onchange="L.gm.samplePerson()">${people.map(p=>`<option value="${p.id}"${p.id===d.personId?' selected':''}>${E(memberName(p,item))}</option>`).join('')}</select></label>${field('Sample amount · GH₵','gm-sample-amount',d.amount,'number')}<dl class="gm-summary">${row(item.type==='split'?'Share still unpaid':'Remaining target',M(item.type==='split'?people.find(p=>p.id===d.personId)?.dueCents||0:f.remainingCents))}</dl>`;
 return shell('Try a sample payment','For '+item.title,body,button('Record sample payment','L.gm.recordSample()')+button('Back to '+(item.type==='split'?'split':'collection'),`L.gm.open('${item.id}')`,'text-btn'));
};
L.views.groupMoneyRules=()=>{
 const item=G.get(L.params.id),f=G.summary(item);if(!item||!f)return L.views.groupMoneyHome();
 const isSplit=item.type==='split',a=access(item),processing=isSplit?null:(item.proposals||[]).map(p=>G.proposalSummary(item.id,p.id)).find(p=>p?.status==='processing');
 const processingAction=processing?button('View processing payout',`L.go('groupMoneyProposalDetail',{id:'${item.id}',proposalId:'${processing.id}'})`):'';
 const processingNote=processing?note('A payout is processing. Its money remains reserved. Check its status before cancelling this collection or refunding contributions.'):'';
 if(!isSplit&&L.params.action&&!a.isOrganiser)return shell('Collection activity',item.title,note('The organiser manages cancellation and refunds under the mandate. You can follow all collection activity here.'),button('Back to collection',`L.gm.open('${item.id}')`));
 if(processing&&['cancel','refund'].includes(L.params.action))return shell('Payment is processing',item.title,processingNote,processingAction+button('Back to collection',`L.gm.open('${item.id}')`,'secondary'));
 if(L.params.action==='cancel')return shell('Cancel '+(isSplit?'this split?':'this collection?'),'Your records will stay available.',note(isSplit?'New repayments will stop. Repayments already recorded stay in the history.':'New contributions will stop and pending proposals will be cancelled. Unspent sample money can then return to original sample sources in proportion to contributions. Money already spent cannot be refunded.'),button('Confirm cancellation',`L.gm.cancel('${item.id}')`)+button('Keep it open',`L.gm.open('${item.id}')`,'secondary'));
 if(L.params.action==='refund'){
  const quote=G.refundPreview(item.id);if(!quote.ok)return shell('Review the refund',item.title,note(E(quote.error)),button('Back to collection',`L.gm.open('${item.id}')`));
  return shell('Return unspent money?','For '+item.title,`<div class="gm-hero"><strong class="gm-amount">${M(quote.totalCents)}</strong><p class="gm-caption">back to original sample sources</p></div><dl class="gm-summary">${row('Total to return',M(quote.totalCents))}${row('Back to your Everyday money',M(quote.personalCents))}${row('Other original sources',M(quote.totalCents-quote.personalCents))}</dl>${note('Unspent money returns in proportion to contributions. Your linked contribution is credited back to your Everyday money; other members’ entries return to their original sample sources. No real money is sent.')}`,button('Record sample refunds',`L.gm.refund('${item.id}')`)+button('Go back',`L.gm.open('${item.id}')`,'secondary'));
 }
 const name=id=>{const person=item.people.find(p=>p.id===id);return person?memberName(person,item):'Member';};
 const payoutRecords=(item.disbursements||[]).flatMap(d=>{
  const recipient=d.receipt?.recipient||d.recipient||'Approved payout',pastFailures=(d.attempts||[]).filter(attempt=>attempt.status==='failed').map(attempt=>({date:attempt.resolvedAt||attempt.date,label:'Sample payout attempt failed · '+recipient,detail:M(d.totalCents)+' not paid · No debit · Attempt '+attempt.number,proposalId:d.proposalId,kind:'payout-failed'}));
  if(d.status==='confirmed')return [...pastFailures,{date:d.confirmedAt||d.updatedAt||d.date,label:'Sample payout paid · '+recipient,detail:d.reference||d.id,amount:-d.totalCents,proposalId:d.proposalId,kind:'payout-paid'}];
  if(d.status==='processing')return [...pastFailures,{date:d.updatedAt||d.date,label:'Payout processing · '+recipient,detail:M(d.totalCents)+' reserved · Not paid',proposalId:d.proposalId,kind:'payout-processing'}];
  return pastFailures.length?pastFailures:d.status==='failed'?[{date:d.updatedAt||d.date,label:'Sample payout failed · '+recipient,detail:M(d.totalCents)+' not paid · No debit',proposalId:d.proposalId,kind:'payout-failed'}]:[];
 });
 const records=[...(item.payments||[]).filter(p=>p.status==='confirmed').map(p=>({date:p.date,label:'Sample payment · '+name(p.personId),amount:p.amountCents,kind:'contribution'})),...(item.refunds||[]).map(r=>({date:r.date,label:'Sample refund · '+name(r.personId),amount:-r.amountCents,kind:'refund'})),...(item.mandateAcceptances||[]).map(v=>({date:v.date,label:(v.sample?'Sample mandate acceptance · ':'Mandate accepted · ')+name(v.personId),kind:'mandate-acceptance'})),...(item.proposals||[]).flatMap(p=>[{date:p.createdAt,label:'Payout requested · '+p.recipient,detail:M(p.totalCents)+' requested for approval',proposalId:p.id,kind:'payout-request'},...(p.approvals||[]).map(v=>({date:v.date,label:(v.sample?'Sample approval · ':'Payout approved · ')+name(v.personId),detail:p.recipient,proposalId:p.id,kind:'payout-approval'})),...(p.declines||[]).map(v=>({date:v.date,label:(v.sample?'Sample decline · ':'Declined by ')+name(v.personId),detail:p.recipient,proposalId:p.id,kind:'payout-decline'})),...(p.cancelledAt?[{date:p.cancelledAt,label:(item.activity||[]).some(e=>e.type==='proposal-cancelled'&&e.proposalId===p.id)?'Payout request withdrawn':'Payout request cancelled',detail:p.recipient+' · No payment from this request',proposalId:p.id,kind:'payout-withdrawal'}]:[])]),...payoutRecords].sort((left,right)=>Date.parse(right.date)-Date.parse(left.date));
 const activity=records.length?records.map(r=>{const content=`<div class="gm-person-copy"><strong>${E(r.label)}</strong><small>${E(timeLabel(r.date))}${r.detail?' · '+E(r.detail):''}</small></div>${r.amount===undefined?'':`<strong class="gm-person-amount">${r.amount<0?'−':'+'}${M(Math.abs(r.amount))}</strong>`}`;return r.proposalId?`<button type="button" class="gm-person gm-history-row" data-activity-kind="${r.kind}" onclick="L.go('groupMoneyProposalDetail',{id:'${item.id}',proposalId:'${r.proposalId}'})">${content}</button>`:`<div class="gm-person" data-activity-kind="${r.kind}">${content}</div>`;}).join(''):note('No sample payments recorded yet.');
 const rule=isSplit?'This is an expense you already paid. Your share is included. Requests and recorded sample repayments do not change your personal balance.':'This collection account is separate from Everyday money. Its mandate governs sample payments and refunds. Bank enforcement is required before this can hold real funds.';
 const actions=(processing?processingAction:((isSplit||a.canCancel)&&!['cancelled','refunded'].includes(f.status)?button('Cancel '+(isSplit?'split':'collection'),`L.go('groupMoneyRules',{id:'${item.id}',action:'cancel'})`,'secondary'):'')+(!isSplit&&a.isOrganiser&&f.status==='cancelled'&&f.balanceCents>0?button('Try sample refunds',`L.go('groupMoneyRules',{id:'${item.id}',action:'refund'})`):''))+button('Back to '+(isSplit?'split':'collection'),`L.gm.open('${item.id}')`,'text-btn');
 return shell('Details & activity',item.title,note(rule)+`<dl class="gm-summary">${isSplit?row('Original expense',M(item.totalCents))+row('Your share',M(f.ownerCents))+row('Sample repayments',M(f.receivedCents)):row('Account reference',item.collectionAccount?.reference||'Earlier collection')+row('Target',M(item.targetCents))+row('Deadline',date(item.deadline))+row('Contributed',M(f.grossReceivedCents))+row('Sample spending',M(f.spentCents))+row('Collection balance',M(f.balanceCents))}${row('Created',new Date(item.createdAt).toLocaleDateString('en-GH'))}${row('Reference',item.id)}${item.sourceTxId?row('Original payment',item.sourceTxId):''}</dl>${processingNote}<div class="gm-section-head"><h2>Activity</h2></div>${activity}`,actions);
};
L.views.groupMoneyMandate=()=>{
 const id=L.params.id,item=id?G.get(id):null,m=id?G.mandateSummary?.(item):draftMandate();if(!m)return L.views.groupMoneyHome();
 if(!m.valid&&!m.legacy)return shell('Mandate needs review',item?.title||'',note('The saved mandate or its members changed. Contributions, approvals and payments are unavailable. Its existing history remains available.'),button('Back to collection',`L.gm.open('${id}')`));
 if(m.legacy)return shell('Earlier collection','No mandate was recorded.',note('Its existing history and sample refunds remain available. A new collection starts with a mandate accepted by every member.'),button('Back to collection',`L.gm.open('${id}')`));
 const people=`<div class="gm-section-head"><h2>Members</h2><small>${m.memberCount} people</small></div><div class="gm-people">${m.people.map(p=>`<div class="gm-person"><span class="gm-avatar">${L.icon(p.accepted?'check':'user',17)}</span><span class="gm-person-copy"><strong>${E(memberName(p,item))}</strong><small>${p.isOwner?'Organiser · ':''}${p.isApprover?'Approver':'Contributor'}${id?' · '+(p.accepted?(p.id==='self'?'Accepted by you':'Sample acceptance recorded'):'Awaiting acceptance'):''}</small></span></div>`).join('')}</div>`;
 const closed=id&&['cancelled','refunded'].includes(G.summary(item)?.status);
 const actions=id?(!closed&&access(item).isOrganiser?button('Try member view',`L.gm.openMember('${id}')`):'')+button('Share mandate',`L.gm.share('${id}')`,'secondary')+button('Changes or ending this collection',`L.go('groupMoneyLifecycle',{id:'${id}'})`,'text-btn')+button('Back to collection',`L.gm.open('${id}')`,'text-btn'):button('Back to review',"L.go('groupMoneyReview')");
 return shell('Collection mandate',item?.title||draft()?.title||'',fullMandate(m)+people+(id?note('This sample record includes simulated member activity. Sharing includes the mandate and member list; it does not invite or contact anyone.'):note('The same mandate is included whenever you share this collection’s details.')),actions);
};
L.views.groupMoneyLifecycle=()=>{
 const item=G.get(L.params.id),f=G.summary(item),m=G.mandateSummary(item);if(!item||item.type!=='collection'||!f||!m)return L.views.groupMoneyHome();
 const a=access(item),processing=(item.disbursements||[]).some(p=>p.status==='processing'),closed=['cancelled','refunded'].includes(f.status);
 const body=`<h2>Keep the agreed rules intact</h2>${note('Members, approvers and rules stay fixed for this collection. A new group needs a new collection and fresh acceptance from every member. No one can change the mandate alone.')}<dl class="gm-summary">${row('Current balance',M(f.balanceCents))}${row('Reserved for payouts',M(f.reservedCents))}${row('Group size',item.people.length+' of 9 people in this preview')}</dl>${note(processing?'A payout is processing. Follow its confirmed result before cancellation or refunds.':a.isOrganiser?'You can resolve current payouts, then cancel and return unspent money under the accepted mandate. Earlier activity and completed spending stay recorded.':'Ask the organiser to resolve payouts and return unspent money under the mandate. You can follow the decisions, contributions and receipts here.')}<details><summary>Using a different group</summary><p>Use a new collection for different members or approval rules. Each collection has its own funds and mandate; creating another never moves money from this one. This preview supports up to 9 people, including its organiser.</p></details>`;
 const actions=button('View payouts',`L.gm.openPayments('${item.id}')`)+(a.isOrganiser&&!closed&&!processing?button('Review cancellation',`L.go('groupMoneyRules',{id:'${item.id}',action:'cancel'})`,'secondary'):'')+(a.isOrganiser&&f.status==='cancelled'&&f.balanceCents>0&&!processing?button('Review unspent refunds',`L.go('groupMoneyRules',{id:'${item.id}',action:'refund'})`,'secondary'):'')+(a.isOrganiser?button('Start a new collection','L.gm.startCollection()','text-btn'):'')+button('Get help',`L.go('supportCase',{reference:'${item.id}',kind:'Group collection'})`,'text-btn')+button('Back to collection',`L.gm.open('${item.id}')`,'text-btn');
 return shell('Collection changes',item.title,body,actions);
};
L.taskSheet?.register?.('groupMoneyLifecycle',{family:'records',treatment:'detail',label:'Collection changes'});
const proposalStateLabel=s=>({pending:'Awaiting approval',ready:'Ready to pay',approved:'Ready to pay',processing:'Processing',paid:'Paid · sample',executed:'Paid · sample',failed:'Payment failed',declined:'Approval threshold not met',expired:'Request expired',cancelled:'Request cancelled',invalid:'Details changed'}[s]||s);
const timeLabel=value=>{const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toLocaleString('en-GH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Date unavailable';};
const payoutSteps=status=>{const stopped=['cancelled','declined','expired','invalid'].includes(status),step=stopped?0:status==='request'?1:status==='pending'?2:3;return `<ol class="gm-payout-steps" aria-label="Payout stages${stopped?' · Request closed':''}">${['Request','Approve','Release'].map((label,i)=>{const complete=stopped?i===0:i+1<step||status==='paid';return `<li${i+1===step?' aria-current="step"':''}${complete?' class="is-complete"':stopped&&i===1?' class="is-stopped"':''}><span aria-hidden="true">${i+1}</span><strong>${label}</strong></li>`;}).join('')}</ol>`;};
const evidenceMarkup=(p,itemId,proposalId)=>p?.attachment?`<div class="gm-payout-evidence"><span>Supporting file</span><strong>${E(p.attachment.name)} <small>${Math.ceil(p.attachment.size/1024)} KB</small></strong>${itemId&&proposalId?button('Download supporting file',`L.collectionEvidence.download('${itemId}','${proposalId}')`,'text-btn'):''}</div>`:'';
const proposalFacts=(p,{itemId,proposalId,balanceAfterCents}={})=>`<dl class="gm-summary">${row('Recipient',p.recipient)}${row('Purpose',p.purpose)}${row('Amount',M(p.amountCents))}${row('Sample fee',M(p.feeCents||0))}${row('Total from collection',M(p.totalCents))}${Number.isSafeInteger(balanceAfterCents)?row('Balance after payout',M(balanceAfterCents)):''}${p.supportingReference?row('Supporting reference',p.supportingReference):''}</dl>${evidenceMarkup(p,itemId,proposalId)}`;
const payoutRow=(item,p)=>`<button type="button" class="gm-item gm-payout-row" onclick="L.go('groupMoneyProposalDetail',{id:'${item.id}',proposalId:'${p.id}'})"><span class="gm-choice-copy"><strong>${E(p.recipient)}</strong><small>${E(proposalStateLabel(p.status))}${['pending','ready'].includes(p.status)?' · '+p.approvalCount+' of '+p.requiredApprovals+' approvals':''}</small></span><span class="gm-trailing">${M(p.totalCents)}${L.icon('chevron',16)}</span></button>`;
const collectionActivity=item=>{
 const rows=[...(item.payments||[]).filter(p=>p.status==='confirmed').map(p=>({date:p.date,title:memberName(item.people.find(m=>m.id===p.personId)||{id:p.personId,name:'Member'},item)+' contributed',detail:'Sample contribution',amount:p.amountCents})),...(item.proposals||[]).map(p=>G.proposalSummary(item.id,p.id)).filter(p=>p&&!['pending','ready','processing'].includes(p.status)).map(p=>({date:p.disbursement?.updatedAt||p.disbursement?.date||p.paidAt||p.createdAt,title:p.recipient,detail:proposalStateLabel(p.status),amount:p.paid?-p.totalCents:null,proposalId:p.id}))].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,3);
 return rows.length?`<div class="gm-activity-list">${rows.map(r=>r.proposalId?`<button type="button" class="gm-activity-row" onclick="L.go('groupMoneyProposalDetail',{id:'${item.id}',proposalId:'${r.proposalId}'})"><span><strong>${E(r.title)}</strong><small>${E(r.detail)} · ${E(timeLabel(r.date))}</small></span>${r.amount!==null?`<strong>${r.amount<0?'−':'+'}${M(Math.abs(r.amount))}</strong>`:L.icon('chevron',16)}</button>`:`<div class="gm-activity-row"><span><strong>${E(r.title)}</strong><small>${E(r.detail)} · ${E(timeLabel(r.date))}</small></span><strong>+${M(r.amount)}</strong></div>`).join('')}</div>`:'<p class="gm-quiet">Contributions and completed decisions will appear here.</p>';
};
const proposalDecisions=(item,m,p,s)=>`<div class="gm-section-head"><h2>Member decisions</h2><small>${s.approvalCount} of ${s.requiredApprovals} approvals</small></div><div class="gm-people">${m.people.map(member=>{const approved=(s.approvedPersonIds||[]).includes(member.id),declined=(s.declinedPersonIds||[]).includes(member.id),local=member.id===(access(item).localPersonId||'self');return `<div class="gm-person"><span class="gm-avatar" aria-hidden="true">${L.icon(approved?'check':declined?'close':'user',17)}</span><span class="gm-person-copy"><strong>${E(memberName(member,item))}</strong><small>${!member.isApprover?'Contributor · can follow this payout':approved?(local?'Approved by you':'Sample approval recorded'):declined?(local?'Declined by you':'Sample decline recorded'):'Awaiting decision'}</small></span></div>`;}).join('')}</div>`;
const receiptMarkup=(item,p,s)=>{
 const r=s.receipt||s.disbursement?.receipt,d=s.disbursement;if(!d)return '';
 const reference=r?.reference||d.reference||d.id,paid=s.status==='paid',balance=r?.balanceAfterCents;
 const approvers=(r?.approvers||[]).filter(a=>a.decision==='approved').map(a=>a.name).join(', ');
 return `<section class="gm-payout-receipt" aria-label="${paid?'Payout receipt':'Payout reference'}"><div class="gm-section-head"><h2>${paid?'Payout receipt':'Payment reference'}</h2></div><dl class="gm-summary">${row('Reference',reference)}${row('From collection',r?.collectionName||item.title)}${row('Collection account',r?.collectionAccountReference||item.collectionAccount?.reference||'Sample collection account')}${row('Recipient',r?.recipient||p.recipient)}${row('Purpose',r?.purpose||p.purpose)}${row('Amount',M(r?.amountCents??p.amountCents))}${row('Sample fee',M(r?.feeCents??p.feeCents??0))}${row('Total from collection',M(r?.totalCents??p.totalCents))}${paid?row('Paid',timeLabel(r?.paidAt||p.paidAt||d.date))+row('Balance after this payout',Number.isSafeInteger(balance)?M(balance):'Not recorded in this earlier sample'):row('Status',proposalStateLabel(s.status))}${approvers?row('Approved by',approvers):''}${r?.supportingReference?row('Supporting reference',r.supportingReference):''}</dl>${evidenceMarkup(r||p,item.id,p.id)}</section>`;
};
L.views.groupMoneyMember=()=>{
 const {id,proposalId}=L.params,item=G.get(id),m=G.mandateSummary?.(item);if(!item||!m?.valid)return L.views.groupMoneyMandate();if(!access(item).isOrganiser)return L.views.groupMoneyDetail();
 const member=m.people.find(p=>p.id===L.params.personId);if(!member)return L.views.groupMoneyMandate();
 const p=proposalId?G.proposal(id,proposalId):null,ps=p?G.proposalSummary(id,proposalId):null,q=p?decisionReview(id,proposalId,member.id):null,reviewed=!p||decisionCurrent(q,p);
 const personName=p=>p.isOwner?(item.ownerName||'Organiser'):p.name;
 const selector=`<label class="field" for="gm-member-person"><span>Preview as member</span><select class="input" id="gm-member-person" onchange="L.gm.memberPerson()">${m.people.map(person=>`<option value="${person.id}"${person.id===member.id?' selected':''}>${E(personName(person))}</option>`).join('')}</select></label>`;
 const selectedMandate={...m,people:m.people.map(person=>({...person,name:personName(person)}))};
 const already=p&&((ps.approvedPersonIds||[]).includes(member.id)||(ps.declinedPersonIds||[]).includes(member.id)),active=ps&&['pending','ready'].includes(ps.status);
 const body=note('Member preview only. These actions simulate a member’s decision on this device. No one is contacted.')+selector+`<div class="gm-role-summary"><strong>${member.isApprover?'Approver':'Contributor'}</strong><p>${member.isApprover?'Can contribute and approve or decline payouts.':'Can contribute and follow the pot. Payment approval belongs to the named approvers.'}</p></div>`+(p?`<div class="gm-mandate-summary"><h2>${E(p.recipient)}</h2><p>${ps.approvalCount} of ${ps.requiredApprovals} approvals · ${E(proposalStateLabel(ps.status))}</p></div>${proposalFacts(p,{itemId:id,proposalId})}`:'')+fullMandate(selectedMandate)+`<p class="gm-note">${E(personName(member))}: ${member.accepted?'mandate accepted':'mandate acceptance required'}${p&&already?' · decision already recorded':''}</p>`+(!reviewed?note('These payout details changed. Return to the payout and review them again.'):'');
 let action='';
 if(!member.accepted&&!['cancelled','refunded'].includes(item.status))action=button(member.isOwner?'Accept mandate':'Simulate acceptance',`L.gm.acceptMember('${id}','${member.id}')`);
 else if(p&&active&&!already&&member.isApprover&&reviewed){const local=member.id===(access(item).localPersonId||'self'),final=!!p.rail&&ps.approvalCount+1===ps.requiredApprovals;action=button(final?(local?'Approve & submit payment':'Simulate final approval & submit'):local?'Approve payout':'Simulate member approval',`L.gm.approveMember('${id}','${proposalId}','${member.id}')`)+button(local?'Decline payout':'Simulate member decline',`L.gm.openDecline('${id}','${proposalId}','${member.id}')`,'secondary')+(final?note('This approval completes the mandate and submits this exact sample payment automatically.'):'');}
 const back=p?`L.go('groupMoneyProposalDetail',{id:'${id}',proposalId:'${proposalId}'})`:`L.gm.openMandate('${id}')`;
 return shell('Try member view',item.title,body,action+button(p?'Back to payout':'Back to mandate',back,'text-btn'));
};
L.views.groupMoneyPayments=()=>{
 const item=G.get(L.params.id),m=G.mandateSummary?.(item),f=G.summary(item);if(!item||!m||!f)return L.views.groupMoneyHome();if(!m.valid)return L.views.groupMoneyMandate();const a=access(item);
 const records=(item.proposals||[]).map(p=>G.proposalSummary(item.id,p.id)).filter(Boolean).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
 const closed=['cancelled','refunded'].includes(f.status),empty=closed?'This collection is closed. Its payout history stays here.':!m.allAccepted?'Requests can start after every member accepts the mandate.':!a.isOrganiser?'Payout requests will appear here for you to follow.':f.availableCents<=0?'Contributions are needed before requesting a payout.':'Request a payout for the group to approve.';
 const body=`<div class="gm-hero"><span class="gm-overline">Available for payouts</span><strong class="gm-amount">${M(f.availableCents)}</strong><p class="gm-caption">${M(f.reservedCents)} reserved · ${M(f.spentCents)} paid in samples</p></div>`+(records.length?records.map(p=>payoutRow(item,p)).join(''):'<div class="gm-empty"><h2>No payout requests yet</h2><p>'+empty+'</p></div>')+note(!m.allAccepted?'Every member must accept the mandate before spending begins.':'Requests reserve their amount for up to 48 hours while approvers decide. Processing payments keep their reservation until the result is known.');
 return shell('Payouts',item.title,body,(a.canPropose&&f.availableCents>0&&!closed?button('Pay from collection',`L.gm.startProposal('${item.id}')`):'')+button('Back to collection',`L.gm.open('${item.id}')`,'secondary'));
};
L.views.groupMoneyProposal=()=>{
 const d=proposalDraft(),item=G.get(L.params.id),f=G.summary(item);if(!d||!item||d.itemId!==item.id||!f||!access(item).canPropose)return L.views.groupMoneyPayments();
 const input=(label,key,max,placeholder)=>`<label class="field" for="gm-proposal-${key}"><span>${label}</span><input class="input" id="gm-proposal-${key}" name="gm-proposal-${key}" value="${E(d[key]||'')}" maxlength="${max}" autocomplete="off" placeholder="${placeholder}" oninput="L.gm.capture()"></label>`;
 const attachment=`<details class="gm-supporting-proof"><summary>${d.attachment?'Supporting proof · File added':(d.supportingReference||'').trim()?'Supporting proof · Reference added':'Supporting proof · optional'}</summary>${input('Invoice or supporting reference (optional)','supportingReference',240,'e.g. Invoice INV-024')}<label class="field" for="gm-proposal-attachment"><span>Attach an invoice or receipt</span><input class="input" id="gm-proposal-attachment" type="file" accept="image/png,image/jpeg,application/pdf" onchange="L.collectionEvidence.add(this)"></label><p class="gm-quiet">PNG, JPG or PDF · Up to 200 KB · Saved only in this preview.</p>${d.attachment?`<p class="gm-proof-selected"><strong>${E(d.attachment.name)}</strong> · ${Math.ceil(d.attachment.size/1024)} KB</p>${button('Remove supporting file','L.collectionEvidence.remove()','text-btn')}`:''}</details>`;
 const body=payoutSteps('request')+`<p class="gm-quiet">Paid directly from this collection after its mandate is met.</p>`+input('Sample recipient','recipient',100,'e.g. Ama’s Transport')+input('Purpose','purpose',160,'e.g. Minibus deposit')+field('Amount · GH₵','gm-proposal-amount',d.amount,'number','placeholder="0.00"')+attachment+`<p class="gm-overline">${M(f.availableCents)} available · No sample fee</p><p class="gm-quiet">The recipient name is entered by you. No bank or wallet lookup is performed in this preview.</p>`;
 return shell('Request payout',item.title,body,button('Review payout','L.gm.reviewProposal()')+button('Back to payouts',`L.gm.openPayments('${item.id}')`,'text-btn'));
};
L.views.groupMoneyProposalReview=()=>{
 const d=proposalDraft(),item=G.get(L.params.id),m=G.mandateSummary?.(item),f=G.summary(item);if(!d||!item||d.itemId!==item.id||!m||!f)return L.views.groupMoneyPayments();
 const amount=G.cents(d.amount);if(amount===null)return L.views.groupMoneyProposal();
 const p={recipient:d.recipient.trim(),purpose:d.purpose.trim(),supportingReference:(d.supportingReference||'').trim(),attachment:d.attachment,amountCents:amount,feeCents:0,totalCents:amount},current=amount<=f.availableCents;
 const body=payoutSteps('request')+proposalFacts(p,{balanceAfterCents:current?f.balanceCents-amount:undefined})+note(`${E(mandateLabel(m))}. Approvals cover these exact details and expire after 48 hours. Requesting approval reserves ${M(amount)}; it does not pay the recipient.`)+(!current?note('The available collection money changed. Edit this request before continuing.'):'');
 return shell('Review payout',item.title,body,(current?button('Request approval','L.gm.createProposal()'):'')+button('Edit payout',`L.go('groupMoneyProposal',{id:'${item.id}'})`,'secondary'));
};
L.views.groupMoneyProposalDetail=()=>{
 const {id,proposalId}=L.params,item=G.get(id),m=G.mandateSummary?.(item),p=G.proposal(id,proposalId),s=G.proposalSummary(id,proposalId);if(!item||!m||!p||!s)return L.views.groupMoneyHome();
 const a=access(item),local=a.localPersonId||'self',ownDecision=(s.approvedPersonIds||[]).includes(local)||(s.declinedPersonIds||[]).includes(local),active=['pending','ready'].includes(s.status),q=decisionReview(id,proposalId,local),reviewed=decisionCurrent(q,p);
 const header=`<div class="gm-mandate-summary"><span class="gm-status">${E(proposalStateLabel(s.status))}</span><h2>${s.status==='processing'?'Payment is processing':s.status==='paid'?'Payment confirmed':s.status==='failed'?'Payment failed':s.approvalCount+' of '+s.requiredApprovals+' approvals'}</h2><p>${E(m.valid?mandateLabel(m):'Mandate needs review')}</p></div>`;
 const statusNote=s.status==='processing'?'The payout has been submitted in this sample. Its amount stays reserved. Check the sample status before trying another payment.':s.status==='paid'?'The sample recipient was paid directly from the collection account. Every member can view this receipt.':s.status==='failed'?'No sample money left this collection. An eligible retry uses this same payment reference and requires a fresh review and PIN.':s.status==='declined'?'The required number of approvals can no longer be reached. This request is closed and its reservation is released.':s.status==='expired'?'This request expired. Its reservation is released; the decisions remain in the history.':s.status==='cancelled'?'This request is closed. Its decisions remain in the history.':active?'Every approval applies to these exact details. Silence does not count. Decisions close '+timeLabel(p.expiresAt)+'.':'These payout details or the mandate changed. Payment is unavailable.';
 const decisions=proposalDecisions(item,m,p,s),decisionSection=['processing','paid','failed'].includes(s.status)?`<details class="gm-payout-decisions"><summary>Member decisions · ${s.approvalCount} of ${s.requiredApprovals} approvals</summary>${decisions}</details>`:decisions;
 const body=payoutSteps(s.status)+header+(s.disbursement?receiptMarkup(item,p,s):proposalFacts(p,{itemId:id,proposalId,balanceAfterCents:s.valid?G.summary(item).balanceCents-p.totalCents:undefined}))+decisionSection+note(E(statusNote))+(!reviewed?note('Payout details changed while you were reviewing them. Read the latest details before deciding.'):'')+(L.testMode&&s.status==='processing'&&a.isOrganiser?`<details><summary>Sample outcome controls</summary><label class="field" for="gm-payout-settlement"><span>When checking status</span><select class="input" id="gm-payout-settlement"><option>Completed</option><option>Pending</option><option>Failed</option></select></label></details>`:'');
 const finalApproval=!!p.rail&&s.status==='pending'&&s.approvalCount+1===s.requiredApprovals&&!ownDecision&&a.canApprove&&reviewed;
 const decisionActions=s.status==='pending'&&!ownDecision&&a.canApprove&&reviewed?button(finalApproval?'Approve & submit payment':'Approve payout',`L.gm.approveOwn('${id}','${proposalId}')`)+button('Decline payout',`L.gm.openDecline('${id}','${proposalId}')`,'secondary'):'';
 const canCheck=a.isOrganiser||!!p.rail&&item.invitedSample&&a.canView;
 const releaseAction=s.availableToExecute&&a.canExecute?button('Release payment',`L.gm.executeProposal('${id}','${proposalId}')`):s.canRetry&&a.canExecute?button('Review retry',`L.gm.executeProposal('${id}','${proposalId}')`):s.status==='processing'&&canCheck?button('Check sample status',`L.gm.checkPayoutStatus('${id}','${proposalId}','${s.attemptId||s.disbursement?.attemptId||''}','${s.reference||s.disbursement?.reference||''}')`):'';
 const actions=(!reviewed&&active?button('Review latest payout',`L.gm.refreshProposalReview('${id}','${proposalId}')`):releaseAction+decisionActions)+(active&&a.isOrganiser?button('Try member view',`L.gm.openMember('${id}',null,'${proposalId}')`,'secondary'):'')+(a.isOrganiser&&reviewed&&['pending','ready','failed'].includes(s.status)?button('Withdraw request',`L.gm.openWithdrawal('${id}','${proposalId}')`,'text-btn'):'')+button('Back to payouts',`L.gm.openPayments('${id}')`,'text-btn');
 return shell('Payout request',item.title,body+(finalApproval?note('Your approval completes the mandate and submits this exact payment automatically.'):!p.rail?note('Earlier payout request · This saved request uses a separate organiser release after approval.'):'')+(!a.isOrganiser&&!a.isApprover?note('Contributor view · Follow the request, member decisions and receipt. Named approvers make the decisions.'):s.status==='ready'&&!a.isOrganiser?note('The mandate is met. Waiting for the organiser to release payment.'):''),actions);
};
L.views.groupMoneyProposalDecline=()=>{
 const {id,proposalId,personId}=L.params,item=G.get(id),p=G.proposal(id,proposalId),s=G.proposalSummary(id,proposalId),q=declineReview;
 const valid=authenticated()&&q&&q.state===L.state&&q.account===owner()&&q.id===id&&q.proposalId===proposalId&&q.personId===personId&&decisionCurrent(q,p)&&['pending','ready'].includes(s?.status);
 if(!item||!p||!s)return L.views.groupMoneyHome();
 const body=proposalFacts(p)+note(valid?'Your decline will be visible to the group. Other named approvers can still approve while the mandate’s threshold remains possible.':'Open the payout and review its latest details before making a decision.')+(q?.sample?note('Sample member decision · No one is contacted.'):'');
 return shell('Decline this payout?',item.title,body,(valid?button(q.sample?'Record sample decline':'Decline payout','L.gm.declineProposal()'):'')+button('Keep request',`L.go('groupMoneyProposalDetail',{id:'${id}',proposalId:'${proposalId}'})`,'secondary'));
};
L.views.groupMoneyPayoutWithdraw=()=>{
 const {id,proposalId}=L.params,item=G.get(id),p=G.proposal(id,proposalId),s=G.proposalSummary(id,proposalId),q=withdrawReview;
 const valid=authenticated()&&q&&q.state===L.state&&q.account===owner()&&q.id===id&&q.proposalId===proposalId&&decisionCurrent(q,p)&&access(item).isOrganiser&&['pending','ready','failed'].includes(s?.status);
 if(!item||!p||!s)return L.views.groupMoneyHome();
 return shell('Withdraw payout request?',item.title,proposalFacts(p)+note(valid?'No money will be paid from this request. Its decisions stay in the activity. To change the payment details, create a new request for fresh approvals.':'This request is no longer available to withdraw.'),(valid?button('Withdraw request','L.gm.withdrawProposal()'):'')+button('Keep request',`L.go('groupMoneyProposalDetail',{id:'${id}',proposalId:'${proposalId}'})`,'secondary'));
};
L.views.groupMoneyPayoutRelease=()=>{
 const {id,proposalId}=L.params,item=G.get(id),p=G.proposal(id,proposalId),s=G.proposalSummary(id,proposalId),r=payoutReview;
 const valid=authenticated()&&r&&r.state===L.state&&r.account===owner()&&r.id===id&&r.proposalId===proposalId&&Date.parse(r.quote.expiresAt)>Date.now()&&access(item).canExecute&&(s?.availableToExecute||s?.canRetry);
 if(!item||!p||!s)return L.views.groupMoneyHome();
 if(!valid)return shell('Review payout again',item.title,note('This release review is no longer current. Return to the payout to review the exact details and available collection money.'),button('Back to payout',`L.go('groupMoneyProposalDetail',{id:'${id}',proposalId:'${proposalId}'})`));
 const q=r.quote,body=payoutSteps('release')+proposalFacts({...p,...q},{itemId:id,proposalId,balanceAfterCents:q.balanceAfterCents})+`<dl class="gm-summary">${row('From collection',item.title)}${row('Reference',q.reference)}</dl>`+note('Release this exact payout from the collection account. Your personal balance is not used.')+`<label class="field" for="gm-payout-pin"><span>Your Lumo PIN</span><input class="input" id="gm-payout-pin" name="gm-payout-pin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="current-password" placeholder="6 digits" required></label>`+(L.testMode?`<details><summary>Sample outcome controls</summary><label class="field" for="gm-payout-outcome"><span>Submission result</span><select class="input" id="gm-payout-outcome"><option selected>Pending</option><option>Completed</option><option>Failed</option></select></label></details>`:'');
 return `<section class="gm-page">${L.header(s.canRetry?'Review retry':'Release payment',item.title)}<form class="gm-form" onsubmit="event.preventDefault();L.gm.releasePayout()"><div class="gm-body">${body}${error}</div><div class="gm-actions"><button type="submit" class="primary">Release payment</button>${button('Cancel',`L.go('groupMoneyProposalDetail',{id:'${id}',proposalId:'${proposalId}'})`,'secondary')}</div></form>${boundary}</section>`;
};
const invitationStatus=s=>({pending:'Invitation awaiting your decision',accepted:'Joined',declined:'Declined',expired:'Invitation expired',closed:'Collection closed',unavailable:'Invitation unavailable'}[s]||s);
const invitationRole=s=>s.role==='approver'?'Approver':'Contributor';
const invitationPeople=m=>`<div class="gm-section-head"><h2>Members & roles</h2><small>${m.memberCount} people</small></div><div class="gm-people">${m.people.map(p=>`<div class="gm-person"><span class="gm-avatar">${L.icon(p.isApprover?'check':'user',17)}</span><span class="gm-person-copy"><strong>${E(p.id==='self'?'You':p.name)}</strong><small>${p.isOwner?'Organiser · ':''}${p.isApprover?'Approver':'Contributor'}</small></span></div>`).join('')}</div>`;
L.views.groupMoneyInvitations=()=>{
 const records=(G.invitations?.()||[]).map(i=>G.invitationSummary(i.id)).filter(Boolean);
 const list=records.map(s=>choice(s.title,`${invitationRole(s)} · ${invitationStatus(s.status)} · ${s.organiserName}`,'user',`L.gm.openInvitation('${s.id}')`)).join('');
 const empty='<div class="gm-empty">'+L.icon('user',30)+'<h2>No invitations yet</h2><p>Invitations to join a collection will appear here.</p></div>';
 return shell('Invitations','Read the mandate before joining a pot.',list||empty,button('Try an invitation',"L.go('groupMoneySampleInvitations')")+button('Your collections',"L.go('groupMoneyList',{filter:'collection'})",'secondary'));
};
L.views.groupMoneySampleInvitations=()=>{
 const body=note('Sample invitations on this device. No one is contacted. Joining loads GH₵600 of sample contributions and a GH₵150 Lumo payout with explicit sample organiser authorisation. The final required approval submits that sample payout automatically.')+`<div class="gm-choices">${choice('Join as an approver','Contribute, read the mandate and approve a payment.','check',"L.gm.sampleInvitation('approver')")}${choice('Join as a contributor','Contribute and follow the pot’s activity.','user',"L.gm.sampleInvitation('contributor')")}</div><details><summary>Other invitation states</summary>${button('Try an expired invitation',"L.gm.sampleInvitation('expired')",'secondary')}${button('Try a closed collection',"L.gm.sampleInvitation('closed')",'secondary')}</details>`;
 return shell('Try an invitation','Explore either role with sample money.',body,button('Back to invitations',"L.go('groupMoneyInvitations')",'secondary'));
};
L.views.groupMoneyInvitation=()=>{
 const id=L.params.id,s=G.invitationSummary?.(id);if(!s)return shell('Invitation unavailable','Open an invitation from your list.','',button('Invitations',"L.go('groupMoneyInvitations')"));
 let quote=invitationReviews.get(id);if(!quote||quote.account!==owner()||quote.state!==L.state){quote=invitationSnapshot(s);invitationReviews.set(id,quote);}
 const stale=quote.fingerprint!==s.fingerprint||quote.version!==s.mandate?.version,role=invitationRole(s),valid=s.valid&&s.mandate?.valid;
 const summary=`<div class="gm-invitation-role"><span class="gm-status">${E(invitationStatus(s.status))}</span><strong>Your role: ${role}</strong><p>${s.role==='approver'?'Contribute and approve payments.':'Contribute and follow the pot.'}</p></div>`;
 const named=s.mandate?.people?.filter(p=>p.isApprover).map(p=>p.id==='self'?'You':p.name).join(', ');
 const mandate=valid?`<div class="gm-invitation-mandate"><h2>${s.mandate.requiredApprovals} of ${s.mandate.approverCount||s.mandate.approverIds?.length||s.mandate.memberCount} named approvers</h2><p>${E(named||approverNames(s.mandate))}</p>${button('View full mandate',`L.go('groupMoneyInvitationMandate',{id:'${id}'})`,'text-btn')}</div>`:note('The invitation or its mandate is unavailable. No membership or payment authority has been granted.');
 const metadata=`<dl class="gm-summary">${row('Target',M(s.targetCents))}${row('Collection deadline',date(s.deadline))}</dl>`;
 const stateNote=stale?note('This invitation changed while you were reviewing it. Read the latest mandate before deciding.'):s.status==='declined'?note('You declined this invitation. You have not joined the pot or accepted payment authority.'):s.status==='expired'?note('This invitation has expired. It cannot be accepted.'):s.status==='closed'?note('The organiser closed this collection. Joining and contributions are unavailable.'):s.status==='accepted'?note('You have joined this sample collection. Open it to follow the balance and activity.'):note('This example loads sample contributions and a payment proposal after you accept. No real invitation or payment is sent.');
 const actions=s.status==='accepted'&&s.collectionId&&valid?button('Open collection',`L.gm.open('${s.collectionId}')`):stale&&valid?button('Review latest invitation',`L.gm.refreshInvitation('${id}')`):s.canAccept&&valid?button('Accept & join',`L.gm.acceptInvitation('${id}')`)+button('Decline invitation',`L.go('groupMoneyInvitationDecline',{id:'${id}'})`,'secondary'):'';
 return shell(s.title,'Invitation from '+s.organiserName,summary+mandate+metadata+stateNote,actions+button('Back to invitations',"L.go('groupMoneyInvitations')",'text-btn'));
};
L.views.groupMoneyInvitationMandate=()=>{
 const id=L.params.id,s=G.invitationSummary?.(id);if(!s?.valid||!s.mandate?.valid)return L.views.groupMoneyInvitation();
 return shell('Collection mandate',s.title,fullMandate(s.mandate)+invitationPeople(s.mandate)+note('By accepting, you agree to your role, these approvers, the required number of approvals, and the cancellation and refund rules.'),button('Back to invitation',`L.go('groupMoneyInvitation',{id:'${id}'})`));
};
L.views.groupMoneyInvitationDecline=()=>{
 const id=L.params.id,s=G.invitationSummary?.(id);if(!s?.canAccept)return L.views.groupMoneyInvitation();
 return shell('Decline this invitation?',s.title,note(`You will not join as ${s.role==='approver'?'an approver':'a contributor'}. The invitation will stay in your history. No contribution is made and no payment authority is accepted.`),button('Decline invitation',`L.gm.declineInvitation('${id}')`)+button('Keep invitation',`L.go('groupMoneyInvitation',{id:'${id}'})`,'secondary'));
};
const beforeNavigate=L.beforeNavigate;
L.beforeNavigate=function(route,params={},...args){
 captureProposal();
 if(route!=='groupMoneyPayoutRelease'||!payoutReview||params.id!==payoutReview.id||params.proposalId!==payoutReview.proposalId)clearPayoutReview();
 if(route!=='groupMoneyProposalDecline')declineReview=null;
 if(route!=='groupMoneyPayoutWithdraw')withdrawReview=null;
 return beforeNavigate?.call(this,route,params,...args);
};
document.addEventListener?.('visibilitychange',()=>{if(document.hidden){clearPayoutReview();declineReview=null;withdrawReview=null;}});
for(const [route,treatment,label]of [['groupMoneyHome','selection','Collect'],['groupMoneyList','selection','Splits & collections'],['groupMoneySplit','form','Split an expense'],['groupMoneySource','selection','Choose a payment'],['groupMoneyCollection','form','Collect together'],['groupMoneyPeople','edit','Choose people'],['groupMoneyContacts','selection','Choose people'],['groupMoneySaveGroup','form','Save group'],['groupMoneyRemoveGroup','confirmation','Remove saved group'],['groupMoneyReview','confirmation','Review details'],['groupMoneyDetail','detail','Shared money'],['groupMoneySample','edit','Sample payment'],['groupMoneyRules','detail','Details & activity'],['groupMoneyMandate','detail','Collection mandate'],['groupMoneyMember','confirmation','Try member view'],['groupMoneyPayments','selection','Payments & approvals'],['groupMoneyProposal','form','Propose a payment'],['groupMoneyProposalReview','confirmation','Review proposal'],['groupMoneyProposalDetail','confirmation','Payout request'],['groupMoneyProposalDecline','confirmation','Decline payout'],['groupMoneyPayoutRelease','form','Release payment'],['groupMoneyPayoutWithdraw','confirmation','Withdraw payout request'],['groupMoneyApprovers','edit','Choose approvers'],['groupMoneyInvitations','selection','Invitations'],['groupMoneySampleInvitations','selection','Try an invitation'],['groupMoneyInvitation','confirmation','Collection invitation'],['groupMoneyInvitationMandate','detail','Collection mandate'],['groupMoneyInvitationDecline','confirmation','Decline invitation']])L.taskSheet?.register?.(route,{family:'records',treatment,label});
})();
