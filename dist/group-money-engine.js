/* Expense splits and purpose-specific collections in this device's preview.
   These records never debit, credit or reserve a personal bank/demo balance.
   Sample contributions are explicit simulations, not bank-confirmed money. */
(()=>{
'use strict';
if(!window.L||L.groupMoney)return;
const MAX_CENTS=100000000,MAX_SHARE_CENTS=500000,MAX_FRIENDS=8,PROPOSAL_LIFETIME=48*60*60*1000;
const now=()=>new Date().toISOString();
const PAYOUT_REVIEW_LIFETIME=5*60*1000;
let payoutReviews=new WeakMap(),railPayoutReviews=new WeakMap(),atomicDepth=0;
const norm=v=>String(v??'').trim().normalize('NFKC').toLowerCase();
const text=(v,max)=>String(v??'').trim().slice(0,max);
const fail=error=>({ok:false,error});
const auth=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const ownerKey=()=>String(L.state.profile?.account||L.state.profile?.handle||L.state.profile?.phone||'name:'+norm(L.state.profile?.name));
const cents=value=>{
 if(typeof value!=='number'&&(typeof value!=='string'||!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.trim())))return null;
 const n=Number(value),c=Math.round(n*100);
 return Number.isFinite(n)&&n>=0&&c<=MAX_CENTS&&Math.abs(n*100-c)<.000001?c:null;
};
const format=c=>L.money((Number(c)||0)/100);
// SHA-256 over the canonical ASCII data URL, per FIPS 180-4 sections 4-6.
// This is a compact content binding, not a signature or sender verification.
// https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
const attachmentDigestCache=new Map();
const evidenceDigest=value=>{
 if(attachmentDigestCache.has(value))return attachmentDigestCache.get(value);
 const constants=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
 const hash=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],length=value.length,total=Math.ceil((length+9)/64)*64,bytes=new Uint8Array(total),words=new Uint32Array(64),rotate=(v,n)=>(v>>>n)|(v<<(32-n));
 for(let i=0;i<length;i++)bytes[i]=value.charCodeAt(i);bytes[length]=0x80;
 const bitLength=length*8;for(let i=0;i<8;i++)bytes[total-1-i]=Math.floor(bitLength/2**(8*i))&255;
 for(let offset=0;offset<total;offset+=64){
  for(let i=0;i<16;i++){const at=offset+i*4;words[i]=((bytes[at]<<24)|(bytes[at+1]<<16)|(bytes[at+2]<<8)|bytes[at+3])>>>0;}
  for(let i=16;i<64;i++){const x=words[i-15],y=words[i-2],small0=rotate(x,7)^rotate(x,18)^(x>>>3),small1=rotate(y,17)^rotate(y,19)^(y>>>10);words[i]=(words[i-16]+small0+words[i-7]+small1)>>>0;}
  let [a,b,c,d,e,f,g,h]=hash;
  for(let i=0;i<64;i++){const big1=rotate(e,6)^rotate(e,11)^rotate(e,25),choose=(e&f)^(~e&g),one=(h+big1+choose+constants[i]+words[i])>>>0,big0=rotate(a,2)^rotate(a,13)^rotate(a,22),majority=(a&b)^(a&c)^(b&c),two=(big0+majority)>>>0;h=g;g=f;f=e;e=(d+one)>>>0;d=c;c=b;b=a;a=(one+two)>>>0;}
  const next=[a,b,c,d,e,f,g,h];for(let i=0;i<8;i++)hash[i]=(hash[i]+next[i])>>>0;
 }
 const digest=hash.map(word=>word.toString(16).padStart(8,'0')).join('');attachmentDigestCache.set(value,digest);if(attachmentDigestCache.size>8)attachmentDigestCache.delete(attachmentDigestCache.keys().next().value);return digest;
};
const validateAttachment=value=>{
 if(value===undefined||value===null)return {ok:true,attachment:null};
 if(typeof value!=='object'||Array.isArray(value))return fail('Choose a JPEG, PNG or PDF supporting file.');
 const name=typeof value.name==='string'?value.name:'',type=value.type,size=value.size,dataUrl=value.dataUrl;
 if(!name.trim()||name!==name.trim()||name.length>100||/[\x00-\x1f\x7f\\/]/.test(name))return fail('Use a supporting file name up to 100 characters without control characters or paths.');
 if(!['image/jpeg','image/png','application/pdf'].includes(type)||!Number.isSafeInteger(size)||size<=0||size>200*1024||typeof dataUrl!=='string')return fail('Choose a JPEG, PNG or PDF no larger than 200 KB.');
 const prefix='data:'+type+';base64,';if(!dataUrl.startsWith(prefix))return fail('The supporting file format does not match its contents.');
 if(dataUrl.length>prefix.length+4*Math.ceil(200*1024/3))return fail('Choose a supporting file no larger than 200 KB.');
 const encoded=dataUrl.slice(prefix.length),padding=encoded.endsWith('==')?2:encoded.endsWith('=')?1:0,alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
 if(!encoded.length||encoded.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)||encoded.length/4*3-padding!==size)return fail('The supporting file is incomplete or its size changed.');
 if(padding===2&&(alphabet.indexOf(encoded.at(-3))&15)||padding===1&&(alphabet.indexOf(encoded.at(-2))&3))return fail('The supporting file encoding is invalid.');
 const bytes=[];let bits=0,acc=0;for(const c of encoded.slice(0,16)){if(c==='=')break;acc=(acc<<6)|alphabet.indexOf(c);bits+=6;if(bits>=8){bits-=8;bytes.push((acc>>bits)&255);}}
 const signature=type==='image/png'?[137,80,78,71,13,10,26,10]:type==='image/jpeg'?[255,216,255]:[37,80,68,70,45];
 if(signature.some((byte,index)=>bytes[index]!==byte))return fail('The supporting file format does not match its contents.');
 return {ok:true,attachment:{name,type,size,dataUrl},digest:evidenceDigest(dataUrl)};
};

