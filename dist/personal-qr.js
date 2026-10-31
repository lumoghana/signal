/* A personal QR selects a recipient. The existing payment journey alone owns
   amounts, review, Pause, authorisation and simulated ledger changes. */
(()=>{
'use strict';
if(!window.L||L.personalQr)return;
const E=L.e,B=L.btn,idPattern=/^[a-f0-9]{32}$/;
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
// URI encoding keeps Unicode names safe in the bundled QR byte encoder. Repair
// isolated UTF-16 surrogates from old saved records before encoding a profile.
const wellFormed=value=>Array.from(value,character=>character.length===1&&/[\ud800-\udfff]/.test(character)?'\ufffd':character).join('');
const cleanName=value=>wellFormed(String(value||'')).trim().normalize('NFC');
const validName=value=>value.length>0&&value.length<=50&&wellFormed(value)===value&&!/[<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value);
const canonical=(id,name,handle)=>'LUMO1:USER:'+id+':'+encodeURIComponent(name)+':'+(handle||'-');
function parse(value){
 // Fifty non-ASCII UTF-16 characters can require 450 URI characters, plus
 // identity and handle fields. Retain a bounded payload without dropping them.
 if(typeof value!=='string'||value.length>600)return null;
 const parts=value.trim().split(':');if(parts.length!==5||parts[0]!=='LUMO1'||parts[1]!=='USER'||!idPattern.test(parts[2]))return null;
 let name;try{name=decodeURIComponent(parts[3]);}catch{return null;}
 if(!validName(name)||name!==cleanName(name)||parts[4]!=='-'&&!/^[a-z0-9_.]{3,20}$/.test(parts[4]))return null;
 const handle=parts[4]==='-'?'':parts[4];
 return {type:'user',id:parts[2],name,handle,payload:canonical(parts[2],name,handle)};
}
function identity(){
 if(!allowed())return null;
 const profile=L.state.profile;
 if(!idPattern.test(profile.personalQrId||'')){
  const bytes=new Uint8Array(16);
  if(globalThis.crypto?.getRandomValues)globalThis.crypto.getRandomValues(bytes);
  else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
  profile.personalQrId=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');L.save();
 }
 let name=cleanName(profile.displayName||profile.name);if(!validName(name))name='Lumo user';
 const proposed=String(profile.handle||'').replace(/^@/,'').toLowerCase(),handle=/^[a-z0-9_.]{3,20}$/.test(proposed)?proposed:'';
 return {id:profile.personalQrId,name,handle};
}
function payload(){const person=identity();return person?canonical(person.id,person.name,person.handle):'';}
function model(value=payload()){
 const person=parse(value);if(!person||typeof window.qrcode!=='function')return null;
 const qr=window.qrcode(0,'M');qr.addData(person.payload,'Byte');qr.make();return qr;
}
function svg(size=200){
 const qr=model();if(!qr)return '';
 const n=qr.getModuleCount(),side=n+8,dimension=Math.min(360,Math.max(96,Number(size)||200));let path='';
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))path+=`M${x+4} ${y+4}h1v1h-1z`;
 return `<svg class="lumo-personal-qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${dimension}" height="${dimension}" role="img" aria-label="Your personal Lumo payment QR" shape-rendering="crispEdges"><rect width="${side}" height="${side}" fill="#fff"/><path d="${path}" fill="#111"/></svg>`;
}
const owner=()=>String(L.state.profile?.account||L.state.profile?.phone||'');
function selectRecipient(value,replacement=null){
 if(!allowed()||L.platform?.requireOnline?.('Start a QR payment')===false)return false;
 const person=parse(value);if(!person){L.error('This personal QR could not be read. Ask for a new Lumo QR.');return false;}
 if(person.id===identity().id){L.error('This is your own QR. Scan another Lumo user to pay them.');return false;}
 const previous=L.state.paymentDraft;
 if(previous?.submittedTxId){
  const tx=(L.state.txs||[]).find(item=>item.id===previous.submittedTxId);
  if(!tx||['pending','unknown','processing'].includes(tx.status)){L.go('paymentResult',{id:previous.submittedTxId});L.toast('Check your existing payment before starting another.');return false;}
 }
 const waiting=(L.state.txs||[]).find(t=>['pending','unknown','processing'].includes(t.status)&&t.paymentDraft?.qrUserId===person.id);
 if(waiting){L.go('paymentResult',{id:waiting.id});L.toast('A payment to this QR recipient is still being checked.');return false;}
 if(replacement&&(replacement.account!==L.state||replacement.owner!==owner()||replacement.draft!==previous||replacement.snapshot!==JSON.stringify(previous))){L.toast('Your saved payment changed. Scan the QR again to choose a new recipient.');return false;}
 if(!replacement&&previous&&!previous.submittedTxId&&(previous.name||Number(previous.amount)>0||previous.note||previous.destination||previous.inputNumber)){
  L.savePaymentFields?.();L.qr?.stop?.();
  const choice={account:L.state,owner:owner(),draft:previous,snapshot:JSON.stringify(previous)};
  // The shared native choice keeps the old draft untouched. Its callback runs
  // these same account, draft and pending-result checks again at selection.
  if(!L.requestPaymentReplacement){L.toast('Finish or leave your saved payment before choosing another recipient.');return false;}
  const deferred=L.requestPaymentReplacement(()=>selectRecipient(value,choice),'qr:'+person.id,{keepLabel:'Keep saved payment',replaceLabel:'Use scanned recipient',recipientLabel:'Scanned recipient',recipientName:person.name});
  return deferred?false:selectRecipient(value,choice);
 }
 L.qr?.stop?.();
 L.state.paymentDraft={id:L.id('D'),method:'lumo',name:person.name,destination:person.handle?'@'+person.handle:'Lumo user '+person.id.slice(-8),recipient:'QR-'+person.id,qrUserId:person.id,qrRecipient:true,qrIdentitySource:'self-asserted',checked:true,amount:'',note:'',fee:0,essentialId:''};
 L.save();L.go('send',{method:'lumo'});L.toast('QR read. Check '+person.name+' before you pay.');return true;
}
function consume(value){return selectRecipient(value);}

