const FINANCE_ROLES=new Set(['super_admin','supervisor','finance','risk']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function amountInPesewas(value){
 const match=/^(0|[1-9][0-9]{0,7})(?:\.([0-9]{1,2}))?$/.exec(String(value).trim());
 if(!match)throw Error('Enter a positive cedi amount with up to two decimal places.');
 const amount=Number(match[1])*100+Number((match[2]||'').padEnd(2,'0'));
 if(!Number.isSafeInteger(amount)||amount<1)throw Error('Enter an amount greater than zero.');
 return amount;
}
export function financialDecision(value){if(!['approve','reject'].includes(value))throw Error('Choose approve or reject.');return value;}
export function createFinancialConsole({rpc,el,button,field,money,date,badge,openDialog,closeDialog,toast,reload,getStaff}){
 const role=()=>getStaff()?.role||'',actor=()=>getStaff()?.id||getStaff()?.userId||'',canWrite=()=>FINANCE_ROLES.has(role());
 const input=(value='',attrs={})=>el('input',{class:'input',required:true,value,...attrs});
 const area=(value='')=>el('textarea',{class:'input',required:true,minLength:3,maxLength:2000,value,rows:3});
 const select=(values,value)=>el('select',{class:'input',required:true},...(value===''?[el('option',{value:'',disabled:true,selected:true},'Choose an option')]:[]),...values.map(v=>el('option',{value:Array.isArray(v)?v[0]:v,selected:(Array.isArray(v)?v[0]:v)===value},Array.isArray(v)?v[1]:v)));
 const note=value=>el('p',{class:'data-note'},value);
 const row=(label,value)=>el('div',{class:'quick-row'},el('span',{},label),el('strong',{},value??'—'));
 const uuid=value=>{const text=String(value||'').trim();if(!UUID.test(text))throw Error('Use the full record ID from the linked support record.');return text;};
 const dueInput=value=>{const d=value?new Date(value):new Date(Date.now()+3600000);return input(new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16),{type:'datetime-local'});};
 // A retry after an unknown response keeps its original immutable payload.
 function form(title,subtitle,fields,build,label='Save record'){
  const originActor=actor(),form=el('form'),error=el('div',{'aria-live':'polite'}),submit=button(label,null,'btn primary');submit.type='submit';let submitted=null,busy=false;
  form.append(...fields,error,el('div',{class:'form-actions'},button('Cancel',closeDialog),submit));
  form.addEventListener('submit',async event=>{event.preventDefault();if(busy||!form.reportValidity())return;
   if(actor()!==originActor){error.replaceChildren(note('This form belongs to a previous sign-in. Close it and open the current record.'));return;}
   busy=true;submit.disabled=true;error.replaceChildren();
   try{if(!submitted)submitted=build();const result=await rpc(submitted.command,submitted.payload);if(actor()!==originActor)return;closeDialog();toast(result?.record?.status==='approved_pending_execution'?'Approved amount recorded. Awaiting the original merchant refund.':'Recorded with its original reference.');await reload();}
   catch(e){if(actor()!==originActor)return;error.replaceChildren(el('div',{class:'form-error',role:'alert'},e.message||'The outcome could not be confirmed. Retry the original request.'));
    if(['INVALID_INPUT','REASON_REQUIRED','EVIDENCE_REQUIRED','INVALID_REFUND','REFUND_EXCEEDS_PAYMENT','CASE_LINK_REQUIRED','INVALID_GUEST_OUTCOME'].includes(e.code)||!submitted){submitted=null;}else{for(const n of form.querySelectorAll('input,textarea,select'))n.disabled=true;submit.textContent='Retry original request';error.append(note('The original details are retained. Check the queue before creating another request.'),button('Refresh current queue',()=>{closeDialog();reload();},'btn'));}
   }finally{busy=false;submit.disabled=false;}
  });openDialog(title,subtitle,form);return form;
 }
 async function owners(control){
  const owner=actor();try{const d=await rpc('staff.directory',{pageSize:500});if(actor()!==owner||!control.isConnected)return;
   const entries=(d.rows||[]).filter(s=>FINANCE_ROLES.has(s.role));if(!entries.length)return;
   const list=el('datalist',{id:'financial-owner-'+crypto.randomUUID()},...entries.map(s=>el('option',{value:s.id||s.userId},s.name||s.displayName||s.id)));control.setAttribute('list',list.id);control.after(list);
  }catch{/* The backend still verifies a manually entered active owner ID. */}
 }
 function ownerField(value){const control=input(value|| (canWrite()?actor():''),{maxLength:36,placeholder:'Active finance or risk colleague ID'});queueMicrotask(()=>owners(control));return control;}
 function refundForm(prefill={}){
  const entity=input(prefill.entityId||prefill.originalPaymentId||'',{maxLength:36}),caseId=input(prefill.caseId||'',{maxLength:36}),amount=input('',{inputMode:'decimal',placeholder:'0.00'}),reason=area(),requestId=crypto.randomUUID();
  return form('Request a bounded refund','A different authorised colleague reviews the exact amount and original merchant payment.',[
   field('Original merchant payment ID',entity),field('Linked support case ID',caseId),field('Refund amount in GHS',amount),field('Reason and evidence',reason),
   note('Approval does not move money. The merchant executes the approved amount through the original refund journey. Finance then verifies the posted refund journal here. A transfer or unrelated payment cannot be refunded by this action.')
  ],()=>({command:'financial.refund.create',payload:{entityId:uuid(entity.value),caseId:uuid(caseId.value),amount:amountInPesewas(amount.value),reason:reason.value.trim(),requestId}}),'Submit exact amount for review');
 }
 function decisionForm(record,decision){const reason=area();financialDecision(decision);return form(decision==='approve'?'Approve this refund amount?':'Reject this refund request?',
  'Your decision is recorded separately from merchant execution.',[row('Approved amount',money(record.amount)),row('Original payment',record.originalPaymentId),field('Decision reason',reason)],
  ()=>({command:'financial.refund.decide',payload:{id:record.id,decision,reason:reason.value.trim()}}),decision==='approve'?'Approve exact amount':'Reject refund');}
 function completeRefund(record){const journal=input('',{maxLength:36}),evidence=area(),reason=area();return form('Verify an executed merchant refund',
  'This checks an existing immutable refund. It does not create another payment.',[row('Approved amount',money(record.amount)),row('Original payment',record.originalPaymentId),field('Posted refund journal ID',journal),field('Execution evidence',evidence),field('Review reason',reason),note('The original payment, exact amount, destination, approval time and one-time journal binding are verified. An unposted or unrelated refund leaves this request awaiting merchant execution.')],
  ()=>({command:'financial.refund.complete',payload:{id:record.id,journalId:uuid(journal.value),evidence:evidence.value.trim(),reason:reason.value.trim()}}),'Verify posted refund');}
 async function refundDetail(record){const wrap=el('div'),currentActor=actor();let d;try{d=await rpc('financial.refund.get',{id:record.id});}catch(e){
  if(actor()===currentActor)wrap.append(note(e.code==='NOT_FOUND'?'Historical unbounded request. It cannot be completed through the controlled refund workflow. Create a new bounded request for any remaining original amount.':e.message));return wrap;}
  if(actor()!==currentActor)return wrap;const r=d.record;if(!r)return wrap;
  wrap.append(row('Bounded refund amount',money(r.amount)),row('Original merchant payment',r.originalPaymentId),row('Execution state',r.status==='approved_pending_execution'?'Awaiting original merchant execution':r.status),note('This workflow verifies the merchant’s posted refund. Approval and verification do not move money.'));
  if(r.refundReference)wrap.append(row('Verified refund reference',r.refundReference),row('Verified at',date(r.completedAt)));
  if(canWrite()&&r.status==='pending'&&r.requestedBy!==actor())wrap.append(el('div',{class:'action-row'},button('Approve exact amount',()=>decisionForm(r,'approve'),'btn primary'),button('Reject request',()=>decisionForm(r,'reject'),'btn danger')));
  if(canWrite()&&r.status==='approved_pending_execution')wrap.append(button('Verify posted merchant refund',()=>completeRefund(r),'btn primary'));
  return wrap;
 }
 async function openRefund(record){const content=el('div',{},note('Loading the exact approved amount…')),owner=actor();openDialog('Controlled refund','Original-reference review and completion.',content);const details=await refundDetail(record);if(actor()===owner&&content.isConnected)content.replaceChildren(details);}
 function guestForm(record,existing=null){
  const guestId=record.guestId||record.id,caseId=input(existing?.caseId||record.caseId||'',{maxLength:36}),owner=ownerField(existing?.ownerId),due=dueInput(existing?.dueAt),outcome=select([['approve','Explicit test provider approval'],['decline','Explicit test provider decline'],['cancel','Explicit test provider cancellation']],''),evidence=area(),reason=area(),confirm=el('input',{type:'checkbox',required:true}),requestId=crypto.randomUUID();
  return form('Propose a sandbox guest outcome','A different finance or risk colleague must review this result.',[
   row('Original guest attempt',guestId),row('Original reference',record.providerReference||record.reference),field('Linked guest support case ID',caseId),field('Accountable owner ID',owner,'Choose an active finance or risk colleague.'),field('Review due, device local time',due),field('Explicit sandbox provider result',outcome),field('Result evidence',evidence),field('Reason',reason),field('I am explicitly simulating this provider outcome',confirm),
   note('An expired timer or lost browser does not prove failure. This action uses the original attempt, amount and reference. Live providers are excluded. The existing posting or reversal safeguards decide the final sandbox result.')
  ],()=>({command:'financial.guest.propose',payload:{guestId,caseId:uuid(caseId.value),ownerId:uuid(owner.value),dueAt:new Date(due.value).toISOString(),outcome:outcome.value,evidence:evidence.value.trim(),reason:reason.value.trim(),sandboxConfirmed:confirm.checked,requestId,...(existing?{id:existing.id,expectedRevision:existing.revision}:{})}}),'Submit outcome for independent review');
 }
 function guestDecision(record,decision){const evidence=area(),reason=area();return form(decision==='approve'?'Confirm this explicit sandbox outcome?':'Reject the proposed outcome?',
  decision==='approve'?'This applies only the stored proposal to the original test payment.':'The original unknown payment stays in the unresolved queue.',[
   row('Original reference',record.reference),row('Proposed outcome',record.proposal?.outcome),row('Original amount',money(record.proposal?.amount)),field('Review evidence',evidence),field('Decision reason',reason),note('Approval may post test funds or record an explicit sandbox reversal. It never connects to a bank or MoMo provider.')
  ],()=>({command:'financial.guest.resolve',payload:{id:record.id,expectedRevision:record.revision,decision:financialDecision(decision),evidence:evidence.value.trim(),reason:reason.value.trim()}}),decision==='approve'?'Apply reviewed sandbox result':'Reject proposal');}
 function exceptionForm(record=null){const owner=ownerField(record?.ownerId),due=dueInput(record?.dueAt),kind=select([['ledger','Ledger mismatch'],['provider_statement','Statement evidence'],['other','Other exception']],record?.kind||'ledger'),reference=input(record?.reference||'',{maxLength:160}),summary=input(record?.summary||'',{minLength:3,maxLength:600}),caseId=input(record?.caseId||'',{maxLength:36}),evidence=area(record?.evidence||''),reason=area(),resolution=area(record?.resolution||''),status=select([['open','Open'],['investigating','Investigating'],['waiting_provider','Waiting for provider'],...(!record||record.kind!=='guest_outcome'?[['resolved','Resolved with evidence']]:[])],record?.status||'open'),requestId=crypto.randomUUID();resolution.required=false;
  const fields=record?[row('Original reference',record.reference),field('Status',status)]:[field('Exception type',kind),field('Original reference',reference),field('What needs investigating?',summary),field('Linked support case ID',caseId)];
  fields.push(field('Accountable owner ID',owner),field('Review due, device local time',due),field('Evidence',evidence),...(record?[field('Resolution, required when closing',resolution)]:[]),field('Reason for this record',reason),note('This queue records ownership and review evidence. It does not change ledger entries or confirm external settlement. Unknown guest outcomes require independent outcome review.'));
  return form(record?'Update reconciliation exception':'Record reconciliation exception','Keep the original reference and an accountable next step.',fields,()=>({command:record?'financial.exceptions.update':'financial.exceptions.create',payload:{...(record?{id:record.id,expectedRevision:record.revision,status:status.value,resolution:resolution.value.trim()}:{kind:kind.value,reference:reference.value.trim(),summary:summary.value.trim(),caseId:uuid(caseId.value),requestId}),ownerId:uuid(owner.value),dueAt:new Date(due.value).toISOString(),evidence:evidence.value.trim(),reason:reason.value.trim()}}));
 }
 function openException(record){const body=el('div',{},row('Reference',record.reference),row('Owner',record.owner),row('Review due',date(record.dueAt)),row('Status',record.status),el('p',{class:'form-help'},record.summary),el('p',{class:'form-help'},record.evidence));
  if(record.resolution)body.append(note(record.resolution));
  if(canWrite()&&record.status!=='resolved'){
   body.append(button('Update owner, due time and evidence',()=>exceptionForm(record),'btn'));
   if(record.kind==='guest_outcome'&&record.status==='awaiting_review'&&String(record.proposal?.proposedBy||record.createdBy)!==actor())body.append(el('div',{class:'action-row'},button('Confirm proposed sandbox result',()=>guestDecision(record,'approve'),'btn primary'),button('Reject proposal',()=>guestDecision(record,'reject'),'btn danger')));
   if(record.kind==='guest_outcome'&&record.status!=='awaiting_review')body.append(button('Propose a reviewed result',()=>guestForm({id:record.guestId,providerReference:record.reference},record),'btn primary'));
  }
  openDialog('Reconciliation exception','Original-reference evidence and accountable ownership.',body);
 }
 async function renderQueue(main){
  if(!FINANCE_ROLES.has(role())&&role()!=='auditor')return;
  const wrap=el('section',{class:'panel section-spacer'},el('div',{class:'panel-header'},el('div',{},el('h2',{},'Owned reconciliation queue'),el('p',{class:'form-help'},'Original references, accountable owners and evidence.')))),content=el('div',{class:'panel-body'});wrap.append(content);main.append(wrap);let page=1;
  async function load(){const owner=actor();content.replaceChildren(note('Loading accountable records…'));try{const data=await rpc('financial.exceptions.list',{page,pageSize:25});if(actor()!==owner)return;content.replaceChildren();
   if(canWrite())content.append(el('div',{class:'action-row'},button('Record exception',()=>exceptionForm(),'btn primary'),button('Request bounded refund',()=>refundForm(),'btn')));
   if(data.refunds?.length){content.append(el('h3',{},'Refund authorisation and execution'));for(const r of data.refunds)content.append(el('div',{class:'quick-row'},el('div',{},el('strong',{},money(r.amount)),el('p',{class:'form-help'},r.status==='approved_pending_execution'?'Awaiting original merchant execution':'Independent review required')),button('Open refund',()=>openRefund(r),'btn small')));}
   content.append(el('h3',{},'Reconciliation exceptions'));
   if(!data.rows?.length)content.append(note('No exceptions recorded on this page. Live provider matching remains unavailable.'));
   for(const r of data.rows||[])content.append(el('div',{class:'quick-row'},el('div',{},el('strong',{},r.reference),el('p',{class:'form-help'},r.owner+' · Due '+date(r.dueAt)),badge(r.status),r.overdue&&note('Review overdue')),button('Inspect',()=>openException(r),'btn small')));
   const paging=el('div',{class:'form-actions'},note('Page '+page+' · '+data.total+' recorded exceptions'));
   if(page>1)paging.append(button('Previous',()=>{page--;load();},'btn small'));if(page*25<data.total)paging.append(button('Next',()=>{page++;load();},'btn small'));content.append(paging,note('External bank and MoMo statement feeds are not connected. Manual evidence does not certify provider settlement. Unknown guest outcomes remain unresolved until an explicit reviewed result.'));
  }catch(e){if(actor()===owner)content.replaceChildren(el('div',{class:'form-error',role:'alert'},e.message),button('Refresh queue',load,'btn'));}}
  await load();
 }
 return {renderQueue,refundForm,completeRefund,decisionForm,guestForm,refundDetail};
}
