/** Visual game feedback only. This module never reads or changes game or banking state. */
const noop=()=>{};
const tokens=new Set(['stage','hero','title','body','choice','number','star','unlock','path','lux']);
const safeAmount=value=>Number.isSafeInteger(value)&&value>=0&&value<=10000000000;
const money=value=>`GH₵${(value/100).toLocaleString('en-GH',{minimumFractionDigits:value%100?2:0,maximumFractionDigits:2})}`;
const numberText=(value,format)=>['integer','number','stars'].includes(format)?Math.round(value).toLocaleString('en-GH'):money(Math.round(value));
const list=(root,selector)=>{try{return [...(root.querySelectorAll?.(selector)||[])];}catch{return[];}};

/**
 * Mount finite, cancellable motion on an already-rendered screen.
 * Number hooks must be an aria-hidden presentation copy; the accessible final
 * amount belongs in the surrounding markup. `fresh` gates every celebration.
 */
export function bindCampusMotion(root,options={}){
 if(!root||typeof root!=='object')return noop;
 const doc=options.document||root.ownerDocument||globalThis.document;
 const win=doc?.defaultView||globalThis;
 const clock=typeof options.now==='function'?options.now:()=>win.performance?.now?.()??Date.now();
 const raf=options.raf||win.requestAnimationFrame?.bind(win);
 const cancelRaf=options.cancelRaf||win.cancelAnimationFrame?.bind(win);
 let query;try{query=(options.matchMedia||win.matchMedia?.bind(win))?.('(prefers-reduced-motion: reduce)');}catch{}
 let disposed=false,active=true,pressed=null;
 const animations=new Set(),frames=new Set(),numbers=new Map(),layers=new Set();
 const connected=()=>root.isConnected!==false;
 const reduced=()=>options.reduced===true||query?.matches===true;
 const classToggle=(name,on)=>{try{root.classList?.toggle?.(name,on);}catch{}};
 const state=value=>{try{if(root.dataset)root.dataset.motionState=value;}catch{}};
 const transformOf=el=>{try{const value=win.getComputedStyle?.(el)?.transform;return value&&value!=='none'?value:'';}catch{return'';}};
 const withTransform=(base,value)=>`${base} ${value}`.trim()||'none';
 function removeLayer(layer){try{layer.remove?.();}catch{}layers.delete(layer);}
 function cancelAnimation(animation){try{animation?.cancel?.();}catch{}animations.delete(animation);}
 function finalizeNumbers(){for(const [el,entry] of numbers){if(el.textContent!==entry.finalText)el.textContent=entry.finalText;}}
 function stop({finalize=true,mark=true,reason='stopped'}={}){
  active=false;pressed=null;
  for(const id of frames){try{cancelRaf?.(id);}catch{}}frames.clear();
  for(const animation of [...animations])cancelAnimation(animation);
  if(finalize)finalizeNumbers();
  for(const layer of [...layers])removeLayer(layer);
  if(mark){classToggle('campus-motion-paused',true);state(reason);}
 }
 function alive(){
  if(disposed||!active)return false;
  if(!connected()){stop({finalize:false,mark:false});return false;}
  return true;
 }
 function animate(el,keyframes,timing={},retain=false){
  if(!alive()||typeof el?.animate!=='function')return null;
  let animation;
  try{
   animation=el.animate(keyframes,{duration:380,easing:'cubic-bezier(.2,.8,.2,1)',fill:'none',...timing});
   if(!animation)return null;
   animations.add(animation);
   if(animation.finished&&typeof animation.finished.then==='function')Promise.resolve(animation.finished).then(()=>{if(!retain)animations.delete(animation);},()=>animations.delete(animation));
   return animation;
  }catch{if(animation)cancelAnimation(animation);return null;}
 }
 function schedule(callback){
  if(!alive()||typeof raf!=='function')return;
  let id;
  try{id=raf(time=>{frames.delete(id);if(alive())callback(time);});frames.add(id);}catch{}
 }
 function animateNumber(el,index){
  if(el.getAttribute?.('aria-hidden')!=='true')return;
  const from=Number(el.dataset?.motionFrom),to=Number(el.dataset?.motionTo);
  if(!safeAmount(from)||!safeAmount(to)||el.dataset?.motionFrom===undefined||el.dataset?.motionTo===undefined)return;
  const finalText=String(el.textContent||numberText(to,el.dataset.motionFormat));
  numbers.set(el,{finalText});
  if(from===to||typeof raf!=='function'||typeof cancelRaf!=='function')return;
  const start=clock(),delay=Math.min(index,5)*55,duration=680;
  el.textContent=numberText(from,el.dataset.motionFormat);
  const frame=time=>{
   const elapsed=Math.max(0,(Number.isFinite(time)?time:clock())-start-delay),progress=Math.min(1,elapsed/duration),ease=1-Math.pow(1-progress,3);
   if(progress>=1){el.textContent=finalText;return;}
   el.textContent=numberText(from+(to-from)*ease,el.dataset.motionFormat);schedule(frame);
  };
  schedule(frame);
 }
 function burst(){
  if(!alive()||!doc?.createElement||typeof root.appendChild!=='function')return;
  let layer;
  try{
   layer=doc.createElement('div');layer.className='campus-motion-particles';layer.setAttribute('aria-hidden','true');root.appendChild(layer);layers.add(layer);
   const flights=[];
   for(let i=0;i<12;i++){
    const particle=doc.createElement('span');particle.className=`campus-motion-particle shape-${i%3}`;particle.textContent=i%4===0?'✦':'';
    particle.style?.setProperty?.('--particle-index',String(i));layer.appendChild(particle);
    const angle=(i/12)*Math.PI*2,dx=Math.cos(angle)*(72+(i%3)*25),dy=Math.sin(angle)*(80+(i%4)*21)-35;
    const animation=animate(particle,[{opacity:0,transform:'translate(-50%,-50%) scale(.25)'},{opacity:1,offset:.12,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:`translate(calc(-50% + ${dx.toFixed(1)}px),calc(-50% + ${dy.toFixed(1)}px)) rotate(${i*47}deg) scale(.4)`}],{duration:760+(i%3)*90,delay:i%4*25,easing:'cubic-bezier(.1,.5,.3,1)'});
    if(animation)flights.push(Promise.resolve(animation.finished).catch(noop));
   }
   if(!flights.length){removeLayer(layer);return;}
   Promise.all(flights).then(()=>{if(alive())removeLayer(layer);},noop);
  }catch{if(layer)removeLayer(layer);}
 }
 function enter(){
  const direction=options.transition?.direction||'forward',sign=direction==='back'||direction==='rewind'?-1:1;
  const elements=list(root,'[data-motion]');
  try{if(root.matches?.('[data-motion]'))elements.unshift(root);}catch{}
  const counts={};
  for(const el of elements){
   const type=el.dataset?.motion;if(!tokens.has(type))continue;
   const count=counts[type]||0;counts[type]=count+1;
   const requested=Number(el.dataset.motionIndex),index=Number.isFinite(requested)&&requested>=0?requested:count,delay=Math.min(index,6)*55,base=transformOf(el);
   if(type==='number'){animateNumber(el,index);continue;}
   if(type==='stage'){animate(el,[{opacity:.35,transform:withTransform(base,`translate3d(${sign*22}px,0,0)`)},{opacity:1,transform:base||'none'}],{duration:310});continue;}
   if(type==='path'){animate(el,[{opacity:.3,clipPath:'inset(0 0 100% 0)'},{opacity:1,clipPath:'inset(0 0 0 0)'}],{duration:650,delay,easing:'cubic-bezier(.25,.5,.25,1)'});continue;}
   if(type==='lux'){
    animate(el,[{transform:withTransform(base,'translateY(12px) rotate(-7deg) scale(.88)')},{transform:withTransform(base,'translateY(-5px) rotate(3deg) scale(1.035)'),offset:.65},{transform:base||'none'}],{duration:540,delay:80});
    animate(el,[{transform:base||'none'},{transform:withTransform(base,'translateY(-4px) rotate(2deg)')},{transform:base||'none'}],{duration:1400,delay:650,iterations:2,easing:'ease-in-out'});continue;
   }
   if(type==='star'){
    const earned=el.classList?.contains?.('earned')||el.dataset.motionEarned==='true';
    const fresh=earned&&options.transition?.fresh===true;
    animate(el,fresh?[{opacity:.2,transform:withTransform(base,'translateY(16px) rotate(-25deg) scale(.3)')},{opacity:1,transform:withTransform(base,'translateY(-4px) rotate(6deg) scale(1.18)'),offset:.68},{opacity:1,transform:base||'none'}]:[{opacity:.7},{opacity:1}],{duration:fresh?520:220,delay:fresh?150+delay:delay});continue;
   }
   if(type==='unlock'){
    const fresh=options.transition?.fresh===true;
    animate(el,fresh?[{opacity:0,transform:withTransform(base,'translateY(12px) scale(.94)')},{opacity:1,transform:withTransform(base,'translateY(-3px) scale(1.025)'),offset:.7},{opacity:1,transform:base||'none'}]:[{opacity:.7},{opacity:1}],{duration:fresh?520:220,delay:fresh?370+delay:delay});continue;
   }
   const hero=type==='hero',choice=type==='choice';
   animate(el,[{opacity:hero ? .3 : 0,transform:withTransform(base,hero?'translateY(15px) scale(.92)':choice?'translateY(12px) scale(.975)':'translateY(10px)')},{opacity:1,transform:base||'none'}],{duration:hero?520:choice?330:380,delay:(type==='body'?110:type==='title'?40:0)+delay});
  }
  if(options.particles!==false&&options.transition?.fresh===true&&(['completion','rewards'].includes(options.kind)||options.celebrate===true))burst();
 }
 function buttonFrom(event){
  try{const button=event.target?.closest?.('button');return button&&!button.disabled&&(typeof root.contains!=='function'||root.contains(button))?button:null;}catch{return null;}
 }
 function press(event){
  if(!alive()||event.button!==undefined&&event.button!==0)return;
  if(event.type==='keydown'&&(!['Enter',' ','Spacebar'].includes(event.key)||event.repeat))return;
  const button=buttonFrom(event);if(!button)return;
  if(pressed)cancelAnimation(pressed.animation);
  const base=transformOf(button);pressed={button,base,animation:animate(button,[{transform:base||'none'},{transform:withTransform(base,'scale(.97)')}],{duration:90,easing:'ease-out',fill:'forwards'},true)};
 }
 function release(event){
  if(!pressed)return;
  if(event?.type==='keyup'&&!['Enter',' ','Spacebar'].includes(event.key))return;
  const {button,base,animation}=pressed;pressed=null;cancelAnimation(animation);
  if(alive())animate(button,[{transform:withTransform(base,'scale(.97)')},{transform:withTransform(base,'scale(1.015)'),offset:.6},{transform:base||'none'}],{duration:180,easing:'ease-out'});
 }
 const resumeInteractions=()=>{
  if(disposed||!connected()||reduced()||doc?.visibilityState==='hidden')return;
  // Leave CSS decoration settled: returning to a tab must not replay rewards.
  active=true;state('ready');
 };
 const visibility=()=>{if(doc?.visibilityState==='hidden')stop({reason:'stopped'});else resumeInteractions();};
 const preference=event=>{
  const reduce=options.reduced===true||(typeof event?.matches==='boolean'?event.matches:query?.matches===true);
  classToggle('campus-motion-off',reduce);
  if(reduce)stop({reason:'reduced'});else resumeInteractions();
 };
 const listeners=[];
 const listen=(target,name,handler)=>{if(typeof target?.addEventListener!=='function')return;target.addEventListener(name,handler);listeners.push(()=>target.removeEventListener?.(name,handler));};
 listen(root,'pointerdown',press);listen(root,'pointerup',release);listen(root,'pointercancel',release);listen(root,'keydown',press);listen(root,'keyup',release);
 listen(doc,'pointerup',release);listen(doc,'pointercancel',release);listen(doc,'visibilitychange',visibility);listen(win,'blur',release);
 if(typeof query?.addEventListener==='function')listen(query,'change',preference);
 else if(typeof query?.addListener==='function'){query.addListener(preference);listeners.push(()=>query.removeListener?.(preference));}
 classToggle('campus-motion-off',reduced());classToggle('campus-motion-paused',false);state('ready');
 if(reduced())stop({reason:'reduced'});
 else if(doc?.visibilityState==='hidden')stop({reason:'stopped'});
 else if(options.enter!==false)enter();
 return ()=>{if(disposed)return;disposed=true;stop();for(const remove of listeners){try{remove();}catch{}}};
}
