/* Optional payout evidence stays in this device's collection preview. No upload
   is sent; the existing proposal fingerprint binds the selected file bytes. */
(()=>{
'use strict';
if(!window.L||!L.groupMoney||L.collectionEvidence)return;
const G=L.groupMoney,MAX_FILE=200*1024,MAX_GROUP_CHARS=2*1024*1024;
const types={'image/png':'png','image/jpeg':'jpg','application/pdf':'pdf'};
const downloadRoutes=new Set(['groupMoneyProposalDetail','groupMoneyMember','groupMoneyPayoutRelease']);
let pending=null;
const account=()=>String(L.state.profile?.account||L.state.profile?.handle||L.state.profile?.phone||L.state.profile?.name);
const session=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const currentDraft=()=>{if(!session())return null;const payment=L.state.paymentDraft;if(L.route==='send'&&payment?.collectionPayout===true&&!payment.submittedTxId&&G.access(payment.collectionId)?.canPropose)return payment;const d=L.state.groupMoney?.proposalDraft;return L.route==='groupMoneyProposal'&&d&&d.account===account()&&d.itemId===L.params.id&&!d.createdId&&G.access(d.itemId)?.canPropose?d:null;};
const mark=d=>JSON.stringify([d.itemId,d.key,d.recipient,d.purpose,d.amount,d.supportingReference||'',d.review||'',d.createdId||'',d.attachment||null,...(d.collectionPayout?[d.id,d.collectionId,d.method,d.name,d.destination,d.provider,d.checked,d.fee,d.note]:[])]);
const setBusy=(input,busy)=>{if(!input)return;input.disabled=!!busy;if(busy)input.setAttribute('aria-busy','true');else input.removeAttribute('aria-busy');};
const clearInput=input=>{try{if(input)input.value='';}catch{}};
const error=(text,input)=>{clearInput(input);L.error?.(text,'gm-proposal-attachment');return false;};
const cancel=()=>{const r=pending;pending=null;if(r){setBusy(r.input,false);try{r.reader?.abort?.();}catch{}}};
const safeName=(value,type)=>{const extension=types[type],clean=String(value||'Supporting file').replace(/[\\/\u0000-\u001f\u007f]/g,'_').trim(),stem=(clean.replace(/\.[^.]*$/,'').replace(/[. ]+$/,'')||'Supporting file').slice(0,95);return stem+'.'+extension;};
const sameContext=r=>pending===r&&L.state===r.state&&account()===r.account&&currentDraft()===r.draft&&r.draft.key===r.key;
const same=r=>sameContext(r)&&mark(r.draft)===r.mark;
const preserveFields=()=>{if(L.state.paymentDraft?.collectionPayout)L.collectionPayoutRails?.capture?.();else L.gm?.captureProposal?.();};
const validAttachment=raw=>typeof G.validateAttachment==='function'?G.validateAttachment(raw):{ok:false,error:'Supporting files are unavailable in this preview. Use the supporting reference instead.'};
// New approvals bind a compact digest, not repeated file bytes. Reserve the
// draft review, proposal and receipt copies plus bounded named-vote metadata.
// The character cap also leaves space for UTF-16 local-storage representation.
const budgetFits=(d,attachment)=>{
 const group=L.state.groupMoney;if(!group)return false;
 const previous=d.attachment;d.attachment=attachment;
 try{
  let size=JSON.stringify(group).length;
  const approvers=item=>G.mandateSummary(item)?.approverCount||item?.people?.length||2;
  for(const item of group.items||[])for(const p of item.proposals||[]){if(!p.attachment||['paid','cancelled','declined'].includes(p.status))continue;size+=String(p.attachment.dataUrl||'').length+approvers(item)*6000;}
  const item=G.get(d.itemId);size+=3*attachment.dataUrl.length+approvers(item)*6000;
  return size<=MAX_GROUP_CHARS;
 }catch{return false;}finally{if(previous===undefined)delete d.attachment;else d.attachment=previous;}
};
const persist=(d,next)=>{
 const previous=d.attachment,had=Object.prototype.hasOwnProperty.call(d,'attachment'),review=d.review,hadReview=Object.prototype.hasOwnProperty.call(d,'review');
 if(next) d.attachment=next;else delete d.attachment;delete d.review;
 let failed=false;
 try{if(L.persistence?.ensureCurrent?.()===false||L.save()===false)failed=true;}catch{failed=true;}
 if(failed){if(had)d.attachment=previous;else delete d.attachment;if(hadReview)d.review=review;else delete d.review;return false;}
 return true;
};
function add(input){
 const d=currentDraft();if(!d||!input||input.id!=='gm-proposal-attachment'||!input.isConnected)return false;
 cancel();preserveFields();
 const files=input.files;if(!files?.length)return false;
 if(files.length!==1)return error('Choose one supporting file.',input);
 const file=files[0],type=String(file.type||'');
 if(!Object.prototype.hasOwnProperty.call(types,type))return error('Choose a PNG, JPEG or PDF file.',input);
 if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>MAX_FILE)return error('Choose a file up to 200 KB. You can also use the supporting reference.',input);
 if(typeof FileReader!=='function')return error('This browser cannot read a supporting file. Use the supporting reference instead.',input);
 const reader=new FileReader(),r={reader,input,file,draft:d,key:d.key,state:L.state,account:account(),mark:mark(d)};pending=r;setBusy(input,true);
 const finish=()=>{if(pending===r)pending=null;setBusy(input,false);};
 reader.onload=()=>{
  if(!same(r)){const changed=sameContext(r);finish();clearInput(input);if(changed)error('The request changed while the file was loading. Choose the file again.',input);return;}
  preserveFields();if(!same(r)){finish();error('The request changed while the file was loading. Choose the file again.',input);return;}
  const checked=validAttachment({name:safeName(file.name,type),type,size:file.size,dataUrl:String(reader.result||'')});
  if(!checked.ok||!checked.attachment){finish();error(checked.error||'This file could not be read. Choose a PNG, JPEG or PDF.',input);return;}
  if(!budgetFits(d,checked.attachment)){finish();error('This file would exceed this preview’s saved-file space. Choose a smaller file or use the supporting reference.',input);return;}
  finish();clearInput(input);
  if(!persist(d,checked.attachment)){L.render();error('The file could not be saved on this device. Choose a smaller file or use the supporting reference.');return;}
  L.render();
 };
 reader.onerror=()=>{if(!same(r)){finish();return;}finish();error('The file could not be read. Choose it again or use the supporting reference.',input);};
 reader.onabort=()=>{if(pending!==r)return;finish();clearInput(input);};
 try{reader.readAsDataURL(file);}catch{finish();return error('The file could not be read. Choose it again or use the supporting reference.',input);}
 return true;
}
function remove(){
 const d=currentDraft();if(!d)return false;
 cancel();preserveFields();if(!d.attachment)return false;
 if(!persist(d,null)){L.render();return error('The file could not be removed from saved progress. Try again.');}
 L.render();return true;
}
function download(itemId,proposalId){
 const unavailable=()=>{L.toast('This supporting file is no longer available. Reopen this payout.');return false;};
 if(!session()||!downloadRoutes.has(L.route)||L.params.id!==itemId||L.params.proposalId!==proposalId)return unavailable();
 const item=G.get(itemId),access=G.access(item),p=G.proposal(itemId,proposalId),s=G.proposalSummary(itemId,proposalId);
 if(!item||!access?.canView||!p||!s?.valid)return unavailable();
 const checked=validAttachment(p.attachment);if(!checked.ok||!checked.attachment)return unavailable();
 if(typeof atob!=='function'||typeof Blob!=='function'||typeof URL?.createObjectURL!=='function'){L.toast('File download is unavailable in this browser.');return false;}
 const a=checked.attachment;let href=null,link=null;
 try{
  const raw=atob(a.dataUrl.slice(a.dataUrl.indexOf(',')+1)),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  href=URL.createObjectURL(new Blob([bytes],{type:a.type}));link=document.createElement('a');link.href=href;link.download=safeName(a.name,a.type);link.rel='noopener';document.body.appendChild(link);link.click();L.toast('Downloading supporting file…');return true;
 }catch{L.toast('The supporting file could not be downloaded.');return false;}
 finally{link?.remove();if(href)setTimeout(()=>{try{URL.revokeObjectURL(href);}catch{}},1000);}
}
L.collectionEvidence=Object.freeze({add,remove,download,limits:Object.freeze({fileBytes:MAX_FILE,groupCharacters:MAX_GROUP_CHARS})});
})();
