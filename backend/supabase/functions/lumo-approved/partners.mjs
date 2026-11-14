import {applyAction, migrateState} from './domain/model.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const fail=(code,message)=>Object.assign(new Error(message),{code});
const actorId=identity=>identity?.userId||identity;
const rowsOf=snapshot=>Array.isArray(snapshot?.partners)?snapshot.partners:[];
const field=(row,camel,snake)=>row?.[camel]??row?.[snake];
const ownerOf=row=>field(row,'ownerUserId','owner_user_id');
const partnerOf=row=>field(row,'partnerUserId','partner_user_id');
const boxFor=(state,id)=>(state.boxes||[]).find(box=>box.id===id);
const invitationFor=(box,id)=>box?.pendingProtection?.invitationId===id?box.pendingProtection:box?.protection?.invitationId===id?box.protection:null;
const normalized=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(normalized).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+normalized(value[key])).join(',')+'}';

/** Canonical partner responses are overlaid only into their owner's original private domain state. */
export function overlayPartners(state,rows,actor){
 for(const row of rows||[]){
  if(ownerOf(row)!==actor)continue;
  const canonical=row.state||{};
  if(row.kind==='initial'){
   const invitation=canonical.invitation;if(!invitation)continue;
   state.boxPartnerInvitations||=[];const at=state.boxPartnerInvitations.findIndex(item=>item.id===row.id);
   if(at<0)state.boxPartnerInvitations.push(copy(invitation));else state.boxPartnerInvitations[at]=copy(invitation);
  }else if(row.kind==='release'){
   const box=boxFor(state,canonical.boxId),request=canonical.request;if(!box||!request)continue;
   box.protectionRequests||=[];const at=box.protectionRequests.findIndex(item=>item.id===row.id);
   if(at<0)box.protectionRequests.unshift(copy(request));else box.protectionRequests[at]=copy(request);
  }else if(row.kind==='protection'){
   const box=boxFor(state,canonical.boxId),invitation=canonical.invitation;if(!box||!invitation)continue;
   const existing=invitationFor(box,row.id);
   // Acceptance runs the original transition, including invalidating older release approvals.
   if(existing?.status==='invited'&&['active','declined'].includes(invitation.status)){
    const decision=invitation.status==='active'?'accepted':'declined';
    const result=applyAction(state,'respondBoxPartnerInvite',{boxId:box.id,invitationId:row.id,decision});
    if(!result.ok)throw fail('PARTNER_CHANGED',result.message);
   }else if(existing){Object.assign(existing,copy(invitation));}
  }
 }
 return state;
}

/** Only owner-authorized original transitions produce canonical revisions. */
export async function collectPartnerChanges(before,state,snapshot,actor,repo){
 const existing=new Map(rowsOf(snapshot).filter(row=>ownerOf(row)===actor).map(row=>[row.id,row]));
 const candidates=[];
 for(const invitation of state.boxPartnerInvitations||[])candidates.push({id:invitation.id,kind:'initial',phone:invitation.partner?.phone,state:{invitation:copy(invitation),ownerName:state.profile?.name||''}});
 for(const box of state.boxes||[]){
  for(const [slot,invitation]of[['protection',box.protection],['pendingProtection',box.pendingProtection]]){
   if(!invitation?.invitationId||!invitation.partner)continue;
   candidates.push({id:invitation.invitationId,kind:'protection',phone:invitation.partner.phone,state:{boxId:box.id,boxName:box.name,slot,invitation:copy(invitation),ownerName:state.profile?.name||''}});
  }
  for(const request of box.protectionRequests||[]){
   const old=existing.get(request.id);const protection=old?.state?.protection||box.protection;
   if(!protection?.partner?.phone)continue;
   candidates.push({id:request.id,kind:'release',phone:protection.partner.phone,state:{boxId:box.id,boxName:request.boxName||box.name,protection:copy(protection),request:copy(request),ownerName:state.profile?.name||''}});
  }
 }
 const activeInvitations=new Set(candidates.filter(row=>row.kind==='protection').map(row=>row.id));
 for(const old of existing.values())if(old.kind==='protection'&&!activeInvitations.has(old.id)&&old.state?.invitation&&!['superseded','cancelled','declined'].includes(old.state.invitation.status))candidates.push({id:old.id,kind:'protection',phone:old.state.invitation.partner?.phone,state:{...copy(old.state),invitation:{...copy(old.state.invitation),status:'superseded'}}});
 const changes=[];
 for(const candidate of candidates){
  const old=existing.get(candidate.id);
  if(old&&normalized(old.state)===normalized(candidate.state))continue;
  let partnerUserId=partnerOf(old);
  if(!partnerUserId){const resolved=await repo.resolve(candidate.phone);partnerUserId=resolved?.recipient?.userId||resolved?.recipient?.id;if(!resolved?.ok||!partnerUserId)throw fail('PARTNER_NOT_FOUND','Ask a registered Lumo account to be your accountability partner.');}
  if(partnerUserId===actor)throw fail('INVALID_PARTNER','Choose another Lumo account as your accountability partner.');
  changes.push({id:candidate.id,expectedRevision:old?.revision||0,kind:candidate.kind,ownerUserId:actor,partnerUserId,state:candidate.state});
 }
 return changes;
}

