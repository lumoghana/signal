const clone=value=>JSON.parse(JSON.stringify(value));
const terminal=new Set(['INVALID_INPUT','NOT_FOUND','REASON_REQUIRED','IDEMPOTENCY_CONFLICT','STALE_APPROVAL','APPROVAL_EXPIRED','ALREADY_DECIDED','SELF_APPROVAL_FORBIDDEN','FORBIDDEN','MFA_REQUIRED','STAFF_REQUIRED','AUTH_REQUIRED','SESSION_REVOKED']);

/** Original-request retries stay bound to the staff actor and immutable details. */
export function createApprovalConsole({rpc,el,button,field,input,area,select,openDialog,closeDialog,toast,reload,getStaff,storage,now=Date.now}){
 let owner='',pending=new Map(),journalUnavailable=false;
 const journalKey=()=>`lumo.admin.approval.pending.v1:${owner}`;
 const journal=()=>storage===undefined?globalThis.sessionStorage:storage;
 function readJournal(){
  pending=new Map();journalUnavailable=false;
  try{const target=journal();if(!target){journalUnavailable=true;return;}const saved=JSON.parse(target.getItem(journalKey())||'null');
   if(!saved||saved.version!==1||saved.actor!==owner||!Array.isArray(saved.entries))return;
   for(const [key,value]of saved.entries.slice(0,100))if(typeof key==='string'&&value&&['approvals.create','approvals.decide','approvals.cancel'].includes(value.command)&&value.payload&&typeof value.payload.requestId==='string'&&Number.isFinite(value.savedAt)&&value.savedAt<=now()&&now()-value.savedAt<26*60*60*1000)pending.set(key,value);
  }catch{journalUnavailable=true;}
 }
 function saveJournal(){try{const target=journal();if(!target){journalUnavailable=true;return;}if(pending.size)target.setItem(journalKey(),JSON.stringify({version:1,actor:owner,entries:[...pending]}));else target.removeItem(journalKey());}catch{journalUnavailable=true;}}
 const actor=()=>String(getStaff()?.id||getStaff()?.userId||getStaff()?.user_id||'');
 function context(){const current=actor();if(current!==owner){owner=current;readJournal();}return current;}
 function form(title,subtitle,fields,controls,key,build,label){
  const by=context(),root=el('form'),error=el('div',{'aria-live':'polite'}),submit=button(label,null,'btn primary');submit.type='submit';
  const original=pending.get(key);if(original){for(const [name,control]of Object.entries(controls)){if(original.payload[name]!==undefined)control.value=original.payload[name];control.disabled=true;}submit.textContent='Check original request';}
  root.append(...fields,original&&el('p',{class:'form-help'},'Original pending operation: '+original.command+' · '+(original.payload.decision||original.payload.action||'withdraw')+' · '+original.payload.requestId),error,el('div',{class:'form-actions'},button('Back to records',closeDialog,'btn'),submit));
  let busy=false;
  root.addEventListener('submit',async event=>{
   event.preventDefault();if(busy||!by||actor()!==by)return;if(!pending.has(key)&&!root.reportValidity())return;
   let request=pending.get(key);if(!request){if(pending.size>=100){error.replaceChildren(el('div',{class:'form-error',role:'alert'},'Review the existing pending requests before starting another.'));return;}request={...clone(build()),savedAt:now()};pending.set(key,request);saveJournal();}
   busy=true;submit.disabled=true;error.replaceChildren();
   try{
    await rpc(request.command,clone(request.payload));if(actor()!==by)return;
    pending.delete(key);saveJournal();closeDialog();toast('The original request has been recorded.');reload();
   }catch(caught){
    if(actor()!==by)return;
    if(terminal.has(caught?.code)){pending.delete(key);saveJournal();for(const control of Object.values(controls))control.disabled=false;submit.textContent=label;error.replaceChildren(el('div',{class:'form-error',role:'alert'},caught.message));}
    else{for(const control of Object.values(controls))control.disabled=true;submit.textContent='Check original request';error.replaceChildren(el('div',{class:'form-error',role:'alert'},'The outcome is not confirmed. Check this original request before starting another.',el('div',{class:'mono'},request.payload.requestId),journalUnavailable&&el('p',{},'This browser could not save the request reference. Keep this tab open and check the current records before restarting.')));}
   }finally{busy=false;if(actor()===by)submit.disabled=false;}
  });
  openDialog(title,subtitle,root);return root;
 }
 function requestForm(record={}){
  const action=select([['account.suspend','Restrict customer account'],['account.restore','Restore customer account'],['session.revoke','Revoke customer sessions'],['payment_link.disable','Disable payment link']],record.action||'account.suspend'),entityId=input(record.entityId||''),caseId=input(record.caseId||''),reason=area();entityId.maxLength=36;caseId.maxLength=36;
  const controls={action,entityId,caseId,reason};
  return form('Request a controlled action','A different colleague reviews the captured target state. Requests expire after 24 hours.',[
   field('Action',action),field('Affected record ID',entityId),field('Support case ID',caseId),field('Reason and evidence',reason),
   el('p',{class:'form-help'},'The current target and its version are saved with this request. A later restriction or target change makes the earlier approval stale. Unknown outcomes keep their original reference.')
  ],controls,'create',()=>({command:'approvals.create',payload:{action:action.value,entityId:entityId.value.trim(),caseId:caseId.value.trim(),reason:reason.value.trim(),requestId:crypto.randomUUID()}}),'Submit for independent review');
 }
 function decisionForm(record,decision){
  const action=decision==='cancel'?'cancel':['approve','approved'].includes(decision)?'approve':'reject',reason=area();
  if(record.status!=='pending'||!Number.isSafeInteger(record.revision)||record.revision<1||action==='approve'&&(record.stale||record.expired)){
   const message=el('p',{class:'form-help'},'This request is no longer current. Refresh its details and propose a new action if needed.');openDialog('Refresh this request','Current target state is required before a decision.',message);return message;
  }
  return form(action==='cancel'?'Withdraw this request?':action==='approve'?'Approve the current request?':'Reject this request?',
   action==='cancel'?'Withdrawal preserves the original request and audit.':'Your decision is bound to this exact request revision and target state.',[
    el('p',{class:'form-help'},record.action+' · '+record.entityId),el('p',{class:'form-help'},'Request revision '+record.revision+' · Target revision '+record.targetRevision),field('Decision reason',reason)
   ],{reason},'decision:'+record.id,()=>({command:action==='cancel'?'approvals.cancel':'approvals.decide',payload:{id:record.id,expectedRevision:record.revision,requestId:crypto.randomUUID(),...(action!=='cancel'?{decision:action}:{}),reason:reason.value.trim()}}),action==='cancel'?'Withdraw request':action==='approve'?'Approve request':'Reject request');
 }
 return {requestForm,decisionForm,reset(){owner='';pending=new Map();}};
}