function open(){if(!allowed())return;return L.qr.open({mode:'code'});}
async function png(){
 const text=payload(),person=parse(text),qr=model(text);if(!person||!qr)throw Error('qr-unavailable');
 const canvas=document.createElement('canvas'),n=qr.getModuleCount(),scale=Math.max(4,Math.floor(720/(n+8))),side=(n+8)*scale;
 canvas.width=side;canvas.height=side+110;const context=canvas.getContext?.('2d');if(!context)throw Error('image-unavailable');
 context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.fillStyle='#111';
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))context.fillRect((x+4)*scale,(y+4)*scale,scale,scale);
 context.textAlign='center';context.font='600 24px sans-serif';context.fillText(person.name,side/2,side+30,side-40);
 context.font='18px sans-serif';context.fillText(person.handle?'@'+person.handle:'Personal Lumo QR',side/2,side+60,side-40);
 context.font='14px sans-serif';context.fillText('Lumo prototype · Sample money',side/2,side+88,side-40);
 if(typeof canvas.toBlob!=='function')throw Error('image-unavailable');
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('image-unavailable')),'image/png'));
 return {blob,person};
}
function download(blob,person){
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Lumo-QR-'+(person.handle||person.id.slice(-8))+'.png';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function saveImage(){
 if(!allowed())return;const account=L.state;
 try{const {blob,person}=await png();if(account!==L.state||!allowed())return;download(blob,person);L.toast('Your QR image is ready to save.');}
 catch{L.error('The QR image could not be saved here. Take a screenshot of your QR instead.');}
}
async function share(){
 if(!allowed())return;const account=L.state;
 try{
  const {blob,person}=await png();if(account!==L.state||!allowed())return;
  const file=typeof File==='function'?new File([blob],'Lumo-QR.png',{type:'image/png'}):null;
  if(file&&navigator.share&&navigator.canShare?.({files:[file]})){
   try{await navigator.share({title:person.name+' · Lumo QR',text:'Scan my QR in Lumo. Sample payments only.',files:[file]});return;}
   catch(error){if(error?.name==='AbortError')return;}
  }
  download(blob,person);L.toast('Save this QR image and share it from your photos.');
 }catch{L.error('Sharing is unavailable here. Take a screenshot of your QR to share.');}
}
function content(){
 if(!allowed())return '';
 const person=identity();
 return `<div class="personal-qr-page"><figure class="personal-qr-card">${svg(240)}<figcaption><strong>${E(person.name)}</strong><span>${E(person.handle?'@'+person.handle:'Personal Lumo QR')}</span></figcaption></figure><div id="error" role="alert"></div><div class="personal-qr-actions">${B(L.icon('download',18)+' Save QR','L.personalQr.saveImage()','secondary')}${B(L.icon('send',18)+' Share QR','L.personalQr.share()')}</div><p class="personal-qr-note">Sample money · No live payments.</p></div>`;
}
L.personalQr={parse,payload,svg,consume,open,saveImage,share,content};
L.views.myQr=()=>L.qr.hubView('code');
L.taskSheet?.register('myQr',{family:'records',treatment:'detail',label:'My QR'});
const shortcut=()=>L.row('My QR','Let someone scan to pay you','scan','L.personalQr.open()');
for(const route of ['profile','more']){
 const view=L.views[route];if(!view)continue;
 L.views[route]=function(...args){
  const html=view.apply(this,args);if(!allowed())return html;
  if(route==='more'&&html.includes('<div class="you-options">'))return html.replace('<div class="you-options">',`<div class="personal-qr-shortcut">${shortcut()}</div><div class="you-options">`);
  if(html.includes('<div class="list">'))return html.replace('<div class="list">',`<div class="list">${shortcut()}`);
  return html.replace(/(<\/section>)\s*$/,`<div class="personal-qr-shortcut">${shortcut()}</div>$1`);
 };
}
const qrDraft=()=>{const d=L.state.paymentDraft;return d?.method==='lumo'&&d.qrRecipient&&d.recipient==='QR-'+d.qrUserId&&!d.submittedTxId;};
const notice='<p class="personal-qr-recipient-note" role="note">Name supplied by QR. Confirm it with the recipient. Sample transfer only.</p>';
for(const route of ['send','paymentReview','authorize']){
 const view=L.views[route];if(!view)continue;
 L.views[route]=function(...args){
  const html=view.apply(this,args);if(!qrDraft())return html;
  if(html.includes('<form'))return html.replace('<form',notice+'<form');
  if(html.includes('<div class="focus-receipt">'))return html.replace('<div class="focus-receipt">',notice+'<div class="focus-receipt">');
  return html.replace(/(<\/section>)\s*$/,notice+'$1');
 };
}
const clear=L.clearRecipient;
L.clearRecipient=function(...args){const d=L.state.paymentDraft;if(allowed()&&d&&!d.submittedTxId)for(const key of ['qrUserId','qrRecipient','qrIdentitySource'])delete d[key];return clear.apply(this,args);};
})();