/** Neither owner's balance nor unrelated goals, transactions or private IDs enter this view. */
export function publicPartnerInbox(rows,actor){
 return (rows||[]).filter(row=>partnerOf(row)===actor).map(row=>{
  const state=row.state||{},initial=row.kind==='initial',invitation=state.invitation||{},request=state.request||{};
  let status=initial||row.kind==='protection'?invitation.status:request.status;
  const expiresAt=invitation.expiresAt||request.expiresAt||'';if(expiresAt&&Number.isFinite(Date.parse(expiresAt))&&Date.parse(expiresAt)<=Date.now()&&['awaiting-partner','accepted','code-issued'].includes(status))status='expired';
  const result={id:row.id,kind:row.kind,revision:row.revision,ownerUserId:ownerOf(row),ownerName:state.ownerName||'A Lumo customer',boxName:state.boxName||invitation.boxName||'',status:status||'pending',expiresAt,requestKind:request.kind||'invitation'};
  if(row.kind==='release'&&request.kind==='withdrawal')result.amount=request.amount;
  if(row.kind==='release'&&request.kind==='change-partner')result.newPartnerName=request.newPartner?.name||'';
  if(initial&&status==='accepted'&&/^\d{6}$/.test(invitation.code||''))result.code=invitation.code;
  if(row.kind==='release'&&status==='code-issued'&&/^\d{6}$/.test(request.code||''))result.code=request.code;
  return result;
 });
}

/** Codes are delivered to the bound partner only, including after a snapshot or failed owner action. */
export function scrubPartnerSecrets(state){
 for(const invitation of state.boxPartnerInvitations||[]){delete invitation.code;delete invitation.lastIssuedCode;delete invitation.verifiedCode;}
 for(const box of state.boxes||[]){delete box.lastPartnerCode;delete box.releaseCode;delete box.partnerInviteCode;for(const request of box.protectionRequests||[])delete request.code;}
 return state;
}

/** The authenticated partner can answer only their own canonical invitation or exact release request. */
export async function partnerRespond({body,identity,repo}){
 const actor=actorId(identity);if(typeof body.id!=='string'||!['accepted','declined'].includes(body.decision))throw fail('INVALID_INPUT','Choose whether to accept or decline this request.');
 for(let retry=0;retry<3;retry++){
  const loaded=await repo.service('partner.read',{id:body.id});
  if(!loaded?.ok)throw fail(loaded?.code||'PARTNER_UNAVAILABLE','This partner request is unavailable.');
  const row=loaded.row;
  if(!row||partnerOf(row)!==actor||ownerOf(row)===actor)throw fail('FORBIDDEN','Open the request in the invited partner’s account.');
  const state=copy(loaded.ownerState||{});migrateState(state);overlayPartners(state,loaded.partners||[row],ownerOf(row));
  let type,payload,next;
  if(row.kind==='initial'){
   type='respondBoxPartnerInitialInvitation';payload={invitationId:row.id,decision:body.decision};
  }else if(row.kind==='protection'){
   type='respondBoxPartnerInvite';payload={boxId:row.state.boxId,invitationId:row.id,decision:body.decision};
  }else if(row.kind==='release'){
   type=body.decision==='accepted'?'issueBoxPartnerCode':'denyBoxPartnerRequest';payload={boxId:row.state.boxId,requestId:row.id};
   // Keep the same current protection fingerprint that originally scoped this exact request.
   const box=boxFor(state,row.state.boxId);if(!box||box.protection?.invitationId!==row.state.protection?.invitationId)throw fail('PARTNER_CHANGED','The partner role changed. This request can no longer be approved.');
  }else throw fail('PARTNER_UNAVAILABLE','This partner request is unavailable.');
  const result=applyAction(state,type,payload);if(!result.ok)throw fail('PARTNER_CHANGED',result.message);
  if(row.kind==='initial'){const invitation=(state.boxPartnerInvitations||[]).find(item=>item.id===row.id);next={...row.state,invitation:copy(invitation)};}
  else if(row.kind==='protection'){const box=boxFor(state,row.state.boxId),invitation=invitationFor(box,row.id);if(!invitation)throw fail('PARTNER_CHANGED','The invitation changed. Open the current invitation.');next={...row.state,invitation:copy(invitation)};}
  else{const request=boxFor(state,row.state.boxId)?.protectionRequests?.find(item=>item.id===row.id);if(!request)throw fail('PARTNER_CHANGED','The release request changed.');next={...row.state,request:copy(request)};}
  const saved=await repo.service('partner.respond',{id:row.id,expectedRevision:row.revision,state:next});
  if(saved?.code==='REVISION_CONFLICT')continue;
  if(!saved?.ok)throw fail(saved?.code||'PARTNER_UNAVAILABLE','The partner response could not be confirmed.');
  const committed=saved.row||{...row,state:next,revision:row.revision+1};
  return {ok:true,sandbox:true,currency:'GHS',result:{ok:true,message:body.decision==='accepted'?'Your response is confirmed. Share this code only for this exact request.':'You declined this request. No money moved.'},inbox:publicPartnerInbox([committed],actor)};
 }
 throw fail('REVISION_CONFLICT','This request changed. Open its current details and try again.');
}
