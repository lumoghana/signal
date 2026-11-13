import fs from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
const ORIGIN='https://iwutbrljiiodamtyoorg.supabase.co',KEY='sb_publishable_4dmchqek8k-opkvho4n_ka_tcgVjWi6';
// Public key copied from approved native configuration rather than embedded private credentials.
const config=await fs.readFile(new URL('../../../pair-source/Lumo-Test-Android-Source-2.4.2/app/src/main/java/com/lumo/nativeapp/NativeSharedConfig.java',import.meta.url),'utf8');
const publishable=config.match(/PUBLISHABLE_KEY\s*=\s*"([^"]+)"/)[1];
const fixturePath='/workspace/scratch/37a0eb047690/qa-approved-consumers.json';
const checks=[],time=new Date().toISOString();
async function call(user,body,{allowFailure=false}={}){const response=await fetch(ORIGIN+'/functions/v1/lumo-approved',{method:'POST',headers:{apikey:publishable,'Content-Type':'application/json',...(user?.session?{Authorization:'Bearer '+user.session.access_token}:{})},body:JSON.stringify(body)});const value=await response.json();if(!allowFailure&&(!response.ok||!value.ok))throw Error(`${body.action}/${body.type||''}: ${value.code||response.status} ${typeof value.message==='string'?value.message:JSON.stringify(value.result)}`);if(value.state&&user)user.snapshot=value;return value;}
function check(value,label){if(!value)throw Error('Assertion: '+label);checks.push(label);}
const act=(u,type,payload={},pin=true)=>call(u,{action:'action',type,payload,attemptId:randomUUID(),...(pin?{pin:u.pin}:{})});
let fixture;try{fixture=JSON.parse(await fs.readFile(fixturePath,'utf8'));}catch{}
if(!fixture)fixture={createdAt:time,users:[]};
for(let n=0;n<2;n++){let u=fixture.users[n];if(!u){const i=n+1,name=n?'Kojo QA Approved':'Ama QA Approved',suffix=Date.now().toString(36).slice(-6)+randomBytes(2).toString('hex');u={handle:`qa.${i}.${suffix}`,displayName:name,phone:'024'+String(Number.parseInt(randomBytes(4).toString('hex'),16)%10000000).padStart(7,'0'),password:'Approved-QA-'+randomBytes(16).toString('hex'),pin:n?'2653':'3159'};fixture.users.push(u);await fs.writeFile(fixturePath,JSON.stringify(fixture),{mode:0o600});}if(!u.session){const registered=await call(null,{action:'register',...u});u.session=registered.session;u.snapshot=registered;await fs.writeFile(fixturePath,JSON.stringify(fixture),{mode:0o600});}}
const [a,b]=fixture.users;
const initial=await call(a,{action:'snapshot'});await call(b,{action:'snapshot'});check(initial.state.wallet===initial.account.balance,'consumer snapshot uses authoritative balance');
await act(a,'settings',{buffer:0},false);await act(b,'settings',{buffer:0},false);
await act(a,'fund',{amount:20000});await act(b,'fund',{amount:20000});
const beforeA=a.snapshot.account.balance,beforeB=b.snapshot.account.balance;
const resolved=await call(a,{action:'resolve',query:b.phone});check(resolved.recipient.userId===b.session.user.id,'phone alias resolves second authenticated consumer');
const attemptId=randomUUID(),payment={action:'action',type:'payment',payload:{amount:1700,rail:'lumo',recipient:resolved.recipient},attemptId,pin:a.pin};
const sent=await call(a,payment);const replay=await call(a,payment);check(replay.replayed===true,'same original attempt replays posted payment');
await call(b,{action:'snapshot'});check(a.snapshot.account.balance===beforeA-1700&&b.snapshot.account.balance===beforeB+1700,'cross-consumer ledger debit and credit');check(b.snapshot.state.transactions.some(t=>t.ledgerJournalId&&t.amount===1700&&t.direction==='in'),'incoming shared receipt enters approved activity');
const recovery=await call(a,{action:'recover',type:payment.type,payload:payment.payload,attemptId});check(recovery.found===true,'PIN-free unknown-outcome recovery returns original result');
const create=await act(a,'createGroup',{name:'Approved QA collection',purpose:'Cross-device approved group test',target:15000,members:[{id:'me',name:a.displayName,role:'approver'},{id:'friend',name:b.displayName,phone:b.phone,role:'approver'}],mandate:{approvers:['me','friend'],threshold:2}},false);const groupId=create.result.id;
await call(b,{action:'snapshot'});let invitation=b.snapshot.state.groups.find(g=>g.id===groupId);check(invitation?.invitationOnly===true&&invitation.chat?.messages?.length===0,'second consumer receives redacted original group invitation');
await act(b,'acceptGroupInvite',{groupId,acceptHistory:true,mandateRevision:invitation.mandateRevision,invitationVersion:invitation.members.find(m=>m.id==='me').invitationVersion},false);
await act(a,'contributeGroup',{groupId,amount:6000});await act(b,'contributeGroup',{groupId,amount:3000});
await act(a,'sendGroupMessage',{groupId,text:'Same approved conversation, actual other account.',clientId:randomUUID()},false);await call(b,{action:'snapshot'});check(b.snapshot.state.groups.find(g=>g.id===groupId).chat.messages.some(m=>m.text==='Same approved conversation, actual other account.'&&m.status==='sent'),'original rich group chat delivered to other identity');
const proposal=await act(a,'requestPayout',{groupId,amount:2000,rail:'lumo',recipient:b.displayName,destination:'@'+b.handle,note:'Approved policy payment'});const payoutId=proposal.result.payoutId;
await act(a,'reviewPayout',{groupId,payoutId},false);await act(a,'approvePayout',{groupId,payoutId});await act(b,'reviewPayout',{groupId,payoutId},false);await act(b,'approvePayout',{groupId,payoutId});
let group=b.snapshot.state.groups.find(g=>g.id===groupId);check(group.payouts.find(p=>p.id===payoutId).status==='approved'&&group.balance===9000,'all approvals preserve separate explicit execution');
await act(a,'executePayout',{groupId,payoutId});await call(b,{action:'snapshot'});group=b.snapshot.state.groups.find(g=>g.id===groupId);check(group.balance===7000&&group.payouts.find(p=>p.id===payoutId).status==='success','separate execution posts actual group payout');
await act(a,'closeGroup',{groupId});await call(b,{action:'snapshot'});group=b.snapshot.state.groups.find(g=>g.id===groupId);check(group.status==='closed'&&group.balance===0&&group.refunds.reduce((n,r)=>n+r.amount,0)===7000,'group closure proportionally refunds all original sources');
const request=await act(a,'createMoneyRequest',{name:b.handle,amount:1200,note:'Connected original request'},false);const requestId=request.result.id;await call(b,{action:'snapshot'});const incoming=b.snapshot.state.moneyRequests.find(r=>r.id===requestId);check(incoming?.direction==='incoming'&&incoming.senderHandle===a.handle,'original request appears on actual recipient with resolvable handle');
await act(b,'payment',{requestId,amount:1200,rail:'lumo',recipient:{id:a.session.user.id,name:a.displayName}});await call(a,{action:'snapshot'});check(a.snapshot.state.moneyRequests.find(r=>r.id===requestId).status==='paid','real incoming request settles via actual counterpart ledger');
const setupId=randomUUID();const invitationResult=await act(a,'sendBoxPartnerInvitation',{setupId,boxName:'Protected QA books',partner:{name:b.displayName,phone:b.phone}},false);const invitationId=invitationResult.result.invitationId;
let inbox=await call(b,{action:'partnerInbox'});check(inbox.inbox.some(i=>i.id===invitationId&&!i.code),'real partner receives scoped invitation without premature code');
await call(b,{action:'partnerRespond',id:invitationId,decision:'accepted'});inbox=await call(b,{action:'partnerInbox'});const code=inbox.inbox.find(i=>i.id===invitationId).code;check(/^\d{6}$/.test(code),'only bound partner receives initial confirmation code');
await act(a,'verifyBoxPartnerInvitation',{setupId,boxName:'Protected QA books',partner:{name:b.displayName,phone:b.phone},invitationId,code},false);
const boxResult=await act(a,'createBox',{name:'Protected QA books',target:20000,accountabilityPartner:{name:b.displayName,phone:b.phone},partnerSetupId:setupId,partnerInvitationId:invitationId},false);const boxId=boxResult.result.id;
check(!JSON.stringify(a.snapshot.state.boxPartnerInvitations).includes(code),'owner snapshot never reveals partner code');
await act(a,'contributeBox',{boxId,amount:2000});const release=await act(a,'requestBoxRelease',{boxId,kind:'withdrawal',amount:500},false);const releaseId=release.result.requestId;
await call(b,{action:'partnerRespond',id:releaseId,decision:'accepted'});inbox=await call(b,{action:'partnerInbox'});const releaseCode=inbox.inbox.find(i=>i.id===releaseId).code;
await act(a,'verifyBoxPartnerCode',{boxId,requestId:releaseId,code:releaseCode},false);await act(a,'withdrawBox',{boxId,amount:500,requestId:releaseId});check(a.snapshot.state.boxes.find(x=>x.id===boxId).balance===1500,'actual partner acceptance and fresh scoped release protect real box ledger');
const beforeOutside=a.snapshot.account.balance;const iou=await act(a,'createIOU',{name:'Cash friend',type:'owedToMe',amount:500,due:new Date().toISOString().slice(0,10)},false);await act(a,'settleIOU',{id:iou.result.id,amount:500,destination:'cash'});check(a.snapshot.account.balance===beforeOutside,'outside IOU settlement persists without minting available money');
const unavailable=await call(a,{action:'action',type:'payment',payload:{amount:500,rail:'bank',merchant:'Unconnected bank'},attemptId:randomUUID(),pin:a.pin},{allowFailure:true});check(!unavailable.ok&&unavailable.code==='PROVIDER_UNAVAILABLE','unconnected provider fails in original flow without fake money');
await fs.writeFile(fixturePath,JSON.stringify(fixture),{mode:0o600});
await fs.writeFile(new URL('../verification/approved-consumer-live.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),checks:checks.length,passed:checks,actors:fixture.users.map(u=>({userId:u.session.user.id,handle:u.handle})),groupId,boxId,sandbox:true,rawCredentialsExcluded:true},null,2));
console.log(JSON.stringify({ok:true,checks:checks.length,fixturePath,report:'backend/verification/approved-consumer-live.json'}));