const store=()=>{
 if(!L.state.groupMoney)L.state.groupMoney={version:1,items:[],draft:null,templates:[],contacts:[]};
 const s=L.state.groupMoney;
 if(s.version===1&&Array.isArray(s.items)){if(s.templates===undefined)s.templates=[];if(s.contacts===undefined)s.contacts=[];if(s.invitations===undefined)s.invitations=[];}
 return s.version===1&&Array.isArray(s.items)?s:null;
};
const list=()=>auth()?(store()?.items||[]).filter(i=>i.ownerKey===ownerKey()):[];
const get=id=>list().find(i=>i.id===id)||null;
const save=()=>L.save();
// Money, mandates and votes commit once through the existing persistence path.
// A blocked/offline client may read records and edit drafts, but cannot commit
// a financial or membership transition.
const mutationReady=(action,online=true)=>{
 if(L.persistence?.ensureCurrent?.()===false)return fail('Your saved records changed or could not be saved. Reload the latest records before continuing.');
 if(online&&L.platform?.requireOnline?.(action)===false)return fail('Reconnect before '+action.toLowerCase()+'. Your saved records have not changed.');
 return {ok:true};
};
const railAtomic=(fn,{financial=true}={})=>{
 if(L.persistence?.transaction)return L.persistence.transaction(fn,{financial,label:'Save group change'});
 if(atomicDepth)return fn();
 const before=JSON.parse(JSON.stringify(L.state)),originalSave=L.save;
 atomicDepth++;L.save=()=>true;
 try{
  const result=fn();L.save=originalSave;
  if(originalSave.call(L)===false)throw Error('This change could not be saved. Your money and group records have not changed.');
  return result;
 }catch(error){L.state=before;throw error;}
 finally{L.save=originalSave;atomicDepth--;}
};
const commit=(action,fn,online=true)=>(...args)=>{const ready=mutationReady(action,online);if(!ready.ok)return ready;try{return railAtomic(()=>fn(...args),{financial:online});}catch(error){railPayoutReviews=new WeakMap();payoutReviews=new WeakMap();return {...fail(error.message||'This group change could not be saved.'),needsReview:true};}};
const tx=id=>(L.state.txs||[]).find(t=>t.id===id);
const sourceAmount=t=>{
 if(!t)return 0;
 const refunds=(L.state.txs||[]).filter(r=>r.originalId===t.id&&r.type==='in'&&r.status==='success').reduce((n,r)=>n+(cents(r.amount)||0),0);
 return Math.max(0,(cents(t.amount)||0)-Math.max(cents(t.refunded)||0,refunds));
};
const eligibleSource=t=>!!t&&t.type==='out'&&t.status==='success'&&!t.internal&&!L.isInternalTransfer?.(t)&&sourceAmount(t)>0;
const sourceQuote=t=>JSON.stringify([t?.id,t?.type,t?.status,cents(t?.amount),cents(t?.fee||0),sourceAmount(t),!!t?.internal,!!L.isInternalTransfer?.(t)]);
const sourceCurrent=item=>!item?.sourceTxId||eligibleSource(tx(item.sourceTxId))&&item.sourceQuote===sourceQuote(tx(item.sourceTxId));
const splitForSource=sourceId=>{
 if(!auth()||!sourceId)return null;
 const current=list().find(item=>item.type==='split'&&item.sourceTxId===sourceId);
 if(current)return {kind:'current',id:current.id,sourceTxId:sourceId};
 const earlier=(L.state.sharedExpenses?.groups||[]).find(item=>item.txId===sourceId);
 return earlier?{kind:'legacy',id:earlier.id,sourceTxId:sourceId}:null;
};
const dateEnd=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return null;
 const time=Date.parse(value+'T23:59:59.999Z');
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?time:null;
};
const peopleFor=(input,type)=>{
 if(!Array.isArray(input))return fail('Add the people taking part.');
 let raw=input.map(p=>({...p}));
 const isOwn=p=>p.isOwner===true||p.id==='self';
 if(raw.filter(isOwn).length>1)return fail('Your share is already included.');
 if(!raw.some(isOwn))raw.unshift({id:'self',name:'You',isOwner:true});
 if(raw.length<2||raw.length>MAX_FRIENDS+1)return fail('Add between one and eight other people.');
 const ids=new Set(),names=new Set(),people=[];
 for(let index=0;index<raw.length;index++){
  const p=raw[index],isOwner=isOwn(p),name=isOwner?'You':text(p.name,60),id=isOwner?'self':text(p.id||'person-'+index,80);
  if(!isOwner&&(!name||['you','me',norm(L.state.profile?.name)].includes(norm(name))))return fail('Add a different name for each friend. Your share is already included.');
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(id)||ids.has(id)||names.has(norm(name)))return fail('Each person should appear once, with a different name.');
  ids.add(id);names.add(norm(name));people.push({id,name,isOwner,amountCents:type==='collection'?0:undefined,inputAmount:p.amount});
 }
 people.sort((a,b)=>Number(b.isOwner)-Number(a.isOwner));
 return {ok:true,people};
};
const previewSplit=input=>{
 if(!auth())return fail('Sign in to your open demo account first.');
 const title=text(input?.title,60),totalCents=cents(input?.total),mode=input?.mode||'equal';
 if(!title)return fail('Give the expense a short name.');
 if(totalCents===null||totalCents<=0)return fail('Enter an expense above GH₵0.00, with no more than two decimal places.');
 if(!['equal','custom'].includes(mode))return fail('Choose equal shares or your own amounts.');
 const result=peopleFor(input?.people,'split');if(!result.ok)return result;const people=result.people;
 let source=null;
 if(input.sourceTxId){source=tx(input.sourceTxId);if(!eligibleSource(source))return fail('Choose a completed outgoing payment that has not been fully refunded.');if(totalCents!==sourceAmount(source))return fail('The payment amount changed. Use its latest amount.');}
 if(mode==='equal'){
  const each=Math.floor(totalCents/people.length),remainder=totalCents-each*people.length;
  people.forEach(p=>{p.amountCents=each+(p.isOwner?remainder:0);});
 }else{
  for(const p of people){p.amountCents=cents(p.inputAmount);if(p.amountCents===null)return fail('Check each share. Use amounts with no more than two decimal places.');}
  if(people.reduce((n,p)=>n+p.amountCents,0)!==totalCents)return fail('Everyone’s shares must add up to '+format(totalCents)+'.');
 }
 if(people.some(p=>!p.isOwner&&p.amountCents>MAX_SHARE_CENTS))return fail('Each friend’s share can be no more than GH₵5,000.00 in this preview.');
 if(!people.some(p=>!p.isOwner&&p.amountCents>0))return fail('Give at least one friend a share above zero.');
 people.forEach(p=>{delete p.inputAmount;});
 return {ok:true,item:{type:'split',title,totalCents,mode,people,sourceTxId:source?.id||null,sourceQuote:source?sourceQuote(source):null,status:'due'}};
};
const previewCollection=input=>{
 if(!auth())return fail('Sign in to your open demo account first.');
 const title=text(input?.title,60),targetCents=input?.targetCents===undefined?cents(input?.target):input.targetCents,deadline=String(input?.deadline||''),end=dateEnd(deadline);
 if(!title)return fail('Give your collection a short name.');
 if(!Number.isSafeInteger(targetCents)||targetCents<=0||targetCents>MAX_CENTS)return fail('Enter a target above GH₵0.00, with no more than two decimal places.');
 if(end===null||end<Date.now())return fail('Choose today or a future date for your deadline.');
 const result=peopleFor(input?.members||input?.people,'collection');if(!result.ok)return result;
 result.people.forEach(p=>{delete p.inputAmount;});
 const approval=input?.mandateApproval||'majority';
 if(!['majority','everyone','named'].includes(approval))return fail('Choose majority, everyone or named approvers.');
 const memberIds=result.people.map(p=>p.id);let mandate;
 if(approval==='named'){
  const ids=input?.mandateApproverIds,required=input?.mandateRequiredApprovals;
  if(!Array.isArray(ids)||ids.length<2||ids.length>memberIds.length||new Set(ids).size!==ids.length||ids.some(id=>!memberIds.includes(id)))return fail('Choose at least two different group members as approvers.');
  if(!Number.isSafeInteger(required)||required<2||required>ids.length)return fail('Require between two approvals and the number of named approvers.');
  mandate={version:2,approval,memberIds,approverIds:memberIds.filter(id=>ids.includes(id)),requiredApprovals:required};
 }else mandate={version:1,approval,memberIds,requiredApprovals:approval==='everyone'?result.people.length:Math.floor(result.people.length/2)+1};
 return {ok:true,item:{type:'collection',title,targetCents,deadline,description:text(input?.description,240),people:result.people,status:'collecting',mandate,collectionAccount:{reference:'',kind:'group-collection',demo:true}}};
};
// The mandate is fixed when the account is created. This binding also catches
// stale edits to membership, purpose, target or deadline in saved demo records.
const mandateBinding=item=>{
 const fields=[item.mandate?.version,item.mandate?.approval,item.mandate?.memberIds,item.mandate?.requiredApprovals,item.title,item.targetCents,item.deadline,item.description,item.people?.map(p=>[p.id,p.name,!!p.isOwner])];
 // Preserve the exact v1 binding for saved mandates and their existing consent.
 if(item.mandate?.version===2)fields.push(item.mandate.approverIds,item.localPersonId||'self',!!item.invitedSample);
 return JSON.stringify(fields);
};
const approverIds=item=>item?.mandate?.version===2?item.mandate.approverIds||[]:item?.mandate?.memberIds||[];
const localPersonId=item=>item?.localPersonId||'self';
const personName=(item,p)=>p.id===localPersonId(item)?(p.isOwner?item.ownerName:item.localMemberName)||L.state.profile?.name||p.name:p.isOwner?item.ownerName||p.name:p.name;
const mandateValid=item=>{
 const m=item?.mandate,people=item?.people;
 if(!m||!Array.isArray(people)||people.length<2||people.length>MAX_FRIENDS+1||!Array.isArray(m.memberIds)||JSON.stringify(m.memberIds)!==JSON.stringify(people.map(p=>p.id))||new Set(m.memberIds).size!==people.length)return false;
 const v1=m.version===1&&['majority','everyone'].includes(m.approval)&&m.requiredApprovals===(m.approval==='everyone'?people.length:Math.floor(people.length/2)+1);
 const v2=m.version===2&&m.approval==='named'&&Array.isArray(m.approverIds)&&m.approverIds.length>=2&&new Set(m.approverIds).size===m.approverIds.length&&m.approverIds.every(id=>m.memberIds.includes(id))&&Number.isSafeInteger(m.requiredApprovals)&&m.requiredApprovals>=2&&m.requiredApprovals<=m.approverIds.length;
 return (v1||v2)&&(!item.id||item.mandateFingerprint===mandateBinding(item));
};
const mandateSummary=input=>{
 const item=typeof input==='string'?get(input):input;
 if(!auth()||!item||item.type!=='collection'||item.ownerKey!==undefined&&item.ownerKey!==ownerKey())return null;
 const m=item.mandate,valid=mandateValid(item),legacy=!m,ids=valid?approverIds(item):[];
 const people=item.people.map(p=>({...p,isApprover:ids.includes(p.id),role:ids.includes(p.id)?'approver':'contributor',accepted:valid&&(item.mandateAcceptances||[]).some(a=>a.personId===p.id&&a.version===m.version&&a.sample===(p.id!==localPersonId(item)))}));
 const acceptedCount=people.filter(p=>p.accepted).length,memberCount=people.length,requiredApprovals=valid?m.requiredApprovals:0;
 const approvalRule=m?.version===2?'Named approvers: '+people.filter(p=>p.isApprover).map(p=>personName(item,p)).join(', ')+'. Any '+requiredApprovals+' of '+ids.length+' must approve each payment. Each named approver has one vote. Silence is not approval.':'Each member has one vote. '+(m?.approval==='everyone'?'Everyone':requiredApprovals+' of '+memberCount+' members')+' must approve each payment. Silence is not approval.';
 const rules=legacy?['This earlier collection has no agreed mandate. Its history remains available. Create a new collection account to use shared approvals.']:[
  'This collection account is separate from the organiser’s Everyday money.',
  'Every member must accept this mandate and their role before contributions or spending begin.',
  approvalRule,
  'For new payouts, the organiser authorises the exact payment request first. Payment is submitted automatically when the required approvals are complete. Contributors can follow all activity; only the named approvers decide on spending.',
  'Approval covers the exact recipient, purpose, amount and fees. A change needs a new proposal. Proposals expire after 48 hours.',
  'Members, roles and approval rules stay fixed for this collection. The organiser cannot change them alone.',
  'The organiser may cancel the collection. Pending proposals stop and unspent money returns to original sources in proportion to contributions. Completed spending cannot be refunded by Lumo.'
 ];
 return {legacy,valid,approval:m?.approval||null,requiredApprovals,memberCount,approverIds:[...ids],approverCount:ids.length,acceptedCount,allAccepted:valid&&acceptedCount===memberCount,people,rules,version:m?.version||null};
};
const access=input=>{
 const item=typeof input==='string'?get(input):input,empty={isOrganiser:false,isApprover:false,isContributor:false,localPersonId:'self',canView:false,canContribute:false,canPropose:false,canApprove:false,canExecute:false,canCancel:false};
 if(!auth()||!item||item.type!=='collection'||item.ownerKey!==ownerKey()||!list().includes(item))return empty;
 const local=localPersonId(item),person=item.people.find(p=>p.id===local),m=mandateSummary(item),isOrganiser=!!person?.isOwner&&!item.invitedSample&&(m.valid||m.legacy),isApprover=!!person&&m.valid&&m.approverIds.includes(local),active=!['cancelled','refunded'].includes(item.status),ready=active&&m.allAccepted;
 return {isOrganiser,isApprover,isContributor:!!person&&!isApprover,localPersonId:local,canView:!!person,canContribute:!!person&&ready&&dateEnd(item.deadline)>=Date.now(),canPropose:isOrganiser&&ready,canApprove:isApprover&&ready,canExecute:isOrganiser&&ready,canCancel:isOrganiser&&active};
};
const canManage=item=>item?.type!=='collection'||access(item).isOrganiser;
const canActFor=(item,personId,sample)=>personId===localPersonId(item)||canManage(item)&&sample===true;
const fingerprint=item=>JSON.stringify([item.type,item.title,item.totalCents,item.targetCents,item.deadline,item.description,item.mode,item.people,item.sourceTxId,item.sourceQuote,item.mandate]);
const create=(input,preview)=>{
 const result=preview(input);if(!result.ok)return result;
 const s=store();if(!s)return fail('These saved group records need support before another can be created.');
 const key=text(input.idempotencyKey,120),mark=fingerprint(result.item),previous=key&&list().find(i=>i.idempotencyKey===key);
 if(previous)return previous.fingerprint===mark?{ok:true,item:previous,idempotent:true}:fail('This creation reference already belongs to different details. Start a fresh draft.');
 const sourceId=result.item.sourceTxId;
 if(sourceId&&(list().some(i=>i.sourceTxId===sourceId)||(L.state.sharedExpenses?.groups||[]).some(i=>i.txId===sourceId)))return fail('This payment already has a split. Open its existing shared cost.');
 const item={...result.item,id:L.id(result.item.type==='split'?'GS':'GC'),ownerKey:ownerKey(),ownerName:text(L.state.profile?.name,60),createdAt:now(),payments:[],refunds:[],activity:[],demo:true,scope:'device',idempotencyKey:key||null,fingerprint:mark};
 item.activity.push({id:L.id('GA'),type:'created',date:item.createdAt});
 if(item.type==='collection'){
  item.collectionAccount.reference='SAMPLE-'+item.id;item.mandateFingerprint=mandateBinding(item);
  item.mandateAcceptances=[{personId:'self',version:item.mandate.version,date:item.createdAt,sample:false}];item.proposals=[];item.disbursements=[];
  item.activity.push({id:L.id('GA'),type:'mandate-accepted',personId:'self',version:item.mandate.version,sample:false,date:item.createdAt});
 }
 s.items.unshift(item);save();return {ok:true,item};
};
const acceptMandate=input=>{
 if(!auth())return fail('Sign in to your open demo account first.');
 const item=get(input?.itemId),m=mandateSummary(item);if(!item||!m?.valid)return fail('This collection has no current mandate to accept.');
 if(['cancelled','refunded'].includes(item.status))return fail('This collection account is closed.');
 const person=item.people.find(p=>p.id===input.personId);if(!person)return fail('Choose a member of this collection.');
 if(input.version!==item.mandate.version)return fail('Read the current mandate before accepting it.');
 if(!canActFor(item,person.id,input.sample))return fail('You can act only for yourself. Other members can only be simulated by the organiser in this preview.');
 const previous=item.mandateAcceptances.find(a=>a.personId===person.id&&a.version===item.mandate.version);
 if(previous)return {ok:true,item,acceptance:previous,idempotent:true};
 const acceptance={personId:person.id,version:item.mandate.version,date:now(),sample:person.id!==localPersonId(item)};
 item.mandateAcceptances.push(acceptance);item.activity.push({id:L.id('GA'),type:'mandate-accepted',...acceptance});save();return {ok:true,item,acceptance};
};
// Collection payouts reuse the native recipient rails, but their funding
// authority is this pot's accepted mandate rather than Everyday money.
const RAIL_PEOPLE={abena:{name:'Abena Asante',handle:'@abena.a'},kojo:{name:'Kojo Owusu',handle:'@kojo.o'},ama:{name:'Ama Boateng',handle:'@ama.b'}};
const railFee=method=>method==='momo'?50:method==='bank'?100:method==='lumo'?0:null;
const canonicalRail=d=>{
 if(!d||!['lumo','momo','bank'].includes(d.method)||d.checked!==true)return null;
 if(d.method==='lumo'){
  const person=RAIL_PEOPLE[d.recipient];if(!person||d.name!==person.name||d.destination!==person.handle)return null;
  return {version:1,method:'lumo',destination:person.handle,provider:'Lumo',recipientKey:d.recipient};
 }
 if(d.method==='momo'){
  const number=String(d.destination||'').replace(/[\s-]/g,'').replace(/^\+233/,'0');
  if(number!=='0241234567'||d.provider!=='MTN MoMo'||d.name!=='Abena Asante')return null;
  return {version:1,method:'momo',destination:number,provider:'MTN MoMo',recipientKey:number};
 }
 if(d.destination!=='102345678901'||d.provider!=='GCB Bank'||d.name!=='Kwesi Osei')return null;
 return {version:1,method:'bank',destination:'102345678901',provider:'GCB Bank',recipientKey:'102345678901'};
};
const railProposalValid=(item,p)=>{
 const r=p.rail,a=p.requesterAuthorisation;
 const organiser=item.people.find(person=>person.isOwner),local=['pin','biometric-demo'].includes(a?.method)&&a.personId===localPersonId(item),sampleOrganiser=item.invitedSample===true&&a?.method==='sample-organiser'&&a.sample===true&&organiser?.id!==localPersonId(item)&&a.personId===organiser?.id&&a.name===personName(item,organiser);
 if(!r||r.version!==1||!a||!local&&!sampleOrganiser||!a.name||!Number.isFinite(Date.parse(a.authorisedAt))||Date.parse(a.authorisedAt)!==Date.parse(p.createdAt)||p.amountCents>500000||p.feeCents!==railFee(r.method)||p.totalCents!==p.amountCents+p.feeCents)return false;
 const canonical=canonicalRail({method:r.method,checked:true,name:p.recipient,destination:r.destination,provider:r.provider,recipient:r.recipientKey});
 return !!canonical&&JSON.stringify(r)===JSON.stringify(canonical);
};
const railRecordValid=(p,d)=>!!d&&d.proposalId===p.id&&d.reference===payoutReference(p)&&d.fingerprint===p.fingerprint&&d.recipient===p.recipient&&d.purpose===p.purpose&&d.amountCents===p.amountCents&&d.feeCents===p.feeCents&&d.totalCents===p.totalCents&&d.method===p.rail.method&&d.provider===p.rail.provider&&d.destination===p.rail.destination&&JSON.stringify(d.rail)===JSON.stringify(p.rail)&&Array.isArray(d.attempts)&&d.attempts.length>0&&d.attempts.every((attempt,index)=>attempt.id===d.id+'-attempt-'+(index+1)&&attempt.number===index+1)&&d.attemptId===d.attempts[d.attempts.length-1].id;
const railFacts=d=>{
 if(!auth())return fail('Sign in to your open account before requesting a payout.');
 if(!d||d.collectionPayout!==true||L.state.paymentDraft!==d)return fail('Open the collection payout you want to review.');
 const item=get(d.collectionId),m=mandateSummary(item),s=item&&summary(item),a=access(item);
 if(!item||!m?.valid||!m.allAccepted||!a.canPropose||!s||['cancelled','refunded'].includes(s.status))return fail('The organiser can request a payout after everyone accepts the current mandate.');
 const rail=canonicalRail(d),amountCents=cents(d.amount),purpose=text(d.note,160),evidence=validateAttachment(d.attachment);
 if(!rail)return fail('Check the recipient through Lumo, Mobile Money or Bank transfer before reviewing.');
 if(!purpose)return fail('Explain what this collection payout is for.');
 if(amountCents===null||amountCents<=0||amountCents>500000)return fail('Enter GH₵0.01 to GH₵5,000.00, using no more than two decimals.');
 const feeCents=railFee(rail.method),totalCents=amountCents+feeCents;
 if(cents(d.fee)!==feeCents)return fail('The payment fee changed. Review the current full cost.');
 if(!d.id||!/^[A-Za-z0-9_-]{1,120}$/.test(d.id))return fail('Start a payout with a fresh payment reference.');
 if(d.essentialId)return fail('A collection payout cannot use your personal Budget.');
 if(!evidence.ok)return evidence;
 let p=null;
 if(d.collectionProposalId){
  p=proposal(item.id,d.collectionProposalId);const state=p&&proposalSummary(item.id,p.id);
  if(!p?.rail||!state?.valid||!state.canRetry||!railRecordValid(p,state.disbursement)||p.recipient!==d.name||p.purpose!==purpose||p.amountCents!==amountCents||p.feeCents!==feeCents||JSON.stringify(p.rail)!==JSON.stringify(rail)||(p.supportingReference||'')!==text(d.supportingReference,240)||JSON.stringify(p.attachment||null)!==JSON.stringify(evidence.attachment))return fail('This retry must match the approved payout and still have its required approvals.');
 }
 if(totalCents>s.availableCents)return fail('Only '+format(s.availableCents)+' is available in this collection after other payout requests.');
 return {ok:true,item,proposal:p,rail,recipient:d.name,purpose,amountCents,feeCents,totalCents,balanceAfterCents:s.balanceCents-totalCents,requiredApprovals:m.requiredApprovals,approverCount:m.approverCount,supportingReference:text(d.supportingReference,240),attachment:evidence.attachment};
};
const railScope=(d,q)=>JSON.stringify([ownerKey(),d.id,d.collectionId,d.collectionProposalId||'',q.item.title,q.item.collectionAccount,q.item.people,localPersonId(q.item),q.item.mandate,q.item.mandateFingerprint,q.item.mandateAcceptances,q.item.status,summary(q.item).balanceCents,summary(q.item).reservedCents,q.item.proposals,q.item.disbursements,q.rail,q.recipient,q.purpose,q.amountCents,q.feeCents,q.supportingReference,q.attachment]);
// Compare credential descriptors without invoking a PIN accessor during a
// biometric review. Only the ephemeral token record retains this descriptor.
const railCredential=()=>({profile:L.state.profile,descriptor:Object.getOwnPropertyDescriptor(L.state.profile||{},'pin')});
const railCredentialCurrent=r=>{const c=railCredential(),a=r?.credential?.descriptor,b=c.descriptor;return r?.credential?.profile===c.profile&&a?.value===b?.value&&a?.get===b?.get&&a?.set===b?.set;};
const prepareRailPayout=input=>{
 const d=input?.draft||input,q=railFacts(d);if(!q.ok)return q;
 if(input?.draft&&input.itemId&&input.itemId!==d.collectionId)return fail('Review this collection’s payout.');
 const token=Object.freeze({}),expiresAt=Date.now()+PAYOUT_REVIEW_LIFETIME;
 const quote={token,itemId:q.item.id,collectionName:q.item.title,collectionReference:q.item.collectionAccount?.reference||'',method:q.rail.method,destination:q.rail.destination,provider:q.rail.provider,recipient:q.recipient,purpose:q.purpose,amountCents:q.amountCents,feeCents:q.feeCents,totalCents:q.totalCents,balanceAfterCents:q.balanceAfterCents,requiredApprovals:q.requiredApprovals,approverCount:q.approverCount,supportingReference:q.supportingReference,attachment:q.attachment,expiresAt:new Date(expiresAt).toISOString()};
 railPayoutReviews.set(token,{state:L.state,draft:d,item:q.item,scope:railScope(d,q),expiresAt,credential:railCredential()});return {ok:true,quote};
};
const railPayoutCurrent=(d,token)=>{
 const q=railFacts(d),r=token&&typeof token==='object'?railPayoutReviews.get(token):null;
 return !!q.ok&&!!r&&r.state===L.state&&r.draft===d&&r.item===q.item&&r.expiresAt>Date.now()&&railCredentialCurrent(r)&&r.scope===railScope(d,q);
};
const discardRailPayoutReview=token=>!!token&&typeof token==='object'&&railPayoutReviews.delete(token);
const dispatchRailPayout=(item,p,attemptAuthorisation=p.requesterAuthorisation)=>{
 const state=proposalSummary(item.id,p.id),m=mandateSummary(item),funds=summary(item);
 if(!p.rail||!state?.valid||!m.allAccepted||state.approvalCount<p.requiredApprovals||!['ready','failed'].includes(state.status)||!attemptAuthorisation||state.expired)return fail('The payout still needs its current mandate approvals.');
 if(state.status==='failed'?funds.availableCents<p.totalCents:funds.balanceCents<funds.reservedCents||funds.balanceCents<p.totalCents)return fail('The reserved collection funds are unavailable.');
 let d=state.disbursement;const stamp=now();
 if(d&&!railRecordValid(p,d))return fail('The original payout record changed. Keep its reference for support.');
 if(!d){d={id:L.id('GD'),reference:payoutReference(p),proposalId:p.id,recipient:p.recipient,purpose:p.purpose,amountCents:p.amountCents,feeCents:p.feeCents,totalCents:p.totalCents,date:stamp,sample:true,destination:p.rail.destination,provider:p.rail.provider,method:p.rail.method,rail:{...p.rail},fingerprint:p.fingerprint,attempts:[]};item.disbursements.push(d);}
 d.status='processing';d.updatedAt=stamp;d.attemptId=d.id+'-attempt-'+(d.attempts.length+1);d.attempts.push({id:d.attemptId,number:d.attempts.length+1,date:stamp,status:'processing',authorisation:{...attemptAuthorisation}});
 p.status='processing';d.receipt={...receiptSnapshot(item,p,d),attemptAuthorisation:{...attemptAuthorisation}};
 item.activity.push({id:L.id('GA'),type:'payout-submitted',proposalId:p.id,disbursementId:d.id,reference:d.reference,date:stamp,sample:true});return {ok:true,item,proposal:p,disbursement:d};
};
const authorizeRailPayout=input=>{
 const d=input?.draft,token=input?.reviewToken;
 if(!auth()||L.route!=='authorize'||!railPayoutCurrent(d,token)){discardRailPayoutReview(token);return {...fail('Your payout review changed or expired. Review it again before authorising.'),needsReview:true};}
 const q=railFacts(d);let method='pin';
 if(L.biometricPayment?.consume(input.biometricProof,d))method='biometric-demo';
 else{
  const credential=L.authPolicy?.verify(input?.pin,{purpose:'Authorise collection payout request'});
  if(!credential?.ok){
   if(credential?.locked)railPayoutReviews=new WeakMap();
   return {...fail(credential?.message||'Secure approval is unavailable. Reopen Lumo before trying again.'),locked:!!credential?.locked,coolingDown:!!credential?.coolingDown,seconds:credential?.seconds||0};
  }
 }
 discardRailPayoutReview(token);
 return railAtomic(()=>{
  if(!railFacts(d).ok)throw Error('The collection payout changed before it could be authorised.');
  const authorisedAt=now(),authorisation={personId:localPersonId(q.item),name:personName(q.item,q.item.people.find(p=>p.id===localPersonId(q.item))),method,authorisedAt};
  let result;
  if(q.proposal){result=dispatchRailPayout(q.item,q.proposal,authorisation);if(!result.ok)throw Error(result.error);}
  else{
   result=createProposalFor(q.item,{recipient:q.recipient,purpose:q.purpose,amount:q.amountCents/100,supportingReference:q.supportingReference,attachment:q.attachment,idempotencyKey:d.id},false);if(!result.ok)throw Error(result.error);
   const p=result.proposal;if(result.idempotent)throw Error('This payment reference already has a request. Open its payout instead.');
   p.rail=q.rail;p.requesterAuthorisation={...authorisation,authorisedAt:p.createdAt};p.feeCents=q.feeCents;p.totalCents=q.totalCents;p.fingerprint=proposalBinding(p);
   q.item.activity.push({id:L.id('GA'),type:'payout-authorised',proposalId:p.id,personId:authorisation.personId,date:p.createdAt,sample:true});
  }
  d.collectionProposalId=result.proposal.id;d.submittedTxId=result.proposal.id;return result;
 });
};

