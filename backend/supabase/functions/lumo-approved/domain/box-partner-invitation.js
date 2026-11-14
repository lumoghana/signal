/** Pre-creation partner confirmation. Codes and partner responses are local simulations. */
import {validatePartnerDetails} from './box-protection.js';

export const BOX_PARTNER_INVITATION_ACTIONS = new Set(['sendBoxPartnerInvitation','respondBoxPartnerInitialInvitation','verifyBoxPartnerInvitation']);
export const PARTNER_CODE_LIFETIME = 5 * 60 * 1000;
export const PARTNER_CODE_RESEND_DELAY = 30 * 1000;
export const PARTNER_PROOF_LIFETIME = 30 * 60 * 1000;
const clean=(value,max=120)=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,max):'';
const stamp=()=>new Date().toISOString();
const uid=()=>`partner-setup-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const good=(message,extra={})=>({ok:true,message,...extra});
const fail=(message,extra={})=>({ok:false,message,...extra});
const fresh=value=>Number.isFinite(Date.parse(value))&&Date.parse(value)>Date.now();
const scopeOf=value=>JSON.stringify([value.setupId,value.boxName,value.partner.name,value.partner.phone]);
const byId=(state,id)=>Array.isArray(state.boxPartnerInvitations)?state.boxPartnerInvitations.find(i=>i.id===id):null;
const statuses=new Set(['awaiting-partner','accepted','verified','declined','expired','locked','superseded','consumed']);

export function ensureBoxPartnerInvitations(state){
  if(state.boxPartnerInvitations===undefined)state.boxPartnerInvitations=[];
  return state;
}
function normalizeScope(state,p={}){
  const validation=validatePartnerDetails(p.partner,state.profile?.phone),setupId=clean(p.setupId),boxName=clean(p.boxName,60);
  if(!validation.ok)return validation;
  if(!setupId||!boxName)return fail('Start this partner confirmation from your Money Box setup.');
  return {ok:true,setupId,boxName,partner:validation.partner};
}
function trusted(invitation){
  return invitation&&invitation.mode==='simulation'&&typeof invitation.id==='string'&&invitation.partner
    &&typeof invitation.setupId==='string'&&typeof invitation.boxName==='string'
    &&invitation.scope===scopeOf(invitation)&&Number.isFinite(Date.parse(invitation.sentAt));
}
export function validBoxPartnerInvitations(state){
  return state.boxPartnerInvitations===undefined || Array.isArray(state.boxPartnerInvitations)
    &&state.boxPartnerInvitations.every(i=>trusted(i)&&statuses.has(i.status)&&Number.isSafeInteger(i.attempts)&&i.attempts>=0&&i.attempts<=5)
    &&new Set(state.boxPartnerInvitations.map(i=>i.id)).size===state.boxPartnerInvitations.length;
}
function currentStatus(invitation){
  if(invitation.status==='verified'&&!fresh(invitation.proofExpiresAt))return 'expired';
  if(['awaiting-partner','accepted'].includes(invitation.status)&&!fresh(invitation.expiresAt))return 'expired';
  return invitation.status;
}
function publicView(invitation,scopeMatches=true){
  return {id:invitation.id,setupId:invitation.setupId,boxName:invitation.boxName,partner:{...invitation.partner},
    status:currentStatus(invitation),sentAt:invitation.sentAt,expiresAt:invitation.expiresAt,resendAt:invitation.resendAt,
    attempts:invitation.attempts||0,mode:'simulation',scopeMatches,
    ...(invitation.acceptedAt?{acceptedAt:invitation.acceptedAt}:{}),
    ...(invitation.verifiedAt?{verifiedAt:invitation.verifiedAt,proofExpiresAt:invitation.proofExpiresAt}:{}),
    ...(invitation.boxId?{boxId:invitation.boxId}:{})};
}
export function getBoxPartnerInvitation(state,p={}){
  const invitation=byId(state,p.invitationId);
  if(!trusted(invitation))return null;
  const scope=normalizeScope(state,p);
  return publicView(invitation,scope.ok&&invitation.scope===scopeOf(scope));
}
export function getBoxPartnerInvitationPreview(state,invitationId){
  const invitation=byId(state,invitationId);
  if(!trusted(invitation))return null;
  return {...publicView(invitation),role:'Accountability partner',operation:'Confirm your role before this Money Box is created',
    ...(currentStatus(invitation)==='accepted'&&/^\d{6}$/.test(invitation.code)?{code:invitation.code}:{})};
}
export function verifiedBoxPartnerInvitation(state,p={}){
  const invitation=byId(state,p.invitationId||p.partnerInvitationId);
  const scope=normalizeScope(state,{setupId:p.setupId||p.partnerSetupId,boxName:p.boxName||p.name,partner:p.partner||p.accountabilityPartner});
  if(!scope.ok)return scope;
  if(!trusted(invitation)||invitation.scope!==scopeOf(scope))return fail('Confirm this partner’s number and acceptance before creating your Money Box.');
  if(invitation.status==='consumed')return fail('This partner confirmation has already been used for a Money Box.');
  if(invitation.status!=='verified'||!fresh(invitation.proofExpiresAt)||!invitation.acceptedAt||!invitation.verifiedAt)return fail('Your partner needs to accept and share a fresh code before you create this Money Box.');
  return {ok:true,invitation};
}
export function consumeBoxPartnerInvitation(state,p,boxId){
  const checked=verifiedBoxPartnerInvitation(state,p);if(!checked.ok)return checked;
  const invitation=checked.invitation;
  const confirmation={invitationId:invitation.id,acceptedAt:invitation.acceptedAt,phoneVerifiedAt:invitation.verifiedAt,mode:'simulation',lastCode:invitation.verifiedCode};
  invitation.status='consumed';invitation.boxId=boxId;invitation.consumedAt=stamp();delete invitation.code;delete invitation.verifiedCode;
  return {ok:true,confirmation};
}
function expire(invitation){invitation.status='expired';delete invitation.code;delete invitation.verifiedCode;return fail('That confirmation expired. Send a fresh partner code.',{persistFailure:true,invitationId:invitation.id,view:publicView(invitation)});}

export function handleBoxPartnerInvitationAction(state,type,p={}){
  if(!BOX_PARTNER_INVITATION_ACTIONS.has(type))return null;
  ensureBoxPartnerInvitations(state);
  if(!Array.isArray(state.boxPartnerInvitations))return fail('Saved partner confirmations need review. Keep this tab open.');
  if(type==='sendBoxPartnerInvitation'){
    const scope=normalizeScope(state,p);if(!scope.ok)return scope;
    const previous=[...state.boxPartnerInvitations].reverse().find(i=>i.setupId===scope.setupId&&trusted(i));
    if(p.invitationId){const supplied=byId(state,p.invitationId);if(!trusted(supplied)||supplied.setupId!==scope.setupId||supplied!==previous)return fail('This partner code is no longer current. Use the latest confirmation for this Money Box.');}
    const same=previous?.scope===scopeOf(scope);
    if(previous?.status==='consumed')return fail('That setup already created a Money Box. Start a new box to add another.');
    if(same&&fresh(previous.resendAt))return fail('Give the first code a moment. You can request another after 30 seconds.',{invitationId:previous.id,view:publicView(previous)});
    const accepted=same&&previous.acceptedAt&&previous.status!=='declined';
    const lastCode=previous?.lastIssuedCode||previous?.code||previous?.verifiedCode;
    let code=String(100000+Math.floor(Math.random()*900000));
    if(code===lastCode)code=String(100000+(Number(code)-100000+1)%900000);
    for(const old of state.boxPartnerInvitations.filter(i=>i.setupId===scope.setupId&&i.status!=='consumed')){old.status='superseded';delete old.code;delete old.verifiedCode;}
    const invitation={id:uid(),setupId:scope.setupId,boxName:scope.boxName,partner:scope.partner,scope:scopeOf(scope),mode:'simulation',
      status:accepted?'accepted':'awaiting-partner',code,lastIssuedCode:code,sentAt:stamp(),expiresAt:new Date(Date.now()+PARTNER_CODE_LIFETIME).toISOString(),
      resendAt:new Date(Date.now()+PARTNER_CODE_RESEND_DELAY).toISOString(),attempts:0,...(accepted?{acceptedAt:previous.acceptedAt}:{})};
    state.boxPartnerInvitations.push(invitation);
    return good('Partner code prepared for this number in the local simulation. No SMS was sent.',{invitationId:invitation.id,view:publicView(invitation)});
  }
  const invitation=byId(state,p.invitationId||p.id);
  if(!trusted(invitation))return fail('This partner confirmation is no longer available. Send a new code.');
  if(['consumed','superseded','declined','locked'].includes(invitation.status))return fail('This code is no longer active. Send a new partner code.');
  if(type==='respondBoxPartnerInitialInvitation'){
    if(!['accepted','declined'].includes(p.decision))return fail('Choose whether to accept this accountability role.');
    if(currentStatus(invitation)==='expired')return expire(invitation);
    if(p.decision==='declined'){invitation.status='declined';invitation.declinedAt=stamp();delete invitation.code;delete invitation.verifiedCode;delete invitation.verifiedAt;delete invitation.proofExpiresAt;return good('Partner declined. Choose someone else or create the box without a partner.',{invitationId:invitation.id,view:publicView(invitation)});}
    if(invitation.status==='verified')return good('This partner has already accepted and confirmed their number.',{invitationId:invitation.id,view:publicView(invitation),duplicate:true});
    invitation.status='accepted';invitation.acceptedAt ||= stamp();
    return good('Partner accepted in this simulation. They can now share their first code.',{invitationId:invitation.id,view:publicView(invitation)});
  }
  const scope=normalizeScope(state,p);if(!scope.ok)return scope;
  if(invitation.scope!==scopeOf(scope))return fail('The partner details changed. Send a new code to the current number.');
  if(currentStatus(invitation)==='expired')return expire(invitation);
  if(invitation.status==='verified')return good('Partner already confirmed. Your Money Box can now be created.',{verified:true,invitationId:invitation.id,view:publicView(invitation),duplicate:true});
  if(invitation.status!=='accepted'||!invitation.acceptedAt)return fail('Your partner needs to accept the role before sharing their code.');
  if(typeof p.code!=='string'||!/^\d{6}$/.test(p.code)||p.code!==invitation.code){
    invitation.attempts+=1;if(invitation.attempts>=5){invitation.status='locked';delete invitation.code;}
    return fail(invitation.status==='locked'?'Too many tries. Send a new partner code.':'That code does not match. Check the code your partner shared.',{persistFailure:true,invitationId:invitation.id,view:publicView(invitation)});
  }
  invitation.status='verified';invitation.verifiedAt=stamp();invitation.proofExpiresAt=new Date(Date.now()+PARTNER_PROOF_LIFETIME).toISOString();invitation.verifiedCode=invitation.code;delete invitation.code;
  return good('Partner accepted and number confirmed in this demo.',{verified:true,invitationId:invitation.id,view:publicView(invitation)});
}
