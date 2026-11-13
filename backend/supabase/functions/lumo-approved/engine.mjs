import {runSavingsRules} from './domain/savings-parity-model.js';
import {overlayPartners,collectPartnerChanges,publicPartnerInbox,scrubPartnerSecrets} from './partners.mjs';
import {createEmptyState,migrateState,applyAction,validStoredState,getSummary} from './domain/model.js';
import {getMoneyIQ} from './domain/money-iq-model.js';
import {getLearningPractice} from './domain/learning-model.js';

export const clone=value=>JSON.parse(JSON.stringify(value));
const fail=(code,message)=>Object.assign(new Error(message),{code});
const ID_ARRAYS=new Set(['approvers','approvals']);
/** Only identity fields/keys change. Member prose, references and message text stay byte-for-byte. */
export function mapIdentity(value,from,to,key=''){
 if(Array.isArray(value))return value.map(item=>typeof item==='string'&&ID_ARRAYS.has(key)&&item===from?to:mapIdentity(item,from,to,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k===from?to:k,typeof v==='string'&&(k==='id'||k.endsWith('Id')||k.endsWith('By'))&&v===from?to:mapIdentity(v,from,to,k)]));
 return value;
}
const sensitiveKeys=new Set(['pin','currentPin','newPin','confirmPin','password','currentPassword','passwordProof','currentPasswordProof','credential']);
export function publicState(value){
 const state=clone(value);delete state.settings?.pin;delete state._appliedActions;delete state._sharedIncomeSeen;
 if(state.account){delete state.account.login?.credential;delete state.account.recovery;state.account.signedOut=false;}
 for(const group of state.groups||[]){group.localSimulation=false;group.participantId='me';
  const actor=group.members.find(m=>m.id==='me');
  if(actor?.status==='active'&&group.creatorId!=='me'&&!actor.historyConsentAt){
   const joined=Date.parse(actor.joinedAt||group.createdAt||'');const since=item=>Number.isFinite(joined)&&Date.parse(item.at||item.createdAt||'')>=joined;
   group.contributions=(group.contributions||[]).filter(since).map(c=>({...c,statusHistory:(c.statusHistory||[]).filter(since)}));
   group.payouts=(group.payouts||[]).filter(since).map(p=>({...p,history:(p.history||[]).filter(since)}));
   group.refunds=(group.refunds||[]).filter(since);
   if(group.chat){group.chat.messages=(group.chat.messages||[]).filter(since);const visible=new Set(group.chat.messages.map(m=>m.id));for(const message of group.chat.messages)if(message.reply&&!visible.has(message.reply.id))delete message.reply;group.chat.reports=(group.chat.reports||[]).filter(r=>since(r)&&visible.has(r.messageId));group.chat.readBy=Object.fromEntries(Object.entries(group.chat.readBy||{}).map(([id,ids])=>[id,ids.filter(x=>visible.has(x))]));}
  }
  if(actor?.status==='invited'){
   group.invitationOnly=true;group.balance=0;group.contributions=[];group.payouts=[];group.refunds=[];
   for(const member of group.members)member.amount=0;
   if(group.chat)group.chat={...group.chat,messages:[],reports:[],readBy:{},preferences:{}};
  }
 }
 return scrubPartnerSecrets(state);
}
export function buildState(snapshot){
 const state=snapshot.state?clone(snapshot.state):createEmptyState({name:snapshot.account.displayName,phone:snapshot.phone||''});
 if(!snapshot.state){state.onboardingDone=true;state.accounts=[{id:'operational',type:'operational',holderName:snapshot.account.displayName,status:'simulated-ready',demoNumber:'000000000001'},{id:'savings',type:'savings',holderName:snapshot.account.displayName,status:'simulated-ready',demoNumber:'000000000002'}];}
 state.wallet=snapshot.account.balance;state.settings||={};delete state.settings.pin;
 state.account||={};state.account.signedOut=false;
 state.profile.name=snapshot.account.displayName;state.profile.phone=snapshot.phone||state.profile.phone||'';
 state.groups=(snapshot.groups||[]).map(row=>{const g=mapIdentity(clone(row.state),snapshot.account.userId,'me');g.balance=row.balance;g.participantId='me';return g;});
 for(const box of state.boxes||[]){const authoritative=(snapshot.boxes||[]).find(x=>x.id===box.id);box.balance=authoritative?.balance||0;}
 // Ledger events arriving from the other consumer or merchant enter the SAME approved activity list.
 // Existing outgoing transaction IDs are linked to journals at commit, preserving plan/category metadata.
 const byId=new Map(state.transactions.map(tx=>[tx.id,tx]));
 for(const receipt of [...(snapshot.receipts||[])].reverse()){
  const existing=receipt.transactionId&&byId.get(receipt.transactionId)||state.transactions.find(tx=>tx.ledgerJournalId===receipt.id);
  if(existing){existing.ledgerJournalId=receipt.id;existing.reference=receipt.reference;continue;}
  const incoming=receipt.payeeAccountId===snapshot.account.id;
  const isInternal=['box_save','box_withdraw','group_contribution'].includes(receipt.type);
  const tx={id:`ledger-${receipt.id}`,ledgerJournalId:receipt.id,reference:receipt.reference,type:incoming?(receipt.type==='refund'?'refund':'income'):'payment',direction:incoming?'in':'out',amount:receipt.amount,fee:0,total:receipt.amount,status:'success',walletDebited:!incoming,merchant:incoming?(receipt.payerHandle||'Shared money'):(receipt.payeeHandle||'Lumo payment'),category:receipt.type==='refund'?'Refund':incoming?'Money received':'Other',rail:'lumo',emoji:incoming?'↙':'↗',at:receipt.createdAt,note:'Confirmed pilot test-money ledger entry',...(receipt.personalRequestId?{requestId:receipt.personalRequestId}:{}),...(receipt.approvedGroupId?{groupId:receipt.approvedGroupId}:{}),...(receipt.approvedBoxId?{boxId:receipt.approvedBoxId}:{}),...(isInternal?{excludeFromSpending:true}:{})};
  state.transactions.unshift(tx);byId.set(tx.id,tx);
 }
 state.moneyRequests=(state.moneyRequests||[]).filter(r=>!(snapshot.requests||[]).some(row=>row.id===r.id));
 for(const row of snapshot.requests||[]){const outgoing=row.senderUserId===snapshot.account.userId;state.moneyRequests.unshift({...clone(row.state),direction:outgoing?'outgoing':'incoming',name:outgoing?row.recipientName:row.senderName,simulation:false,senderUserId:row.senderUserId,recipientUserId:row.recipientUserId,senderHandle:row.senderHandle,recipientHandle:row.recipientHandle});}
 for(const row of snapshot.requests||[]){if(row.senderUserId===snapshot.account.userId&&row.state.splitId&&row.state.status==='paid'){const split=state.expenseSplits?.find(x=>x.id===row.state.splitId),member=split?.members.find(m=>m.id===row.state.memberId);if(member){member.paid=member.amount;const receipt=state.transactions.find(t=>t.ledgerJournalId===row.state.ledgerJournalId);if(receipt){receipt.splitAllocations||=[];if(!receipt.splitAllocations.some(a=>a.splitId===split.id&&a.memberId===member.id))receipt.splitAllocations.push({splitId:split.id,memberId:member.id,amount:row.state.amount,at:receipt.at});}}if(split&&split.members.every(m=>(m.paid||0)>=m.amount))split.status='settled';}}
 migrateState(state);overlayPartners(state,snapshot.partners||[],snapshot.account.userId);if(!validStoredState(state))throw fail('STATE_RECOVERY_REQUIRED','Your saved records need recovery before money can move.');
 return state;
}
export function derivedViews(state){
 try{return {moneyIQ:getMoneyIQ(state),moneyIQSessions:Object.fromEntries((state.learning?.moneyIQ?.sessions||[]).map(x=>[x.id,getMoneyIQ(state,{sessionId:x.id}).session])),learningPractices:Object.fromEntries((state.learning?.sessions||[]).filter(x=>x.type==='practice').map(x=>[x.id,getLearningPractice(state,x.id)]))};}catch{return {};}
}
export function envelope(snapshot,result={ok:true,message:'Your records are up to date.'},extra={}){
 const state=publicState(buildState(snapshot));return {ok:result?.ok!==false,...(result?.ok===false?{code:'DOMAIN_REJECTED',message:result.message}:{}),sandbox:true,currency:'GHS',state,result:publicResult(result),account:snapshot.account,revision:snapshot.revision,receipts:snapshot.receipts||[],views:derivedViews(state),partnerInbox:publicPartnerInbox(snapshot.partners||[],snapshot.account.userId),capabilities:{deviceProof:true,internalTestMoney:true,bank:false,momo:false,bills:false},...extra};
}
function publicResult(result){
 const clean=clone(result);if(clean.box)scrubPartnerSecrets({boxes:[clean.box]});if(clean.boxes)scrubPartnerSecrets({boxes:clean.boxes});if(clean.group)clean.group=publicState({groups:[clean.group]}).groups[0];if(clean.groups)clean.groups=publicState({groups:clean.groups}).groups;delete clean.settings?.pin;
 if(clean.transaction)delete clean.transaction.pin;
 return clean;
}
export function canonicalJson(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(value[k])).join(',')+'}';
}
export async function sha256(value,cryptoApi=globalThis.crypto){return [...new Uint8Array(await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function actionFingerprint(type,payload,attemptId){const p=clone(payload);delete p.idempotencyKey;return sha256(canonicalJson({type,payload:p,attemptId}));}
const blocked=new Set(['setGroupParticipant','ensureProjectPrintingDemo','resolvePayment','completePayment','reversePayment','settleGroupContribution','settleGroupPayout','resolveBoxTransfer','reverseBoxTransfer','retryBoxTransfer','resolveGroupMessage','simulateIncomingRequest','confirmRequestedMoney','resolveFundingAttempt','simulatePaymentOutcome','simulateServiceDelivery','cardPurchase','cardResolvePurchase','cardRefund','cardFund','cardReturn','accountStartRecovery','accountCompleteRecovery','accountSupportSimulate','accountSetLogin','accountChangeLogin','accountSignIn','accountBiometricSignIn','accountBiometricRegister','accountBiometricPayments','accountBiometricRemove','accountChangePin','respondBoxPartnerInitialInvitation','verifyBoxSupport','denyBoxPartnerRequest','issueBoxPartnerCode','respondBoxPartnerInvite']);
const requiresAuth=new Set(['payment','fund','contributeBox','withdrawBox','contributeGroup','requestPayout','approvePayout','executePayout','closeGroup','settleIOU','requestBoxProtection','completeBoxProtectionChange','accountClose','accountRemoveDevice']);
function validatePayload(type,payload){
 if(blocked.has(type)||/^simulate|^seed/.test(type))throw fail('SERVICE_UNAVAILABLE','This control needs its connected service before it can complete.');
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw fail('INVALID_INPUT','Check the details and try again.');
 if(Object.keys(payload).some(k=>sensitiveKeys.has(k)))throw fail('INVALID_INPUT','Use the secure authorization prompt for credentials.');
 for(const key of ['actorId','approverId','participantId'])if(payload[key]!==undefined&&payload[key]!=='me')throw fail('FORBIDDEN','Use your own signed-in account.');
 if(['payment','fund','contributeBox','withdrawBox','contributeGroup'].includes(type)&&payload.status!==undefined&&payload.status!=='success')throw fail('PROVIDER_OUTCOME_FORBIDDEN','Only a confirmed ledger result can change payment status.');
 if(type==='settleSplitShare'&&(payload.method||'lumo')==='lumo'&&!payload.receiptTransactionId)throw fail('CONFIRMED_RECEIPT_REQUIRED','Record the share after its actual payment arrives, or choose an outside repayment.');
 if(['startFundingAttempt','retryFundingAttempt'].includes(type))throw fail('PROVIDER_UNAVAILABLE','Bank and mobile money funding are not connected. Use explicit pilot test funds.');
}
async function resolved(repo,query){const r=await repo.resolve(query);if(!r?.ok||!r.recipient)throw fail('RECIPIENT_NOT_FOUND','This handle or phone is not registered in the connected pilot.');return r.recipient;}
export async function prepareMutation(snapshot,type,payload,attemptId,repo){
 validatePayload(type,payload);const p=clone(payload);delete p.idempotencyKey;
 const before=buildState(snapshot),state=clone(before),intents=[];let recipient=null,merchantQuote=null;
 const requests=[];let splitReceipt=null,splitMembers=[];
 if(type==='createExpenseSplit'){p.members=await Promise.all((p.members||[]).map(async member=>{if(member.isMe)return {...member,name:state.profile.name};const found=await resolved(repo,member.handle||member.phone||member.name);if(found.userId===snapshot.account.userId)throw fail('INVALID_MEMBER','You are already included in this split.');splitMembers.push({sourceId:member.id,...found});return {...member,name:found.name};}));}
 if(type==='settleSplitShare'&&(p.method||'lumo')==='lumo'){splitReceipt=state.transactions.find(t=>t.id===p.receiptTransactionId&&t.type==='income'&&t.direction==='in'&&t.status==='success'&&t.ledgerJournalId);if(!splitReceipt)throw fail('CONFIRMED_RECEIPT_REQUIRED','Choose a confirmed payment already received in Lumo.');const split=state.expenseSplits.find(x=>x.id===(p.splitId||p.id)),member=split?.members.find(m=>m.id===p.memberId&&!m.isMe);const amount=p.amount??((member?.amount||0)-(member?.paid||0));const allocated=(splitReceipt.iouId&&!splitReceipt.iouAllocations?splitReceipt.amount:(splitReceipt.iouAllocations||[]).reduce((n,a)=>n+a.amount,0))+(splitReceipt.splitAllocations||[]).reduce((n,a)=>n+a.amount,0);if(!Number.isSafeInteger(amount)||amount<=0||amount>splitReceipt.amount-allocated)throw fail('RECEIPT_ALREADY_MATCHED','This receipt has less unmatched money than that share.');p.amount=amount;p.method='cash';}
 if(type==='createMoneyRequest'){const found=await resolved(repo,p.recipient?.handle||p.recipient?.id||p.handle||p.userId||p.name);if(found.userId===snapshot.account.userId)throw fail('SELF_REQUEST','Choose another connected Lumo account.');recipient=found;p.name=found.name;}
 if(type==='updateProfile'&&p.phone!==undefined){p.phone=String(p.phone).replace(/[\s()-]/g,'').replace(/^\+233/,'0');if(!/^0\d{9}$/.test(p.phone))throw fail('INVALID_INPUT','Use a valid Ghana phone alias.');}
 if(type==='settleIOU'&&p.receiptTransactionId){const tx=state.transactions.find(t=>t.id===p.receiptTransactionId&&t.type==='income'&&t.direction==='in'&&t.status==='success'&&t.ledgerJournalId),iou=state.ious.find(i=>i.id===p.id);const amount=p.amount??Math.max(0,(iou?.amount||0)-(iou?.paid||0));if(!tx)throw fail('CONFIRMED_RECEIPT_REQUIRED','Choose a confirmed payment already received in Lumo.');const allocated=(tx.iouId&&!tx.iouAllocations?tx.amount:(tx.iouAllocations||[]).reduce((n,a)=>n+a.amount,0))+(tx.splitAllocations||[]).reduce((n,a)=>n+a.amount,0);if(amount>tx.amount-allocated)throw fail('RECEIPT_ALREADY_MATCHED','This receipt has less unmatched money than the IOU amount.');}
 if(type==='payment'&&p.requestId&&!(p.rail==='merchant'||p.shopId)){const request=(snapshot.requests||[]).find(x=>x.id===p.requestId&&x.recipientUserId===snapshot.account.userId);if(!request)throw fail('REQUEST_UNAVAILABLE','This request is not addressed to your account.');p.destination=request.senderUserId;}
 const identities={};
 if(type==='createGroup'){
  p.members=await Promise.all((p.members||[{id:'me',name:state.profile.name,role:'approver'}]).map(async m=>{
   if(m.id==='me')return {...m,id:'me',name:state.profile.name};
   const found=await resolved(repo,m.phone||m.handle);if(found.userId===snapshot.account.userId)throw fail('INVALID_MEMBER','You are already in this group.');
   if(m.id)identities[m.id]=found.userId;return {...m,id:found.userId,name:found.name,phone:found.phone||m.phone};
  }));
  if(Array.isArray(p.mandate?.approvers))p.mandate.approvers=p.mandate.approvers.map(id=>identities[id]||id);
 }
 if(['inviteGroupMember','addGroupMember'].includes(type)){
  const found=await resolved(repo,p.phone||p.handle);p.memberId=found.userId;p.name=found.name;p.phone=found.phone||p.phone;
 }
 const isDebtPayment=type==='settleIOU'&&!p.outside&&state.ious.find(i=>i.id===p.id)?.type==='owedByMe';
 if(type==='payment'||isDebtPayment){
  if(p.serviceId||p.paymentKind==='service'||!['lumo','merchant'].includes(p.rail||'lumo'))throw fail('PROVIDER_UNAVAILABLE','This provider is not connected. No money has moved.');
  if(p.fee&&p.fee!==0)throw fail('FEE_CHANGED','Review the internal transfer with its current zero fee.');
  if(p.rail==='merchant'||p.shopId){
   merchantQuote=await repo.quote({shopId:p.shopId,requestId:p.requestId,testKey:p.testKey});
   if(!merchantQuote?.ok||!merchantQuote.shop?.id)throw fail('REQUEST_UNAVAILABLE','This shop or payment request is unavailable.');
   if(merchantQuote.request&&merchantQuote.request.amount!==p.amount)throw fail('AMOUNT_CHANGED','Review the merchant’s fixed request amount.');
   p.merchant=merchantQuote.merchant?.name||merchantQuote.shop.name;p.rail='lumo';p.recipient={id:merchantQuote.shop.id,name:p.merchant};delete p.requestId;
  }else{
   recipient=await resolved(repo,p.destination||p.recipient?.handle||p.recipient?.id||p.recipient?.number||p.handle||p.merchant);
   if(recipient.userId===snapshot.account.userId)throw fail('SELF_TRANSFER','Choose another connected Lumo account.');
   p.recipient={id:recipient.userId,name:recipient.name,number:recipient.handle};p.merchant=recipient.name;p.rail='lumo';
  }
  p.status='success';p.fee=0;
 }
 if(['requestPayout','editPayout'].includes(type)){
  const existing=state.groups.find(g=>g.id===(p.groupId||p.id))?.payouts.find(x=>x.id===p.payoutId);
  if((p.rail||existing?.rail||'lumo')!=='lumo')throw fail('PROVIDER_UNAVAILABLE','This payout provider is not connected. No money has moved.');
  const found=await resolved(repo,p.destination||p.recipient?.id||p.recipient?.number||existing?.destination);
  p.rail='lumo';p.recipient=found.name;p.destination=`@${found.handle}`;p.fee=0;
 }
 if(['contributeGroup','contributeBox','withdrawBox','fund'].includes(type))p.status='success';
 if(type==='fund'){p.source='Pilot test funds';p.rail='internal';p.note='Pilot test money. No bank or mobile money charge.';}
 // Pure engine uses a local PIN sentinel only after the server authorization path. It is never persisted/returned.
 state.settings.pin='0000';
 if(['withdrawBox','requestBoxProtection','completeBoxProtectionChange','accountClose'].includes(type))p.pin='0000';
 let result;
 if(type==='runAutomaticSavings'){
  result=applyAction(state,'runScheduledSavings',{});state._sharedIncomeSeen||=[];
  const seen=new Set(state._sharedIncomeSeen);
  for(const income of state.transactions.filter(t=>t.type==='income'&&t.direction==='in'&&t.status==='success'&&t.ledgerJournalId&&!seen.has(t.ledgerJournalId))){
   runSavingsRules(state,{kind:'income',id:income.id,amount:income.amount},{getSummary,transaction:(s,values)=>{const tx={id:`tx-${globalThis.crypto.randomUUID()}`,type:'payment',direction:'out',amount:0,merchant:'',category:'Other',status:'success',at:new Date().toISOString(),note:'',emoji:'↗',rail:'lumo',...values};s.transactions.unshift(tx);return tx;}});
   state._sharedIncomeSeen.push(income.ledgerJournalId);
  }
 }
 else if(type==='setExpectedIncome'&&p.buffer!==undefined){result=applyAction(state,'setExpectedIncome',p);if(result.ok)result=applyAction(state,'settings',{buffer:p.buffer});}
 else if(type==='updateCardSettings'){result=applyAction(state,'cardRename',{cardId:p.cardId,name:p.name});if(result.ok)result=applyAction(state,'cardLimit',{cardId:p.cardId,limit:p.limit});}
 else if(type==='reactPayment'&&p.reaction===''){const tx=state.transactions.find(t=>t.id===(p.transactionId||p.id));result=tx?(delete tx.reaction,{ok:true,message:'Reaction removed.',id:tx.id,transaction:tx}):{ok:false,message:'That payment could not be found.'};}
 else result=applyAction(state,type,{...p,idempotencyKey:attemptId});
 if(!result.ok&&!result.persistFailure)return {ok:false,result,state:before};
 if(type==='executePayout'){
  const group=state.groups.find(g=>g.id===(p.groupId||p.id)),payout=group?.payouts.find(x=>x.id===p.payoutId);
  if(!payout||payout.rail!=='lumo')throw fail('PROVIDER_UNAVAILABLE','This payout provider is not connected.');
  recipient=await resolved(repo,payout.destination);if(payout.fee)throw fail('FEE_CHANGED','Review the current zero-fee internal payout.');
  const settled=applyAction(state,'settleGroupPayout',{groupId:group.id,payoutId:payout.id,outcome:'success'});if(!settled.ok)throw fail('PAYOUT_CHANGED',settled.message);
  Object.assign(result,settled);if(recipient.userId===snapshot.account.userId)state.wallet+=payout.amount;
  intents.push({kind:'group_payout',amount:payout.amount,source:{kind:'group',id:group.id},destination:recipient.userId===snapshot.account.userId?{kind:'wallet'}:{kind:'user',id:recipient.userId},groupId:group.id,metadata:{proposalId:payout.id}});
 }
 if(['sendGroupMessage','retryGroupMessage'].includes(type)&&result.message?.status==='sending'){
  const delivered=applyAction(state,'resolveGroupMessage',{groupId:p.groupId||p.id,messageId:result.message.id,outcome:'sent'});if(!delivered.ok)throw fail('MESSAGE_FAILED',delivered.message);Object.assign(result,delivered);
 }
 if(splitReceipt){const split=state.expenseSplits.find(x=>x.id===(p.splitId||p.id));const syntheticId=result.transaction?.id;state.transactions=state.transactions.filter(t=>t.id!==syntheticId);splitReceipt.splitAllocations||=[];splitReceipt.splitAllocations.push({splitId:split.id,memberId:p.memberId,amount:p.amount,at:new Date().toISOString()});for(const event of split.history||[])if(event.transactionId===syntheticId){event.transactionId=splitReceipt.id;event.method='lumo';}result.transaction=splitReceipt;result.id=splitReceipt.id;result.message='Confirmed receipt matched. Available money is unchanged.';}
 if(type==='fund')intents.push({kind:'test_funding',amount:p.amount,source:{kind:'funding'},destination:{kind:'wallet'},transactionId:result.transaction?.id||result.id});
 if(type==='payment'||isDebtPayment){const tx=result.transaction;if(merchantQuote){tx.shopId=merchantQuote.shop.id;if(merchantQuote.request)tx.requestId=merchantQuote.request.id;}intents.push({kind:merchantQuote?'merchant_payment':'transfer',amount:tx.amount,source:{kind:'wallet'},destination:merchantQuote?{kind:'merchant',id:merchantQuote.shop.id}:{kind:'user',id:recipient.userId},transactionId:tx.id,...(merchantQuote?{shopId:merchantQuote.shop.id,requestId:merchantQuote.request?.id}:{}),metadata:{note:tx.note||'',...(merchantQuote?{merchantAccessApproved:merchantQuote.merchantAccessApproved===true}:p.requestId?{personalRequestId:p.requestId}:{})}});}
 if(type==='contributeGroup'){const group=result.group,c=result.contribution;intents.push({kind:'group_contribution',amount:c.amount,source:{kind:'wallet'},destination:{kind:'group',id:group.id},transactionId:result.transaction?.id,groupId:group.id,metadata:{contributionId:c.id}});}
 if(type==='closeGroup'){
  const group=result.group,old=new Set((before.groups.find(x=>x.id===group.id)?.refunds||[]).map(x=>x.id));
  for(const refund of group.refunds.filter(x=>!old.has(x.id))){const memberId=refund.memberId==='me'?snapshot.account.userId:refund.memberId;if(!memberId)throw fail('REFUND_SOURCE_UNAVAILABLE','A contribution source needs recovery before this group can close.');
   intents.push({kind:'group_refund',amount:refund.amount,source:{kind:'group',id:group.id},destination:memberId===snapshot.account.userId?{kind:'wallet'}:{kind:'user',id:memberId},groupId:group.id,transactionId:state.transactions.find(x=>x.refundId===refund.id)?.id,metadata:{refundId:refund.id}});
  }
 }
 if(type==='createExpenseSplit'){const split=state.expenseSplits.find(x=>x.id===result.id);for(const member of split.members.filter(m=>!m.isMe)){const found=splitMembers.find(x=>x.sourceId===member.id)||splitMembers.find(x=>x.name===member.name);if(!found)throw fail('RECIPIENT_NOT_FOUND','A split member needs a connected handle or phone.');const id=`request-${split.id}-${member.id}`,request={id,direction:'outgoing',name:found.name,amount:member.amount,note:split.purpose,createdAt:split.createdAt,expiresAt:new Date(Date.now()+7*86400000).toISOString(),status:'open',history:[],simulation:false,splitId:split.id,memberId:member.id};state.moneyRequests.unshift(request);requests.push({id,expectedRevision:0,senderUserId:snapshot.account.userId,recipientUserId:found.userId,state:request});}}
 if(type==='settleSplitShare'){for(const row of snapshot.requests||[]){if(row.senderUserId===snapshot.account.userId&&row.state.splitId===(p.splitId||p.id)&&row.state.memberId===p.memberId){const current=state.moneyRequests.find(r=>r.id===row.id);if(current)current.status='paid';}}}
 if(type==='cancelExpenseSplit'){for(const row of snapshot.requests||[]){if(row.senderUserId===snapshot.account.userId&&row.state.splitId===(p.splitId||p.id)){const current=state.moneyRequests.find(r=>r.id===row.id);if(current&&current.status==='open')current.status='cancelled';}}}
 if(type==='createMoneyRequest'){const request=state.moneyRequests.find(r=>r.id===result.id);requests.push({id:request.id,expectedRevision:0,senderUserId:snapshot.account.userId,recipientUserId:recipient.userId,state:{...clone(request),simulation:false,senderUserId:snapshot.account.userId,recipientUserId:recipient.userId}});}
 for(const row of snapshot.requests||[]){const current=state.moneyRequests.find(r=>r.id===row.id);const previous=before.moneyRequests.find(r=>r.id===row.id);if(current&&previous&&canonicalJson(current)!==canonicalJson(previous)){requests.push({id:row.id,expectedRevision:row.revision,senderUserId:row.senderUserId,recipientUserId:row.recipientUserId,state:{...clone(current),direction:'outgoing',name:row.recipientName,simulation:false}});}}
 const boxIds=new Set([...before.boxes,...state.boxes].map(x=>x.id));
 const boxes=[...boxIds].map(id=>({id,before:before.boxes.find(x=>x.id===id)?.balance||0,after:state.boxes.find(x=>x.id===id)?.balance||0}));
 for(const box of boxes){const delta=box.after-box.before;if(delta)intents.push({kind:delta>0?'box_save':'box_withdraw',amount:Math.abs(delta),source:delta>0?{kind:'wallet'}:{kind:'box',id:box.id},destination:delta>0?{kind:'box',id:box.id}:{kind:'wallet'},boxId:box.id,transactionId:state.transactions.find(x=>!before.transactions.some(old=>old.id===x.id)&&x.boxId===box.id)?.id});}
 // Conservation check catches any unsupported engine money path before a service RPC is attempted.
 if(intents.some(i=>!Number.isSafeInteger(i.amount)||i.amount<1||i.amount>1000000))throw fail('PILOT_LIMIT','Each pilot test-money posting must be between one pesewa and GH₵10,000.');
 const walletDelta=intents.reduce((n,x)=>n+(x.destination.kind==='wallet'?x.amount:0)-(x.source.kind==='wallet'?x.amount:0),0);
 if(state.wallet-before.wallet!==walletDelta)throw fail('UNBACKED_STATE','This operation needs its connected payment service before it can move money.');
 for(const group of state.groups){const old=before.groups.find(x=>x.id===group.id);const delta=intents.reduce((n,x)=>n+(x.destination.kind==='group'&&x.destination.id===group.id?x.amount:0)-(x.source.kind==='group'&&x.source.id===group.id?x.amount:0),0);if(group.balance-(old?.balance||0)!==delta)throw fail('UNBACKED_STATE','This group operation needs a confirmed ledger source.');}
 delete state.settings.pin;delete state.account?.login?.credential;
 const groups=state.groups.filter(g=>!before.groups.some(old=>old.id===g.id&&canonicalJson(old)===canonicalJson(g))).map(g=>({id:g.id,expectedRevision:snapshot.groups.find(row=>row.id===g.id)?.revision||0,state:mapIdentity(g,'me',snapshot.account.userId)}));
 const partners=await collectPartnerChanges(before,state,snapshot,snapshot.account.userId,repo);
 const durableState=clone(state);durableState.groups=[];delete durableState._appliedActions;
 return {ok:true,result:publicResult(result),state,durableState,groups,boxes,intents,requests,partners,profileChange:type==='updateProfile'?{name:state.profile.name,phone:state.profile.phone}:null,requiresAuth:requiresAuth.has(type)||intents.length>0&&!['runScheduledSavings','runAutomaticSavings'].includes(type),expectedWallet:before.wallet};
}