const proposalBinding=p=>{const fields=[p.id,p.idempotencyKey,p.itemId,p.recipient,p.purpose,p.amountCents,p.feeCents,p.totalCents,p.mandateVersion,p.mandateFingerprint,p.memberIds,p.requiredApprovals,p.createdAt,p.expiresAt];if(p.mandateVersion===2)fields.push(p.approverIds);if(Object.prototype.hasOwnProperty.call(p,'rail'))fields.push(p.rail,p.requesterAuthorisation);if(Object.prototype.hasOwnProperty.call(p,'supportingReference'))fields.push(p.supportingReference);if(Object.prototype.hasOwnProperty.call(p,'attachment'))fields.push(p.attachment?[p.evidenceVersion,p.attachment.name,p.attachment.type,p.attachment.size,p.attachmentDigest]:p.attachment);return JSON.stringify(fields);};
const proposalValid=(item,p)=>!!p&&(!Object.prototype.hasOwnProperty.call(p,'attachment')||p.evidenceVersion===1&&!!validateAttachment(p.attachment).attachment&&p.attachmentDigest===validateAttachment(p.attachment).digest)&&mandateValid(item)&&p.itemId===item.id&&Number.isSafeInteger(p.amountCents)&&p.amountCents>0&&p.amountCents<=MAX_CENTS&&(p.rail?railProposalValid(item,p):p.feeCents===0&&p.totalCents===p.amountCents)&&
 (item.proposals||[]).filter(candidate=>candidate.id===p.id).length===1&&(item.proposals||[]).filter(candidate=>candidate.idempotencyKey===p.idempotencyKey).length===1&&
 p.mandateVersion===item.mandate.version&&p.mandateFingerprint===item.mandateFingerprint&&JSON.stringify(p.memberIds)===JSON.stringify(item.mandate.memberIds)&&p.requiredApprovals===item.mandate.requiredApprovals&&(p.mandateVersion!==2||JSON.stringify(p.approverIds)===JSON.stringify(item.mandate.approverIds))&&
 Number.isFinite(Date.parse(p.createdAt))&&Date.parse(p.expiresAt)-Date.parse(p.createdAt)===PROPOSAL_LIFETIME&&p.fingerprint===proposalBinding(p);
