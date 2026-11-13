/** Shared collection rules. All values are local prototype records, never live bank data. */
import { paymentFee } from './payments-parity-model.js';
import { validateRecipientLookup, resolveDemoRecipient } from './recipient-lookup.js';
export const GROUP_PROPOSAL_MS = 48 * 60 * 60 * 1000;
export const GROUP_REVIEW_MS = 5 * 60 * 1000;
export const GROUP_EVIDENCE_MAX_BYTES = 500000;
export const groupPayoutFee = rail => paymentFee(String(rail).toLowerCase());
const clean = (v, length = 120) => typeof v === 'string' ? v.trim().slice(0,length) : '';
export function groupPayoutStatus(p, at = Date.now()) {
  return ['pending','approved','failed'].includes(p.status) && p.expiresAt && Date.parse(p.expiresAt) <= at ? 'expired' : p.status;
}
export function groupCollectionStatus(g) { return g.status === 'closed' ? 'closed' : g.deadline && g.deadline < new Date().toISOString().slice(0,10) ? 'deadline-passed' : 'open'; }
export function designatedGroupApprovers(g) {
  const possible = (g.members || []).filter(m => m.status !== 'removed' && ['approver','creator','owner','admin'].includes(m.role));
  return Array.isArray(g.mandate?.approvers) ? possible.filter(m => g.mandate.approvers.some(value => (typeof value === 'object' ? value.id : value) === m.id)) : possible.slice(0, Math.max(1, Number.isSafeInteger(g.mandate?.approvers) ? g.mandate.approvers : possible.length));
}
export function groupMandateAccepted(g, member) {
  return !!member && (!member.status || member.status === 'active') && (member.mandateAcceptedRevision ?? ((g.mandateRevision || 1) === 1 ? 1 : 0)) === (g.mandateRevision || 1);
}
export function groupMandatePending(g) { return designatedGroupApprovers(g).filter(member => !groupMandateAccepted(g, member)); }
export function groupMandateReady(g) {
  const approvers = designatedGroupApprovers(g);
  return approvers.length >= Math.max(1, g.mandate?.threshold || 1) && groupMandatePending(g).length === 0;
}
export function canonicalGroupRecipient(p, previous = {}) {
  const raw = p.recipient && typeof p.recipient === 'object' ? p.recipient : {};
  const rail = clean(p.rail || previous.rail || 'lumo').toLowerCase();
  const name = clean(raw.name || (typeof p.recipient === 'string' ? p.recipient : '') || previous.recipient, 120);
  const number = clean(p.destination ?? raw.number ?? previous.destination,100);
  if (!['lumo','momo','bank'].includes(rail) || !name || /[<>\u0000-\u001f\u007f]/.test(name)) return {ok:false,message:'Choose a valid group recipient.'};
  if (rail === 'lumo') {
    const destination = number || `@${name.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,40)}`;
    if (destination.length < 2 || /[<>\u0000-\u001f\u007f]/.test(destination)) return {ok:false,message:'Add the recipient’s Lumo handle or merchant code.'};
    return {ok:true,recipient:name,rail,destination,bank:'',network:''};
  }
  const bank = clean(p.bank ?? raw.bank ?? previous.bank,60);
  const checked = validateRecipientLookup(rail,{number,bank});
  if (!checked.ok) return checked;
  const found = resolveDemoRecipient(checked.request);
  if (!found.ok) return found;
  if (found.recipient.name !== name) return {ok:false,message:'Confirm the registered account name from the demo lookup.'};
  return {ok:true,recipient:found.recipient.name,rail,destination:found.recipient.number,bank:found.recipient.bank || '',network:found.recipient.network || '',lookupSource:'demo'};
}
export function validateGroupEvidence(input = []) {
  if (!Array.isArray(input) || input.length > 2) return {ok:false,message:'Attach up to two small sample documents.'};
  const evidence=[];
  for (const file of input) {
    const name=clean(file?.name,100), type=clean(file?.type,40), dataUrl=typeof file?.dataUrl==='string'?file.dataUrl:'';
    if (!name || !['image/png','image/jpeg','image/webp','application/pdf'].includes(type) || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > GROUP_EVIDENCE_MAX_BYTES) return {ok:false,message:'Use a PNG, JPEG, WebP or PDF sample under 500 KB.'};
    const prefix=`data:${type};base64,`, base64=dataUrl.slice(prefix.length);
    if (!dataUrl.startsWith(prefix) || base64.length > Math.ceil(GROUP_EVIDENCE_MAX_BYTES / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return {ok:false,message:'That attachment could not be read safely.'};
    let bytes; try { bytes=atob(base64); } catch { return {ok:false,message:'That attachment is unreadable.'}; }
    const validHeader=type==='application/pdf'?bytes.startsWith('%PDF-'):type==='image/png'?bytes.startsWith('\x89PNG\r\n\x1a\n'):type==='image/jpeg'?bytes.startsWith('\xff\xd8\xff'):bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP';
    if (bytes.length!==file.size || !validHeader) return {ok:false,message:'The attachment type and contents do not match.'};
    evidence.push({name,type,size:file.size,dataUrl});
  }
  return {ok:true,evidence};
}
/** Largest-remainder allocation returns every pesewa exactly once to original sources. */
export function collectionRefundPreview(g) {
  const sources=(g.contributions||[]).filter(c=>c.status==='success'&&c.amount>(c.refundedAmount||0)).map(c=>({contributionId:c.id,memberId:c.memberId,memberName:c.memberName||'Original contributor',sourceTransactionId:c.transactionId||'',weight:c.amount-(c.refundedAmount||0),walletCredit:c.memberId==='me'&&c.walletDebited===true}));
  const total=sources.reduce((n,c)=>n+c.weight,0), balance=Math.max(0,g.balance||0);
  if (!total) return [];
  const rows=sources.map(c=>({...c,amount:Number(BigInt(balance)*BigInt(c.weight)/BigInt(total)),remainder:(BigInt(balance)*BigInt(c.weight))%BigInt(total)}));
  let left=balance-rows.reduce((n,c)=>n+c.amount,0);
  const ordered=[...rows].sort((a,b)=>a.remainder===b.remainder?a.contributionId.localeCompare(b.contributionId):a.remainder>b.remainder?-1:1);
  for (let index=0;left>0;index++,left--) ordered[index%ordered.length].amount++;
  return rows.filter(c=>c.amount>0).map(({weight,remainder,...c})=>c);
}
