/* QR identifies a merchant or an existing local sale. The normal payment
   journey still owns the amount, consequence, authentication and ledger. */
(()=>{
'use strict';
const E=L.e,B=L.btn;
const merchants=[['AK01','Akua’s Kitchen','Food · Night market'],['CP02','Campus Print','Printing · Balme Library'],['RB03','Ride & Go','Transport · Main gate']];
let generation=0,stream=null,timer=null,detector=null,phase='idle',message='',codeDraft='',cameraAccount=null,origin=null;
const allowed=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed;
const isOpen=()=>allowed()&&(L.route==='myQr'||L.route==='campusPay'&&!!L.params.qrScan);
const mode=()=>L.route==='myQr'||L.params.qrMode==='code'?'code':'scan';
const active=()=>isOpen()&&mode()==='scan';
const qrSurface=()=>active()||L.route==='campusPay'&&!!L.params.qrSample&&allowed();
const clone=value=>JSON.parse(JSON.stringify(value||{}));
const inputCode=/^[A-Z0-9][A-Z0-9-]{1,63}$/;
const parse=value=>{
 if(typeof value!=='string'||value.length>100)return null;
 const raw=value.trim().toUpperCase();
 const prefixed=raw.match(/^LUMO1:(MERCHANT|SALE):([A-Z0-9][A-Z0-9-]{1,63})$/);
 const code=prefixed?prefixed[2]:raw;
 if(!inputCode.test(code))return null;
 const sale=code.startsWith('SALE-');
 if(prefixed&&((prefixed[1]==='SALE')!==sale))return null;
 // Only this preview's identifiers are recognised. URL, EMV/GhQR and arbitrary
 // amount payloads are not followed, fetched or interpreted as payment data.
 if(!sale&&!merchants.some(x=>x[0]===code))return null;
 return {type:sale?'sale':'merchant',code};
};
const payload=code=>{const item=parse(String(code||''));return item?'LUMO1:'+(item.type==='sale'?'SALE':'MERCHANT')+':'+item.code:'';};
const model=value=>{
 const parsed=parse(value);
 if(!parsed||typeof window.qrcode!=='function')return null;
 const qr=window.qrcode(0,'M');qr.addData(payload(parsed.code),'Byte');qr.make();return qr;
};
const svg=(value,size=176)=>{
 const qr=model(value);if(!qr)return '';
 const n=qr.getModuleCount(),quiet=4,side=n+quiet*2,dimension=Math.min(320,Math.max(96,Number(size)||176));let path='';
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))path+=`M${x+quiet} ${y+quiet}h1v1h-1z`;
 return `<svg class="lumo-payment-qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${dimension}" height="${dimension}" role="img" aria-label="Lumo sample payment QR" shape-rendering="crispEdges"><rect width="${side}" height="${side}" fill="#fff"/><path d="${path}" fill="#111"/></svg>`;
};
function stopTracks(value){for(const track of value?.getTracks?.()||[])try{track.stop();}catch{}}
function stop(){
 generation++;clearTimeout(timer);timer=null;stopTracks(stream);stream=null;detector=null;cameraAccount=null;phase='idle';
 const video=document.getElementById('qr-video');if(video){try{video.pause?.();video.srcObject=null;}catch{}}
}
function status(text){message=text;const el=document.getElementById('qr-status');if(el)el.textContent=text;}
function repaint(){
 if(!isOpen())return;
 const focused=document.activeElement?.id;
 L.render();
 if(focused==='qr-tab-scan'||focused==='qr-tab-code')document.getElementById(focused)?.focus?.({preventScroll:true});
}
function explain(text){stop();message='Camera off. Upload a QR image or try again.';repaint();L.error(text);}
function consume(value,source='camera',expectedGeneration=generation){
 if(!qrSurface()||expectedGeneration!==generation)return false;
 const person=L.personalQr?.parse(value);
 if(person){
  stop();message='';
  const accepted=L.personalQr.consume(value);
  if(!accepted&&active()){const error=document.getElementById('error')?.textContent||'Check the QR and try again.';message='QR not selected. Try another code.';repaint();L.error(error);}
  return accepted;
 }
 const parsed=parse(value);
 if(!parsed){explain('This preview reads Lumo user, merchant and sale QRs only. Try another QR or enter a code.');return false;}
 stop();message='';
 const previous=L.state.paymentDraft;
 // The shared resolver checks the merchant, sale status, expiry and fixed
 // amount. Recognition itself never submits or marks a payment successful.
 L.findMerchant(parsed.code);
 const d=L.state.paymentDraft;
 const resolved=L.route==='send'&&d!==previous&&d?.method==='campus'&&d.destination===parsed.code;
 if(resolved){L.toast('QR read. Check '+d.name+' before you pay.');return true;}
 if(active()){const error=document.getElementById('error')?.textContent||'This merchant or sale is unavailable. Check the code and try again.';message=error;repaint();L.error(error);}
 return false;
}
const canvasFor=()=>document.getElementById('qr-canvas')||document.createElement('canvas');
function decodePixels(data,width,height){
 if(typeof window.jsQR!=='function')return null;
 const decoded=window.jsQR(data,width,height,{inversionAttempts:'attemptBoth'});return decoded?.data||null;
}
async function decodeImage(source,width,height){
 // Native decoding is useful where available; the bundled decoder also works
 // on browsers without BarcodeDetector and does not send images anywhere.
 if(detector){try{const items=await detector.detect(source);if(items?.[0]?.rawValue)return items[0].rawValue;}catch{}}
 const canvas=canvasFor(),scale=Math.min(1,1000/Math.max(width,height));canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
 const context=canvas.getContext?.('2d',{willReadFrequently:true});if(!context)throw Error('image-unavailable');
 context.drawImage(source,0,0,canvas.width,canvas.height);const frame=context.getImageData(0,0,canvas.width,canvas.height);
 return decodePixels(frame.data,frame.width,frame.height);
}
async function tick(token){
 if(cameraAccount&&cameraAccount!==L.state){stop();return;}
 if(token!==generation||!active()||!stream)return;
 const video=document.getElementById('qr-video');
 if(video&&video.readyState>=2&&video.videoWidth&&video.videoHeight){
  try{const value=await decodeImage(video,video.videoWidth,video.videoHeight);if(cameraAccount&&cameraAccount!==L.state){stop();return;}if(token!==generation||!active())return;if(value){consume(value,'camera',token);return;}}catch{if(token!==generation||cameraAccount!==L.state)return;status('Keep the QR inside the frame. You can also choose a photo or enter a code.');}
 }
 if(token===generation&&active())timer=setTimeout(()=>tick(token),220);
}
function attach(){
 const video=document.getElementById('qr-video');if(!video||!stream||!active())return;
 video.srcObject=stream;const playing=video.play?.();playing?.catch?.(()=>{if(active())status('Tap Start camera again, or choose a QR photo.');});
}
async function startCamera(){
 if(!active()||phase==='requesting')return;
 stop();const token=generation;cameraAccount=L.state;
 if(!navigator.mediaDevices?.getUserMedia){explain('Camera scanning is unavailable in this browser. Upload a QR image or enter a merchant code.');return;}
 phase='requesting';message='Allow camera access to scan. Nothing is recorded.';repaint();
 try{
  if(typeof window.BarcodeDetector==='function'){
   try{const formats=typeof window.BarcodeDetector.getSupportedFormats==='function'?await window.BarcodeDetector.getSupportedFormats():['qr_code'];if(formats.includes('qr_code'))detector=new window.BarcodeDetector({formats:['qr_code']});}catch{detector=null;}
  }
  if(token!==generation||!active())return;
  const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
  if(token!==generation||!active()||cameraAccount!==L.state){stopTracks(media);return;}
  stream=media;phase='active';message='Point the camera at a Lumo QR.';repaint();attach();tick(token);
 }catch(error){
  if(token!==generation||!active())return;
  const text=error?.name==='NotAllowedError'||error?.name==='SecurityError'?'Camera access was not allowed. You can choose a QR photo or enter the code.':error?.name==='NotFoundError'||error?.name==='DevicesNotFoundError'?'No camera was found. Choose a QR photo or enter the code.':error?.name==='NotReadableError'?'Your camera is in use. Close the other camera app, or enter the code.':'The camera could not start. Try again, choose a QR photo or enter the code.';
  explain(text);
 }
}
async function readFile(input){
 if(!active())return;const file=input?.files?.[0];if(!file)return;
 stop();const token=generation,account=L.state;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024){explain('Choose a PNG, JPG or WebP photo under 12 MB.');input.value='';return;}
 phase='reading';message='Reading your QR photo on this device…';repaint();let url='';
 try{
  url=URL.createObjectURL(file);const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
  if(token!==generation||!active()||account!==L.state)return;
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw Error('image-unavailable');
  const value=await decodeImage(image,image.naturalWidth,image.naturalHeight);
  if(token!==generation||!active()||account!==L.state)return;
  if(value)consume(value,'image',token);else explain('No QR found in this photo. Try a clearer picture or enter the code.');
 }catch{if(token===generation&&active())explain('That photo could not be read. Try another photo or enter the code.');}
 finally{if(url)URL.revokeObjectURL(url);if(input)input.value='';}
}
function open(options={}){
 if(!allowed())return;
 const nextMode=options.mode==='code'?'code':'scan';
 if(isOpen())return setMode(nextMode,options);
 L.savePaymentFields?.();L.captureFormDraft?.();stop();message='';
 origin={route:L.route,params:clone(L.params),account:L.state};
 L.go('campusPay',{qrSample:false,qrScan:true,qrMode:nextMode});
 if(nextMode==='scan'&&options.autoCamera!==false)return startCamera();
}
function setMode(nextMode,options={}){
 if(!isOpen()||!['scan','code'].includes(nextMode))return;
 if(mode()===nextMode)return;
 stop();message='';
 // Both tabs are one task. Replacing this state keeps Back and Close pointed
 // at the screen that opened QR, however often the tabs are switched.
 if(L.route==='myQr')L.route='campusPay';
 L.params={...L.params,qrSample:false,qrScan:true,qrMode:nextMode};L.render();L.syncBrowser?.('replace');
 document.getElementById('qr-tab-'+nextMode)?.focus?.({preventScroll:true});
 if(nextMode==='scan'&&options.autoCamera!==false)return startCamera();
}
function tabKey(event){
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 event.preventDefault();return setMode(event.key==='Home'?'scan':event.key==='End'?'code':mode()==='scan'?'code':'scan');
}
function close(){
 if(!isOpen())return;
 const previous=origin;origin=null;stop();message='';
 if(previous?.account===L.state&&previous.route==='campusPay'&&!previous.params.qrScan){
  L.params=clone(previous.params);L.render();L.syncBrowser?.('replace');return;
 }
 L.back();
}
function pauseCamera(){stop();message='Camera stopped. Start it again, choose a QR photo or enter the code.';repaint();}
function findPerson(){stop();message='';L.startSend('lumo');}
function codeEntry(){stop();message='';L.go('campusPay',{...L.params,qrSample:false,qrScan:false});document.getElementById('merchant-code')?.focus?.();}
function sample(){stop();message='';L.go('campusPay',{...L.params,qrScan:false,qrSample:true});}
function scanSample(){
 if(!qrSurface()||!L.params.qrSample)return false;
 const qr=model('AK01');if(!qr){L.error('The sample QR could not load. Enter AK01 instead.');return false;}
 const quiet=4,scale=5,n=qr.getModuleCount(),width=(n+quiet*2)*scale,pixels=new Uint8ClampedArray(width*width*4);pixels.fill(255);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const at=(((y+quiet)*scale+dy)*width+(x+quiet)*scale+dx)*4;pixels[at]=pixels[at+1]=pixels[at+2]=0;}
 const decoded=decodePixels(pixels,width,width);if(!decoded){L.error('The sample QR could not be read. Enter AK01 instead.');return false;}return consume(decoded,'sample');
}
function findCode(){codeDraft=L.value('merchant-code').slice(0,64);L.findMerchant(codeDraft);}
function hubView(selected=mode()){
 const code=selected==='code';
 const cameraOff='<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M5 5H3v14h18V8h-5l-2-3H9M9 9a4 4 0 0 0 6 6"/></svg>';
 const photoIcon='<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/></svg>';
 const toolbar=`<div class="qr-hub-toolbar"><button type="button" class="qr-hub-close" onclick="L.qr.close()" aria-label="Close QR">${L.icon('close',28)}</button>${!code&&phase==='active'?`<button type="button" class="qr-camera-toggle" onclick="L.qr.pauseCamera()" aria-label="Pause camera">${cameraOff}</button>`:'<span aria-hidden="true"></span>'}</div>`;
 const tabs=`<div class="qr-hub-tabs" role="tablist" aria-label="QR payment mode"><button type="button" id="qr-tab-scan" role="tab" aria-controls="qr-scan-panel" aria-selected="${!code}" tabindex="${code?-1:0}" onclick="L.qr.setMode('scan')" onkeydown="L.qr.tabKey(event)">Scan</button><button type="button" id="qr-tab-code" role="tab" aria-controls="qr-code-panel" aria-selected="${code}" tabindex="${code?0:-1}" onclick="L.qr.setMode('code')" onkeydown="L.qr.tabKey(event)">My code</button></div>`;
 if(code)return `<section class="qr-campus qr-hub is-code" aria-label="Lumo QR payments">${toolbar}${tabs}<div id="qr-code-panel" class="qr-code-panel" role="tabpanel" aria-labelledby="qr-tab-code"><h1>Your QR code</h1><p class="qr-hub-subtitle">Let another Lumo user scan to pay you.</p>${L.personalQr?.content?.()||'<p>Your code is unavailable. Please reopen QR.</p>'}</div></section>`;
 const controls=phase==='active'?'':B(phase==='requesting'?'Opening camera…':phase==='reading'?'Reading image…':'Start camera','L.qr.startCamera()','qr-camera-retry').replace('<button ',`<button ${['requesting','reading'].includes(phase)?'disabled aria-busy="true" ':''}`);
 return `<section class="qr-campus qr-hub qr-scanner is-scan" aria-label="Lumo QR payments"><video id="qr-video" class="qr-hub-video" autoplay playsinline muted aria-label="Live camera preview"></video>${toolbar}${tabs}<div id="qr-scan-panel" class="qr-scan-panel" role="tabpanel" aria-labelledby="qr-tab-scan"><h1>Scan QR code to pay</h1><div class="qr-scan-stage"><div class="qr-hub-viewfinder ${phase==='active'?'is-active':''}" aria-label="QR camera viewfinder"><i></i><i></i><i></i><i></i>${phase==='active'?'':`<span aria-hidden="true">${L.icon('scan',52)}</span>`}</div><p class="qr-frame-hint">Position the QR code inside the frame</p></div><div class="qr-hub-feedback"><p id="qr-status" class="qr-status" role="status" aria-live="polite">${E(message||'Your camera opens here. Allow access when asked.')}</p><div id="error" role="alert"></div>${controls}</div><div class="qr-hub-actions"><label class="qr-hub-upload" for="qr-photo">${photoIcon} Upload QR file<input type="file" id="qr-photo" accept="image/png,image/jpeg,image/webp" onchange="L.qr.readFile(this)"></label>${B('Find a Lumo person','L.qr.findPerson()','qr-manual-code')}${B('Enter merchant code','L.qr.codeEntry()','qr-manual-code')}<p class="qr-hub-boundary">Sample payments · Photos stay on this device</p></div><canvas id="qr-canvas" hidden aria-hidden="true"></canvas></div></section>`;
}
L.qr={open,setMode,tabKey,close,isOpen,isHub:isOpen,hubView,codeEntry,sample,scanSample,startCamera,pauseCamera,findPerson,stop,readFile,consume,parse,payload,svg,decodePixels,findCode};
L.views.campusPay=()=>{
 const intro=L.header(L.params.qrScan?'Scan QR':'Campus Pay',L.params.qrScan?'Scan, then check who you’re paying.':L.params.qrSample?'Try the scan journey with sample money.':'Scan a QR or enter a merchant code.');
 if(L.params.qrScan)return hubView();
 if(L.params.qrSample)return `<section class="qr-campus qr-sample">${intro}<figure class="qr-sample-figure">${svg('AK01',188)}<figcaption><strong>Akua’s Kitchen</strong><span>Sample Lumo QR · AK01</span></figcaption></figure><p class="small muted">The QR fills in the merchant. You still choose the amount and authorise separately.</p><div id="error" role="alert"></div><div class="actions">${B('Read sample QR','L.qr.scanSample()')}${B('Scan with camera','L.qr.open()','secondary')}${B('Enter code instead','L.qr.codeEntry()','text-btn')}</div><p class="qr-preview-note">Sample money · No live payment. Sale QRs created in this preview work only in the same browser’s saved demo.</p></section>`;
 return `<section class="qr-campus qr-campus-entry">${intro}<button type="button" class="primary qr-start" onclick="L.qr.open()">${L.icon('scan',25)}<span>Scan QR</span>${L.icon('chevron',18)}</button><form class="qr-code-form" onsubmit="event.preventDefault();L.qr.findCode()"><label class="field" for="merchant-code"><span>Or enter merchant / sale code</span></label><div class="inline"><input class="input" id="merchant-code" maxlength="64" placeholder="e.g. AK01" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${E(codeDraft)}"><button type="submit" class="secondary">Find</button></div><div id="error" role="alert"></div></form><div class="section-head"><h2>Around campus</h2></div><div class="list qr-merchants">${merchants.map(([code,name,detail])=>L.row(name,detail+' · '+code,'scan',`L.pickMerchant('${code}')`)).join('')}</div>${B('Try a sample QR','L.qr.sample()','text-btn')}<p class="qr-preview-note">Sample money · Lumo QRs only. No live payments.</p></section>`;
};
// Stop capture on every exit, including sheet close, history and a late camera
// permission response. A fresh scan tap starts capture; background return does not.
function measureHub(){
 if(!isOpen())return;
 const layer=document.querySelector('.task-sheet-layer'),app=document.getElementById('app');
 if(!layer||!app)return;
 const rect=app.getBoundingClientRect?.(),viewport=window.visualViewport;
 if(!rect)return;
 const viewportTop=viewport?.offsetTop||0,viewportHeight=viewport?.height||window.innerHeight||800;
 const top=Math.max(viewportTop,rect.top),bottom=Math.min(viewportTop+viewportHeight,rect.bottom);
 if(bottom<=top)return;
 layer.style?.setProperty?.('--qr-hub-top',top+'px');layer.style?.setProperty?.('--qr-hub-height',(bottom-top)+'px');
}
function syncHub(){
 const open=isOpen();document.body?.classList?.toggle('lumo-qr-hub-open',open);
 // The native task keeps its existing labelled-by relationship. Its chrome is
 // hidden here, but its accessible name should describe this unified screen.
 if(open){const title=document.getElementById('task-sheet-title');if(title)title.textContent='QR payments';measureHub();}
}
const beforeNavigate=L.beforeNavigate;L.beforeNavigate=function(route,params={}){if(route!=='campusPay'||!params.qrScan||params.qrMode==='code')stop();if(route!=='myQr'&&(route!=='campusPay'||!params.qrScan))document.body?.classList?.remove('lumo-qr-hub-open');return beforeNavigate?.call(this,route,params);};
const render=L.render;L.render=function(...args){if(!active()||cameraAccount&&cameraAccount!==L.state)stop();const result=render.apply(this,args);syncHub();if(!active())stop();else if(stream)attach();return result;};
window.addEventListener('pagehide',stop);window.addEventListener('popstate',()=>{if(!active())stop();});
// Match the visible Close control when a hardware keyboard is present, even
// when QR was opened from a deeper task rather than from a primary tab.
window.addEventListener('keydown',event=>{if(isOpen()&&event.key==='Escape'&&!document.getElementById('persistence-recovery')){event.preventDefault();event.stopImmediatePropagation?.();close();}},true);
window.addEventListener('resize',measureHub);window.addEventListener('scroll',measureHub,{passive:true});
window.visualViewport?.addEventListener?.('resize',measureHub);window.visualViewport?.addEventListener?.('scroll',measureHub);
window.addEventListener('pageshow',()=>{if(active()&&!stream){message='Camera off. Start it when you’re ready, or enter the code.';repaint();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){const was=active()&&(!!stream||phase!=='idle');stop();if(was){message='Camera paused. Tap Start camera when you’re ready.';repaint();}}});
document.addEventListener('input',event=>{if(event.target?.id==='merchant-code'&&document.getElementById('merchant-code')===event.target)codeDraft=String(event.target.value||'').slice(0,64);});
})();