const decisionIds=(item,p,kind)=>{
 const m=mandateSummary(item),ids=new Set();if(!proposalValid(item,p)||!m?.valid)return [];
 for(const decision of p[kind]||[]){const person=m.people.find(person=>person.id===decision.personId);if(person?.accepted&&person.isApprover&&decision.version===p.mandateVersion&&decision.fingerprint===p.fingerprint&&decision.sample===(person.id!==localPersonId(item)))ids.add(person.id);}
 return [...ids];
};
const payoutRecord=(item,p)=>(item.disbursements||[]).find(d=>d.proposalId===p.id)||null;
const payoutReference=p=>'SAMPLE-PAYOUT-'+p.id;
const pendingProposal=(item,p)=>{
 if(!proposalValid(item,p))return false;
 // A submitted payment retains its hold until the explicit sample result is
 // known, including after the proposal's approval window has elapsed.
 if(payoutRecord(item,p)?.status==='processing')return true;
 return p.status==='pending'&&Date.parse(p.expiresAt)>Date.now()&&!['cancelled','refunded'].includes(item.status)&&approverIds(item).length-decisionIds(item,p,'declines').length>=p.requiredApprovals;
};
const proposal=(itemId,proposalId)=>{const item=get(itemId);return item?.type==='collection'?(item.proposals||[]).find(p=>p.id===proposalId)||null:null;};
const summary=input=>{
 const item=typeof input==='string'?get(input):input;
 if(!item||!auth()||item.ownerKey!==ownerKey())return null;
 const payments=(item.payments||[]).filter(p=>p.status==='confirmed'),refunds=item.refunds||[];
 const grossReceivedCents=payments.reduce((n,p)=>n+p.amountCents,0),refundedCents=refunds.reduce((n,r)=>n+r.amountCents,0),receivedCents=Math.max(0,grossReceivedCents-refundedCents);
 const people=item.people.map(p=>{
  const gross=payments.filter(r=>r.personId===p.id).reduce((n,r)=>n+r.amountCents,0),back=refunds.filter(r=>r.personId===p.id).reduce((n,r)=>n+r.amountCents,0),received=Math.max(0,gross-back);
  return {...p,isApprover:item.type==='collection'&&approverIds(item).includes(p.id),role:item.type==='collection'?(approverIds(item).includes(p.id)?'approver':'contributor'):undefined,receivedCents:received,grossReceivedCents:gross,refundedCents:back,dueCents:item.type==='split'&&!p.isOwner?Math.max(0,p.amountCents-received):0};
 });
 const askedCents=item.type==='split'?people.filter(p=>!p.isOwner).reduce((n,p)=>n+p.amountCents,0):item.targetCents;
 const remainingCents=Math.max(0,askedCents-receivedCents),expired=item.type==='collection'&&dateEnd(item.deadline)<Date.now();
 let status=item.status;
 if(!['cancelled','refunded'].includes(status))status=item.type==='split'?(remainingCents===0?'settled':receivedCents>0?'partial':'due'):(remainingCents===0?'completed':expired?'expired':'collecting');
 const sourceValid=sourceCurrent(item);
 const mandate=item.type==='collection'?mandateSummary(item):null,mandateReady=item.type==='split'||!!mandate?.allAccepted;
 const spentCents=item.type==='collection'?(item.disbursements||[]).filter(d=>d.status==='confirmed').reduce((n,d)=>n+d.totalCents,0):0;
 const balanceCents=item.type==='collection'?Math.max(0,receivedCents-spentCents):0;
 const processing=(item.disbursements||[]).filter(d=>d.status==='processing');
 const reservedCents=item.type==='collection'?processing.reduce((n,d)=>n+(Number.isSafeInteger(d.totalCents)&&d.totalCents>0?d.totalCents:0),0)+(item.proposals||[]).filter(p=>!processing.some(d=>d.proposalId===p.id)&&pendingProposal(item,p)).reduce((n,p)=>n+p.totalCents,0):0;
 return {id:item.id,type:item.type,people,totalCents:item.totalCents||item.targetCents,targetCents:item.targetCents||askedCents,askedCents,receivedCents,grossReceivedCents,refundedCents,dueCents:remainingCents,remainingCents,progress:askedCents?Math.min(1,receivedCents/askedCents):0,status,expired,sourceCurrent:sourceValid,canReceive:sourceValid&&mandateReady&&!['cancelled','refunded','settled','completed','expired'].includes(status),ownerCents:people.find(p=>p.isOwner)?.amountCents||0,balanceCents,spentCents,reservedCents,availableCents:Math.max(0,balanceCents-reservedCents),mandateReady};
};
const proposalSummary=(itemId,proposalId)=>{
 const item=get(itemId),p=proposal(itemId,proposalId);if(!item||!p)return null;
 const valid=proposalValid(item,p),m=mandateSummary(item),state=summary(item),approved=decisionIds(item,p,'approvals'),declined=decisionIds(item,p,'declines');
 const approvalCount=approved.length,disbursement=payoutRecord(item,p),paid=disbursement?.status==='confirmed',processing=disbursement?.status==='processing',failed=disbursement?.status==='failed',expired=Date.parse(p.expiresAt)<=Date.now(),closed=['cancelled','refunded'].includes(item.status),canReachApprovalThreshold=(m?.approverCount||0)-declined.length>=p.requiredApprovals;
 const status=!valid?'invalid':paid?'paid':processing?'processing':closed||p.status==='cancelled'?'cancelled':expired?'expired':!canReachApprovalThreshold?'declined':failed?'failed':p.status!=='pending'?'invalid':approvalCount>=p.requiredApprovals?'ready':'pending';
 const enoughFunds=status==='failed'?state.availableCents>=p.totalCents:state.balanceCents>=state.reservedCents&&state.balanceCents>=p.totalCents;
 const availableToExecute=!p.rail&&status==='ready'&&m.allAccepted&&enoughFunds&&access(item).canExecute;
 const canRetry=status==='failed'&&approvalCount>=p.requiredApprovals&&m.allAccepted&&enoughFunds&&access(item).canExecute;
 return {...p,status,valid,approvalCount,approvedPersonIds:approved,declinedPersonIds:declined,declineCount:declined.length,canReachApprovalThreshold,requiredApprovals:p.requiredApprovals,availableToExecute,canRetry,expired,paid:!!paid,processing:!!processing,failed:!!failed,disbursement:disbursement||null,receipt:disbursement?.receipt||null,reference:disbursement?.reference||payoutReference(p),attemptId:disbursement?.attemptId||null};
};
const createProposalFor=(item,input,persist=true)=>{
 const m=mandateSummary(item);if(!item||item.type!=='collection'||!m?.valid)return fail('Open a collection account with an agreed mandate.');
 if(['cancelled','refunded'].includes(item.status))return fail('This collection account is closed to spending.');
 if(!m.allAccepted)return fail('Every member must accept the mandate before spending begins.');
 const recipient=text(input?.recipient,100),purpose=text(input?.purpose,160),supportingReference=text(input?.supportingReference,240),amountCents=cents(input?.amount),key=text(input?.idempotencyKey,120),evidence=validateAttachment(input?.attachment);
 if(!evidence.ok)return evidence;const attachment=evidence.attachment;
 if(!recipient)return fail('Name the person or supplier receiving this payment.');
 if(!purpose)return fail('Explain what this payment is for.');
 if(amountCents===null||amountCents<=0)return fail('Enter a payment above GH₵0.00, with no more than two decimal places.');
 if(!key||!/^[A-Za-z0-9_-]{1,120}$/.test(key))return fail('Use a fresh payment proposal reference.');
 const previous=(item.proposals||[]).find(p=>p.idempotencyKey===key);
 if(previous)return proposalValid(item,previous)&&previous.recipient===recipient&&previous.purpose===purpose&&previous.amountCents===amountCents&&(previous.supportingReference||'')===supportingReference&&JSON.stringify(previous.attachment||null)===JSON.stringify(attachment)?{ok:true,item,proposal:previous,idempotent:true}:fail('This proposal reference belongs to different payment details. Start a fresh proposal.');
 if(attachment){
  const used=list().reduce((total,group)=>total+(group.proposals||[]).reduce((sum,request)=>sum+(request.attachment?.size||0),0),0),projected=JSON.stringify(L.state).length+3*attachment.dataUrl.length+32768;
  if(used+attachment.size>1024*1024||projected>2*1024*1024)return fail('This device preview has no room for that supporting file. Choose a smaller file or use an invoice reference.');
 }
 const state=summary(item);if(amountCents>state.availableCents)return fail('Only '+format(state.availableCents)+' is available after other payment proposals.');
 const createdAt=now(),p={id:L.id('GQ'),itemId:item.id,recipient,purpose,amountCents,feeCents:0,totalCents:amountCents,createdAt,expiresAt:new Date(Date.parse(createdAt)+PROPOSAL_LIFETIME).toISOString(),status:'pending',mandateVersion:item.mandate.version,mandateFingerprint:item.mandateFingerprint,memberIds:[...item.mandate.memberIds],requiredApprovals:item.mandate.requiredApprovals,approvals:[],declines:[],idempotencyKey:key,sample:true,...(supportingReference?{supportingReference}:{}),...(attachment?{attachment,evidenceVersion:1,attachmentDigest:evidence.digest}:{}),...(item.mandate.version===2?{approverIds:[...item.mandate.approverIds]}:{})};
 p.fingerprint=proposalBinding(p);item.proposals.push(p);item.activity.push({id:L.id('GA'),type:'proposal-created',proposalId:p.id,date:createdAt,sample:true});if(persist)save();return {ok:true,item,proposal:p};
};
const createProposal=input=>{
 if(!auth())return fail('Sign in to your open demo account first.');
 const item=get(input?.itemId);if(!item||!canManage(item))return fail('Only the organiser can propose a payment for this collection.');
 return createProposalFor(item,input);
};
const decideProposal=(input,kind)=>{
 if(!auth())return fail('Sign in to your open demo account first.');
 const item=get(input?.itemId),p=proposal(input?.itemId,input?.proposalId),state=proposalSummary(input?.itemId,input?.proposalId),m=mandateSummary(item);
 if(!item||!p||!state?.valid)return fail('This payment proposal changed. Start a new proposal for fresh approvals.');
 if(input.version!==p.mandateVersion||input.fingerprint!==undefined&&input.fingerprint!==p.fingerprint)return fail('Read the current mandate and exact payment details before deciding.');
 const person=m.people.find(person=>person.id===input.personId);if(!person?.accepted||!person.isApprover)return fail('Only a named approver who accepted this mandate can decide on this payment.');
 if(!canActFor(item,person.id,input.sample))return fail('You can act only for yourself. Other members can only be simulated by the organiser in this preview.');
 const previous=(p[kind]||[]).find(a=>a.personId===person.id&&a.version===p.mandateVersion&&a.fingerprint===p.fingerprint);
 if(previous)return {ok:true,item,proposal:p,[kind==='approvals'?'approval':'decline']:previous,idempotent:true};
 if(!['pending','ready'].includes(state.status)||!m?.allAccepted)return fail('This payment proposal is no longer open for decisions.');
 const other=kind==='approvals'?'declines':'approvals';
 if((p[other]||[]).some(a=>a.personId===person.id&&a.version===p.mandateVersion&&a.fingerprint===p.fingerprint))return fail('Your decision on these payment details is already recorded.');
 const decision={personId:person.id,version:p.mandateVersion,fingerprint:p.fingerprint,sample:person.id!==localPersonId(item),date:now()};
 const record=()=>{
  if(!Array.isArray(p[kind]))p[kind]=[];p[kind].push(decision);item.activity.push({id:L.id('GA'),type:kind==='approvals'?'proposal-approved':'proposal-declined',proposalId:p.id,...decision});
  if(p.rail&&kind==='approvals'&&decisionIds(item,p,'approvals').length>=p.requiredApprovals){const dispatched=dispatchRailPayout(item,p);if(!dispatched.ok)throw Error(dispatched.error);}
  save();return {ok:true,item,proposal:p,[kind==='approvals'?'approval':'decline']:decision};
 };
 return p.rail?railAtomic(record):record();
};
const approveProposal=input=>decideProposal(input,'approvals');
const declineProposal=input=>decideProposal(input,'declines');
const cancelProposal=input=>{
 if(!auth())return fail('Sign in to your open demo account first.');
 const item=get(input?.itemId),p=proposal(input?.itemId,input?.proposalId),state=proposalSummary(input?.itemId,input?.proposalId);
 if(!item||!p||!state?.valid||!canManage(item))return fail('Only the organiser can withdraw this current payout request.');
 if(input.fingerprint!==undefined&&input.fingerprint!==p.fingerprint)return fail('This request changed. Review its exact details before withdrawing.');
 if(p.status==='cancelled')return {ok:true,item,proposal:p,idempotent:true};
 if(!['pending','ready','failed'].includes(state.status))return fail(state.status==='processing'?'This payout is processing. Check its result instead of withdrawing it.':'This payout request can no longer be withdrawn.');
 const withdraw=()=>{p.status='cancelled';p.cancelledAt=now();item.activity.push({id:L.id('GA'),type:'proposal-cancelled',proposalId:p.id,date:p.cancelledAt,sample:true});save();return {ok:true,item,proposal:p};};return p.rail?railAtomic(withdraw):withdraw();
};

const releaseScope=(item,p)=>JSON.stringify([ownerKey(),L.state.profile?.pin,item.id,p.fingerprint,p.status,item.mandateAcceptances,p.approvals,p.declines||[],summary(item).balanceCents,summary(item).reservedCents,item.disbursements||[],access(item).localPersonId,access(item).canExecute]);
const preparePayout=input=>{
 if(!auth())return fail('Sign in to your open demo account first.');
 const item=get(input?.itemId),p=proposal(input?.itemId,input?.proposalId),state=proposalSummary(input?.itemId,input?.proposalId);
 if(!item||!p||!state?.valid)return fail('Review the current payout details first.');
 if(p.rail)return fail('This payout was authorised before approval. Retry through its original payment rail.');
 if(!state.availableToExecute&&!state.canRetry)return fail(state.status==='processing'?'This payout is processing. Check its status instead of paying again.':state.status==='expired'?'This request expired. Start a fresh request.':'The mandate approvals and available collection funds are required before payment.');
 const token=Object.freeze({}),expiresAt=Date.now()+PAYOUT_REVIEW_LIFETIME,quote={token,itemId:item.id,proposalId:p.id,reference:state.reference,recipient:p.recipient,purpose:p.purpose,amountCents:p.amountCents,feeCents:p.feeCents,totalCents:p.totalCents,balanceAfterCents:summary(item).balanceCents-p.totalCents,expiresAt:new Date(expiresAt).toISOString(),supportingReference:p.supportingReference||'',attachment:p.attachment?{...p.attachment}:null};
 payoutReviews.set(token,{state:L.state,item,proposal:p,scope:releaseScope(item,p),expiresAt,reference:state.reference});return {ok:true,quote};
};
const discardPayoutReview=input=>!!input?.reviewToken&&typeof input.reviewToken==='object'&&payoutReviews.delete(input.reviewToken);
const receiptSnapshot=(item,p,d,balanceAfterCents=null)=>({...(p.rail?{rail:{...p.rail},requesterAuthorisation:{...p.requesterAuthorisation}}:{}),reference:d.reference,collectionId:item.id,collectionName:item.title,collectionAccountReference:item.collectionAccount?.reference||'',recipient:p.recipient,purpose:p.purpose,supportingReference:p.supportingReference||'',...(p.attachment?{attachment:{...p.attachment}}:{}),amountCents:p.amountCents,feeCents:p.feeCents,totalCents:p.totalCents,mandateVersion:p.mandateVersion,requiredApprovals:p.requiredApprovals,approvers:mandateSummary(item).people.filter(person=>person.isApprover).map(person=>({personId:person.id,name:personName(item,person),decision:decisionIds(item,p,'approvals').includes(person.id)?'approved':decisionIds(item,p,'declines').includes(person.id)?'declined':'awaiting',sample:person.id!==localPersonId(item)})),requestedAt:p.createdAt,submittedAt:d.attempts?.[d.attempts.length-1]?.date||d.date,attemptCount:d.attempts?.length||1,attemptId:d.attemptId||null,paidAt:d.status==='confirmed'?(d.confirmedAt||d.date):null,balanceAfterCents,sample:true});
const executeSampleProposal=input=>{
 if(!auth())return fail('Sign in to your open demo account first.');
 const item=get(input?.itemId),p=proposal(input?.itemId,input?.proposalId),state=proposalSummary(input?.itemId,input?.proposalId);
 if(!item||!p||!state?.valid)return fail('This payment proposal changed. Start a new proposal for fresh approvals.');
 if(!canManage(item))return fail('Only the organiser can release an approved collection payout.');
 if(p.rail)return fail('This payout is submitted automatically after its mandate approvals.');
 if(state.paid||state.processing)return {ok:true,item,proposal:p,disbursement:state.disbursement,idempotent:true};
 const token=input?.reviewToken,review=token&&typeof token==='object'?payoutReviews.get(token):null;
 if(!review||review.state!==L.state||review.item!==item||review.proposal!==p||review.expiresAt<=Date.now()||review.scope!==releaseScope(item,p)||!state.availableToExecute&&!state.canRetry){if(token&&typeof token==='object')payoutReviews.delete(token);return {...fail('Your payout review changed or expired. Review it again before authorising.'),needsReview:true};}
 const outcome=input.outcome||'Pending';if(!['Completed','Pending','Failed'].includes(outcome))return fail('Choose a supported sample payment result.');
 const credential=L.authPolicy?.verify(input.pin,{purpose:'Release earlier collection payout'});
 if(!credential?.ok){
  if(credential?.locked)payoutReviews=new WeakMap();
  return {...fail(credential?.message||'Secure approval is unavailable. Reopen Lumo before trying again.'),locked:!!credential?.locked,coolingDown:!!credential?.coolingDown,seconds:credential?.seconds||0};
 }
 payoutReviews.delete(token);
 let d=state.disbursement;const stamp=now();
 if(!d){d={id:L.id('GD'),reference:review.reference,proposalId:p.id,recipient:p.recipient,purpose:p.purpose,amountCents:p.amountCents,feeCents:p.feeCents,totalCents:p.totalCents,date:stamp,sample:true,status:'processing',destination:'sample-recipient',fingerprint:p.fingerprint,attempts:[]};item.disbursements.push(d);}
 d.status=outcome==='Completed'?'confirmed':outcome==='Failed'?'failed':'processing';d.updatedAt=stamp;d.attempts=d.attempts||[];d.attemptId=d.id+'-attempt-'+(d.attempts.length+1);d.attempts.push({id:d.attemptId,number:d.attempts.length+1,date:stamp,status:d.status});
 if(d.status==='confirmed'){d.confirmedAt=stamp;p.status='paid';p.paidAt=stamp;}else p.status=d.status==='failed'?'failed':'processing';
 d.receipt=receiptSnapshot(item,p,d,d.status==='confirmed'?summary(item).balanceCents:null);
 item.activity.push({id:L.id('GA'),type:d.status==='confirmed'?'sample-disbursement':d.status==='failed'?'payout-failed':'payout-submitted',proposalId:p.id,disbursementId:d.id,reference:d.reference,date:stamp,sample:true});save();return {ok:true,item,proposal:p,disbursement:d};
};
const settleSamplePayout=input=>{
 if(!auth())return fail('Sign in to your open demo account first.');
 const item=get(input?.itemId),p=proposal(input?.itemId,input?.proposalId),d=item&&p?payoutRecord(item,p):null;
 if(!item||!p||!proposalValid(item,p)||!canManage(item)&&!(p.rail&&item.invitedSample&&access(item).canView))return fail('Open the current collection payout.');
 if(input.sample!==true||!d||p.rail&&!railRecordValid(p,d)||input.reference!==d.reference||input.attemptId!==d.attemptId||!d.attemptId||d.fingerprint!==p.fingerprint)return fail('Check this payout’s exact sample reference and submitted attempt.');
 if(!['Completed','Failed'].includes(input.outcome))return fail('Choose a completed or failed sample result.');
 if(d.status==='confirmed'||d.status==='failed')return {ok:true,item,proposal:p,disbursement:d,idempotent:true};
 if(d.status!=='processing')return fail('This payout has no pending result to check.');
 const settle=()=>{
 const stamp=now();d.status=input.outcome==='Completed'?'confirmed':'failed';d.updatedAt=stamp;
 const last=d.attempts?.[d.attempts.length-1];if(last){last.status=d.status;last.resolvedAt=stamp;}
 if(d.status==='confirmed'){d.confirmedAt=stamp;p.status='paid';p.paidAt=stamp;}else p.status='failed';
 d.receipt={...(d.receipt||receiptSnapshot(item,p,d)),paidAt:d.status==='confirmed'?stamp:null,balanceAfterCents:d.status==='confirmed'?summary(item).balanceCents:null};
 item.activity.push({id:L.id('GA'),type:d.status==='confirmed'?'sample-disbursement':'payout-failed',proposalId:p.id,disbursementId:d.id,reference:d.reference,date:stamp,sample:true});save();return {ok:true,item,proposal:p,disbursement:d};
 };return p.rail?railAtomic(settle):settle();
};
const recordSamplePayment=input=>{
 if(!auth())return fail('Sign in to your open demo account first.');
 const item=get(input?.itemId);if(!item)return fail('Open one of your saved group records first.');
 const person=item.people.find(p=>p.id===input.personId),amountCents=cents(input.amount),reference=text(input.reference,120);
 if(!person)return fail('Choose a person in this group.');
 if(item.type==='collection'&&!canActFor(item,person.id,true))return fail('You can record only your own sample contribution to a joined collection.');
 if(!reference||!/^[A-Za-z0-9_-]{1,120}$/.test(reference))return fail('Use a fresh sample payment reference.');
 if(amountCents===null||amountCents<=0)return fail('Enter an amount above GH₵0.00, with no more than two decimal places.');
 const used=list().flatMap(i=>(i.payments||[]).map(p=>({item:i,payment:p}))).find(x=>x.payment.reference===reference);
 if(used)return used.item.id===item.id&&used.payment.personId===person.id&&used.payment.amountCents===amountCents?{ok:true,item,payment:used.payment,idempotent:true}:fail('This sample payment reference has already been used for different details.');
 const state=summary(item);if(!state.sourceCurrent)return fail('The original payment changed. New repayments are paused.');
 if(item.type==='collection'&&!state.mandateReady)return fail(item.mandate?'Every member must accept the mandate before contributing.':'This earlier collection has no agreed mandate. Create a new collection account for shared approvals.');
 if(!state.canReceive)return fail('This group record is closed to new sample payments.');
 if(item.type==='split'&&person.isOwner)return fail('Your share was already included in the expense.');
 const limit=item.type==='split'?state.people.find(p=>p.id===person.id).dueCents:state.remainingCents;
 if(amountCents>limit)return fail('Enter no more than '+format(limit)+(item.type==='split'?' for this unpaid share.':' to reach this target.'));
 const payment={id:L.id('GP'),reference,personId:person.id,amountCents,status:'confirmed',sample:true,date:now()};
 item.payments.push(payment);item.activity.push({id:L.id('GA'),type:'sample-payment',paymentId:payment.id,date:payment.date});item.status=summary(item).status;save();return {ok:true,item,payment};
};
const cancel=id=>{
 if(!auth())return fail('Sign in to your open demo account first.');const item=get(id);if(!item)return fail('This group record is unavailable.');
 if(!canManage(item))return fail('Only the organiser can cancel this collection.');
 if(['cancelled','refunded'].includes(item.status))return {ok:true,item,idempotent:true};
 if((item.disbursements||[]).some(d=>d.status==='processing'))return fail('A collection payout is processing. Check its result before cancelling or refunding.');
 item.status='cancelled';item.cancelledAt=now();
 for(const p of item.proposals||[])if(p.status==='pending'){p.status='cancelled';p.cancelledAt=item.cancelledAt;}
 item.activity.push({id:L.id('GA'),type:'cancelled',date:item.cancelledAt});save();return {ok:true,item};
};
const refundAllocation=item=>{
 const balance=summary(item).balanceCents;
 const sources=item.payments.filter(p=>p.status==='confirmed').map((payment,index)=>({payment,index,remaining:Math.max(0,payment.amountCents-(item.refunds||[]).filter(r=>r.paymentId===payment.id).reduce((n,r)=>n+r.amountCents,0))})).filter(s=>s.remaining>0);
 const weight=sources.reduce((n,s)=>n+s.remaining,0);
 // Integer largest-remainder allocation returns exactly the unspent balance.
 // BigInt keeps the product exact even at the largest preview target.
 if(balance>0&&weight>0){
  let allocated=0;
  for(const source of sources){const numerator=BigInt(balance)*BigInt(source.remaining);source.amountCents=Number(numerator/BigInt(weight));source.remainder=numerator%BigInt(weight);allocated+=source.amountCents;}
  const ranked=[...sources].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1);
  for(let i=0;i<balance-allocated;i++)ranked[i].amountCents++;
 }
 return sources.filter(source=>source.amountCents>0).map(({payment,amountCents})=>({payment,amountCents}));
};
const refundPreview=id=>{
 if(!auth())return fail('Sign in to your open demo account first.');const item=get(id);if(!item||item.type!=='collection')return fail('Open a saved collection.');
 if(!canManage(item))return fail('Only the organiser can return unspent collection money under the mandate.');
 if(item.status!=='cancelled')return fail('Cancel the collection before returning its unspent money.');
 if((item.disbursements||[]).some(d=>d.status==='processing'))return fail('Check the processing payout result before returning collection money.');
 const allocations=refundAllocation(item),local=localPersonId(item);
 return {ok:true,totalCents:allocations.reduce((sum,row)=>sum+row.amountCents,0),personalCents:allocations.filter(row=>row.payment.personId===local&&row.payment.personalTxId&&row.payment.source==='everyday-account').reduce((sum,row)=>sum+row.amountCents,0),allocations};
};
const refund=id=>{
 if(!auth())return fail('Sign in to your open demo account first.');const item=get(id);if(!item)return fail('This collection is unavailable.');
 if(item.type!=='collection')return fail('Expense repayments are not a pooled collection to refund.');
 if(!canManage(item))return fail('Only the organiser can record refunds under this collection’s mandate.');
 if(item.status==='refunded')return {ok:true,item,idempotent:true};
 const quote=refundPreview(id);if(!quote.ok)return quote;
 for(const {payment,amountCents} of quote.allocations)item.refunds.push({id:L.id('GR'),paymentId:payment.id,personId:payment.personId,amountCents,date:now(),sample:true,destination:'original-sample-source'});
 item.status='refunded';item.refundedAt=now();item.activity.push({id:L.id('GA'),type:'sample-refunds',date:item.refundedAt});save();return {ok:true,item};
};
const shareText=id=>{
 const item=get(id),state=summary(item);if(!item||!state)return '';
 if(item.type==='collection'){
  const m=mandateSummary(item),members=item.people.map(p=>personName(item,p)).join(', '),local=item.people.find(p=>p.id===localPersonId(item)),sharedBy=local?personName(item,local):text(L.state.profile?.name,60)||'Member';
  return `Lumo collection account: ${item.title}\n${item.collectionAccount?.reference||'Earlier collection record'}\nTarget ${format(item.targetCents)} by ${item.deadline}. Sample balance ${format(state.balanceCents)}.\nMembers: ${members}.\nShared by: ${sharedBy} · ${access(item).isOrganiser?'Organiser':access(item).isApprover?'Approver':'Contributor'}.\nMandate${m.legacy?' not recorded':' v'+m.version+' · '+m.acceptedCount+' of '+m.memberCount+' accepted'}:\n${m.rules.map(rule=>'• '+rule).join('\n')}\nPreview only. Saved on one device; this is not a payable link. No real money is collected or paid. Other members’ acceptance and votes are simulations.`;
 }
 return `Lumo expense split: ${item.title}\nExpense ${format(item.totalCents)}; your share ${format(state.ownerCents)}.\n${state.people.filter(p=>!p.isOwner).map(p=>`${p.name}: ${format(p.dueCents)} unpaid of ${format(p.amountCents)}`).join('\n')}\nPreview only. Saved on one device; this is not a payable link. No real payment requests are sent.`;
};
// Incoming examples are explicit, profile-scoped scenarios. No invitation is
// delivered to another device and no unaccepted collection enters the pot list.
const invitations=()=>auth()?(store()?.invitations||[]).filter(v=>v.ownerKey===ownerKey()):[];
const invitation=id=>invitations().find(v=>v.id===id)||null;
const invitationBinding=v=>JSON.stringify([v.id,v.ownerKey,v.scenario,v.role,v.organiserName,v.title,v.targetCents,v.deadline,v.createdAt,v.expiresAt,v.collection?.id,v.collection?.mandateFingerprint]);
const invitationValid=v=>{
 const item=v?.collection;
 return !!v&&v.ownerKey===ownerKey()&&['approver','contributor','expired','closed'].includes(v.scenario)&&['approver','contributor'].includes(v.role)&&item?.ownerKey===v.ownerKey&&item.invitedSample===true&&item.localPersonId==='self'&&item.people.some(p=>p.id==='self'&&!p.isOwner)&&item.people.some(p=>p.id==='host'&&p.isOwner)&&
  mandateValid(item)&&v.organiserName===item.ownerName&&v.title===item.title&&v.targetCents===item.targetCents&&v.deadline===item.deadline&&v.role===(approverIds(item).includes('self')?'approver':'contributor')&&v.fingerprint===invitationBinding(v);
};
const invitationSummary=id=>{
 const v=invitation(id);if(!v)return null;
 const valid=invitationValid(v),item=v.status==='accepted'?get(v.collectionId):v.collection,mandate=mandateSummary(item||v.collection);
 const expired=Date.parse(v.expiresAt)<=Date.now()||dateEnd(v.deadline)<Date.now(),closed=v.scenario==='closed'||['cancelled','refunded'].includes(v.collection?.status),joinedValid=v.status!=='accepted'||!!item&&mandate?.valid;
 const status=!valid||!joinedValid?'unavailable':v.status==='accepted'?'accepted':v.status==='declined'?'declined':closed?'closed':expired?'expired':'pending';
 return {id:v.id,scenario:v.scenario,status,role:v.role,organiserName:v.organiserName,title:v.title,targetCents:v.targetCents,deadline:v.deadline,expiresAt:v.expiresAt,createdAt:v.createdAt,collectionId:v.collectionId||null,sample:true,valid:valid&&joinedValid,canAccept:status==='pending'&&valid,mandate,fingerprint:v.fingerprint};
};
const createSampleInvitation=input=>{
 if(!auth())return fail('Sign in to your open demo account first.');
 const scenario=input?.scenario,key=text(input?.idempotencyKey,120);
 if(!['approver','contributor','expired','closed'].includes(scenario))return fail('Choose an approver or contributor invitation scenario.');
 if(!key||!/^[A-Za-z0-9_-]{1,120}$/.test(key))return fail('Use a fresh sample invitation reference.');
 const s=store();if(!s||!Array.isArray(s.invitations))return fail('These sample invitations need support before another can be created.');
 const previous=invitations().find(v=>v.idempotencyKey===key);if(previous)return previous.scenario===scenario?{ok:true,invitation:previous,idempotent:true}:fail('This sample invitation reference already belongs to another scenario.');
 const role=scenario==='approver'?'approver':'contributor',createdAt=now(),deadline=new Date(Date.now()+14*86400000).toISOString().slice(0,10),localMemberName=text(L.state.profile?.name,60)||'You';
 const people=[{id:'host',name:'Abena Asante',isOwner:true,amountCents:0},{id:'self',name:localMemberName,isOwner:false,amountCents:0},{id:'kojo',name:'Kojo Owusu',isOwner:false,amountCents:0}];
 const mandate={version:2,approval:'named',memberIds:people.map(p=>p.id),approverIds:role==='approver'?['host','self']:['host','kojo'],requiredApprovals:2};
 const item={id:L.id('GC'),type:'collection',ownerKey:ownerKey(),ownerName:'Abena Asante',localMemberName,localPersonId:'self',invitedSample:true,title:role==='approver'?'Cape Coast trip':'Class dinner',description:'Sample invitation scenario',targetCents:120000,deadline,people,mandate,status:scenario==='closed'?'cancelled':'collecting',collectionAccount:{reference:'',kind:'group-collection',demo:true},createdAt,payments:[],refunds:[],proposals:[],disbursements:[],activity:[],demo:true,scope:'device'};
 item.collectionAccount.reference='SAMPLE-'+item.id;item.mandateFingerprint=mandateBinding(item);
 item.mandateAcceptances=people.filter(p=>p.id!=='self').map(p=>({personId:p.id,version:2,date:createdAt,sample:true}));
 item.activity.push({id:L.id('GA'),type:'created',date:createdAt,sample:true},...item.mandateAcceptances.map(a=>({id:L.id('GA'),type:'mandate-accepted',...a})));
 const v={id:L.id('GI'),ownerKey:ownerKey(),scenario,status:'pending',role,organiserName:item.ownerName,title:item.title,targetCents:item.targetCents,deadline,createdAt,expiresAt:new Date(Date.now()+(scenario==='expired'?-86400000:7*86400000)).toISOString(),collection:item,collectionId:null,idempotencyKey:key,sample:true};
 v.fingerprint=invitationBinding(v);s.invitations.unshift(v);save();return {ok:true,invitation:v};
};
const acceptInvitation=input=>{
 if(!auth())return fail('Sign in to your open demo account first.');
 const v=invitation(input?.invitationId),state=invitationSummary(input?.invitationId);if(!v||!state?.valid)return fail('This invitation or its mandate changed. Open a current invitation.');
 if(input.version!==state.mandate.version||input.fingerprint!==state.fingerprint)return fail('Read the current role and mandate before accepting this invitation.');
 if(state.status==='accepted'){const item=get(v.collectionId);return item?{ok:true,item,invitation:v,idempotent:true}:fail('This joined collection is unavailable.');}
 if(!state.canAccept)return fail(state.status==='declined'?'This invitation was declined.':'This invitation has expired or the collection is closed.');
 const item=JSON.parse(JSON.stringify(v.collection)),acceptedAt=now();
 item.mandateAcceptances.push({personId:'self',version:item.mandate.version,date:acceptedAt,sample:false});
 item.activity.push({id:L.id('GA'),type:'mandate-accepted',personId:'self',version:item.mandate.version,date:acceptedAt,sample:false},{id:L.id('GA'),type:'invitation-accepted',invitationId:v.id,date:acceptedAt,sample:false});
 // The chooser explicitly explains that joining loads sample activity. Seed it
 // only after all mandate consent exists, never as an unaccepted pot balance.
 const payment={id:L.id('GP'),reference:'SAMPLE-'+v.id,personId:'host',amountCents:60000,status:'confirmed',sample:true,date:acceptedAt};
 item.payments.push(payment);item.activity.push({id:L.id('GA'),type:'sample-payment',paymentId:payment.id,date:acceptedAt,sample:true});
 const result=createProposalFor(item,{recipient:'Ama Boateng',purpose:item.title==='Cape Coast trip'?'Trip reservation':'Dinner reservation',amount:'150',idempotencyKey:'SAMPLE-'+v.id+'-proposal'},false);
 if(!result.ok)return fail('This sample invitation could not load its group activity. Try a fresh scenario.');
 const p=result.proposal;
 // An explicit remote-organiser sample event, never a fabricated local PIN or
 // biometric approval. This request follows the same automatic quorum model
 // as fresh rail payouts; the invitation screen names its simulated source.
 p.rail=canonicalRail({method:'lumo',checked:true,name:'Ama Boateng',destination:'@ama.b',recipient:'ama'});
 p.requesterAuthorisation={personId:'host',name:item.ownerName,method:'sample-organiser',sample:true,authorisedAt:p.createdAt};p.fingerprint=proposalBinding(p);
 const approval={personId:'host',version:p.mandateVersion,fingerprint:p.fingerprint,sample:true,date:acceptedAt};
 p.approvals.push(approval);item.activity.push({id:L.id('GA'),type:'proposal-approved',proposalId:p.id,...approval});
 store().items.unshift(item);v.status='accepted';v.collectionId=item.id;v.acceptedAt=acceptedAt;save();return {ok:true,item,invitation:v};
};
const declineInvitation=input=>{
 if(!auth())return fail('Sign in to your open demo account first.');
 const v=invitation(input?.invitationId),state=invitationSummary(input?.invitationId);if(!v||!state?.valid)return fail('This invitation is unavailable.');
 if(state.status==='declined')return {ok:true,invitation:v,idempotent:true};
 if(state.status!=='pending')return fail('This invitation is no longer open.');
 v.status='declined';v.declinedAt=now();save();return {ok:true,invitation:v};
};
// Reusable people are organisational records only. They carry no shares,
// contribution history, balances, payment authority or identity verification.
const personId=name=>{let n=2166136261;for(const c of norm(name)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return 'person-'+(n>>>0).toString(36);};
const contactPerson=p=>({id:personId(p.name),name:text(p.name,60),...(p.handle&&/^@?[A-Za-z0-9._-]{1,40}$/.test(p.handle)?{handle:p.handle}:{}),isOwner:false});
const templates=()=>{if(!auth())return [];const groups=store()?.templates;return Array.isArray(groups)?groups.filter(g=>g.ownerKey===ownerKey()):[];};
const template=id=>templates().find(g=>g.id===id)||null;
const saveTemplate=input=>{
 if(!auth())return fail('Sign in to your open demo account first.');
 const name=text(input?.name,60);if(!name)return fail('Give this group a short name.');
 const result=peopleFor(input?.people,'collection');if(!result.ok)return result;
 const s=store();if(!s||!Array.isArray(s.templates))return fail('These saved groups need support before another can be saved.');
 const previous=input.id?template(input.id):null;if(input.id&&!previous)return fail('This saved group is unavailable.');
 if(templates().some(g=>g.id!==previous?.id&&norm(g.name)===norm(name)))return fail('A group already has that name. Choose another name.');
 const people=result.people.map(p=>p.isOwner?{id:'self',name:'You',isOwner:true}:contactPerson(p));
 if(new Set(people.map(p=>p.id)).size!==people.length)return fail('Each person should appear once.');
 const g={id:previous?.id||L.id('GT'),name,people,ownerKey:ownerKey(),createdAt:previous?.createdAt||now(),updatedAt:now()};
 if(previous)s.templates.splice(s.templates.indexOf(previous),1,g);else s.templates.unshift(g);
 save();return {ok:true,template:g};
};
const deleteTemplate=id=>{
 if(!auth())return fail('Sign in to your open demo account first.');const g=template(id);if(!g)return fail('This saved group is unavailable.');
 store().templates.splice(store().templates.indexOf(g),1);save();return {ok:true};
};
const rememberPeople=input=>{
 if(!auth())return fail('Sign in to your open demo account first.');
 const result=peopleFor(input,'collection');if(!result.ok)return result;
 const s=store();if(!s||!Array.isArray(s.contacts))return fail('These saved people need support before another can be added.');
 for(const person of result.people.filter(p=>!p.isOwner)){
  const p=contactPerson(person),previous=s.contacts.find(c=>c.ownerKey===ownerKey()&&norm(c.name)===norm(p.name));
  if(previous)s.contacts.splice(s.contacts.indexOf(previous),1);
  s.contacts.unshift({...p,ownerKey:ownerKey(),selectedAt:now()});
 }
 // Keep a small, owner-scoped convenience list. Never retain the address book.
 const mine=s.contacts.filter(p=>p.ownerKey===ownerKey());for(const p of mine.slice(40))s.contacts.splice(s.contacts.indexOf(p),1);
 save();return {ok:true};
};
const recentPeople=()=>{
 if(!auth())return [];
 const s=store(),raw=[...(Array.isArray(s?.contacts)?s.contacts:[]).filter(p=>p.ownerKey===ownerKey()),...list().flatMap(g=>g.people),...templates().flatMap(g=>g.people)];
 for(const r of L.state.requests||[]){const name=r.from==='self'?r.to:r.name;if(name&&!['self','shareable link'].includes(norm(name)))raw.push({name,handle:r.from==='self'?'':r.handle});}
 // A bank or wallet transaction name may describe its purpose (for example,
 // "Allowance from Mum"). Only a completed person payment with an explicit
 // Lumo recipient key is safe to offer as a previous contact.
 for(const t of L.state.txs||[]){if(t.name&&t.type==='out'&&t.status==='success'&&!t.internal&&!L.isInternalTransfer?.(t)&&t.method==='Lumo transfer'&&/^lumo\|\|@?[A-Za-z0-9._-]+$/.test(t.recipientKey||''))raw.push({name:t.name});}
 const seen=new Set(),people=[];
 for(const p of raw){const name=text(p.name,60),key=norm(name);if(!name||p.isOwner||p.id==='self'||['you','me',norm(L.state.profile?.name)].includes(key)||seen.has(key))continue;seen.add(key);people.push(contactPerson({...p,name}));}
 return people.slice(0,24);
};
L.groupMoney={version:1,cents,format,validateAttachment,list,get,summary,splitForSource,refundPreview,previewSplit,previewCollection,createSplit:commit('Creating a split',input=>create(input,previewSplit)),createCollection:commit('Creating a collection',input=>input?.acceptMandate===true?create(input,previewCollection):fail('Read and accept the mandate before creating this collection account.')),access,invitations,invitation,invitationSummary,createSampleInvitation:commit('Loading a sample invitation',createSampleInvitation),acceptInvitation:commit('Joining this collection',acceptInvitation),declineInvitation:commit('Declining this invitation',declineInvitation),mandateSummary,acceptMandate:commit('Accepting this mandate',acceptMandate),createProposal:commit('Requesting this payout',createProposal),proposal,proposalSummary,approveProposal:commit('Approving this payout',approveProposal),declineProposal:commit('Declining this payout',declineProposal),cancelProposal:commit('Withdrawing this payout',cancelProposal),preparePayout,discardPayoutReview,executeSampleProposal:commit('Releasing this earlier payout',executeSampleProposal),settleSamplePayout:commit('Checking this sample payout',settleSamplePayout),prepareRailPayout,railPayoutCurrent,discardRailPayoutReview,authorizeRailPayout:commit('Authorising this payout request',authorizeRailPayout),recordSamplePayment:commit('Confirming this sample payment',recordSamplePayment),cancel:commit('Cancelling this collection or split',cancel),refund:commit('Returning unspent collection money',refund),shareText,eligibleSource,sourceAmount,sourceCurrent,templates,template,saveTemplate:commit('Saving these people',saveTemplate,false),deleteTemplate:commit('Removing this saved group',deleteTemplate,false),rememberPeople:commit('Saving selected people',rememberPeople,false),recentPeople,limits:{maxFriends:MAX_FRIENDS,maxCents:MAX_CENTS,maxShareCents:MAX_SHARE_CENTS}};

// Account closure must not strand an organiser's separate collection funds or
// an unresolved submitted payout. Invited member records are not ownership.
const accountClosureBlockers=L.acct?.blockers;
if(typeof accountClosureBlockers==='function')L.acct.blockers=function(...args){
 const items=accountClosureBlockers.apply(this,args),processing=[],unspent=[],records=L.state.groupMoney?.items;
 if(!L.state.onboarded||!Array.isArray(records)||!records.length)return items;
 for(const item of records){
  // Historical creation/ownership survives an invalid or missing mandate.
  // A locally invited contributor/approver never gains organiser liability.
  if(item?.type!=='collection'||item.ownerKey!==ownerKey()||item.invitedSample)continue;
  const pending=(item.disbursements||[]).filter(d=>d.status==='processing'),title=text(item.title,60)||'Your collection';
  if(pending.length){
   const amount=pending.reduce((sum,d)=>sum+(Number.isSafeInteger(d.totalCents)&&d.totalCents>0?d.totalCents:0),0);
   processing.push({label:'Collection payout processing',sub:title+' · '+(amount?format(amount)+' processing. ':pending.length+' payout result(s) pending. ')+'Check the payout result before closing.',route:'groupMoneyPayments',id:item.id});continue;
  }
  const recordedAmount=rows=>(rows||[]).reduce((sum,row)=>sum+(Number.isSafeInteger(Number(row.amountCents))&&Number(row.amountCents)>0?Number(row.amountCents):0),0);
  const balance=Math.max(0,recordedAmount((item.payments||[]).filter(payment=>payment.status==='confirmed'))-recordedAmount(item.refunds)-(item.disbursements||[]).filter(payout=>payout.status==='confirmed').reduce((sum,payout)=>sum+(Number.isSafeInteger(Number(payout.totalCents))&&Number(payout.totalCents)>0?Number(payout.totalCents):0),0));
  if(balance>0)unspent.push({label:'Money in your collection account',sub:title+' · '+format(balance)+' in collection funds. Pay out or refund before closing.',route:'groupMoneyDetail',id:item.id});
 }
 return items.concat(processing,unspent);
};

})();
