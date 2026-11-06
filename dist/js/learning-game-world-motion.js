/** Lux locomotion and direct manipulation. This module never reads money or submits game actions. */
const noop=()=>{};
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const finite=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
const query=(root,selector)=>{try{return root?.querySelector?.(selector)||null;}catch{return null;}};
const all=(root,selector)=>{try{return [...(root?.querySelectorAll?.(selector)||[])];}catch{return [];}};
const rect=el=>{try{const r=el?.getBoundingClientRect?.();return r&&r.width>0&&r.height>0?r:null;}catch{return null;}};
const percent=(value,fallback)=>value!==undefined&&value!==null&&value!==''?clamp(finite(value,fallback),0,100):fallback;

/**
 * The UI commits an intentional tap/drop synchronously, then calls travelTo.
 * onFinish is a presentation callback only. Hidden tabs hold it until visible;
 * disposal/navigation always discards it. Native target buttons handle keyboards.
 */
export function bindLuxWorld(root,options={}){
 const stage=root?.matches?.('[data-world-stage]')?root:query(root,'[data-world-stage]');
 const player=query(stage,'[data-world-player]');
 const doc=options.document||stage?.ownerDocument||root?.ownerDocument||globalThis.document;
 const win=doc?.defaultView||globalThis;
 const clock=typeof options.now==='function'?options.now:()=>win.performance?.now?.()??Date.now();
 const raf=options.raf||win.requestAnimationFrame?.bind(win),cancelRaf=options.cancelRaf||win.cancelAnimationFrame?.bind(win);
 let media;try{media=(options.matchMedia||win.matchMedia?.bind(win))?.('(prefers-reduced-motion: reduce)');}catch{}
 let disposed=false,travel=null,drag=null,frame=null,idleAt=null,epoch=0,lastDrop=-Infinity,pendingFinish=null;
 const effects=new Set(),listeners=[];
 const connected=()=>root?.isConnected!==false&&stage?.isConnected!==false;
 const visible=()=>doc?.visibilityState!=='hidden';
 const reduced=()=>options.reduced===true||media?.matches===true;
 const valid=()=>!disposed&&connected();
 const set=(node,name,value)=>{try{node?.style?.setProperty?.(name,value);}catch{}};
 const attr=(node,name,value)=>{try{node?.setAttribute?.(name,String(value));}catch{}};
 function dimensions(){const r=rect(stage);return r?{rect:r,width:finite(stage.clientWidth,r.width)||r.width,height:finite(stage.clientHeight,r.height)||r.height}:null;}
 let size=dimensions();
 function clampPoint(point){
  const current=dimensions()||size;if(!current)return {...point};
  const box=rect(player),width=finite(player?.offsetWidth,box?box.width*current.width/current.rect.width:76)||76,height=finite(player?.offsetHeight,box?box.height*current.height/current.rect.height:84)||84;
  return {x:clamp(point.x,Math.min(width/2+3,current.width/2),Math.max(current.width/2,current.width-width/2-3)),y:clamp(point.y,Math.min(height+3,current.height*.7),current.height-4)};
 }

 const startX=percent(options.initialPosition?.x??player?.dataset?.worldX??stage?.dataset?.worldStartX,12),startY=percent(options.initialPosition?.y??player?.dataset?.worldY??stage?.dataset?.worldStartY,94);
 let position=clampPoint({x:(size?.width||100)*startX/100,y:(size?.height||100)*startY/100}),displayPoint={...position};
 function pose(point=position,{tilt=0,sx=1,sy=1,state='idle',facing}={}){
  if(!valid()||!player)return;
  displayPoint={...point};
  set(player,'--lux-x',`${point.x.toFixed(2)}px`);set(player,'--lux-y',`${point.y.toFixed(2)}px`);
  set(player,'--lux-tilt',`${tilt.toFixed(2)}deg`);set(player,'--lux-scale-x',String(sx));set(player,'--lux-scale-y',String(sy));
  if(facing)set(player,'--lux-facing',String(facing));attr(player,'data-world-state',state);
 }
 function clearFrame(){if(frame!==null){try{cancelRaf?.(frame);}catch{}frame=null;}}
 function cancelEffects(){for(const animation of effects){try{animation.cancel?.();}catch{}}effects.clear();}
 function clearHover(){for(const target of all(stage,'[data-world-choice]'))attr(target,'data-world-hover','false');}
 function releaseCapture(value=drag){if(!value)return;try{player?.releasePointerCapture?.(value.id);}catch{}}
 function callback(fn){if(typeof fn==='function'&&valid()&&visible()){try{fn();}catch(error){options.onError?.(error);}}}
 function deliver(fn){if(typeof fn!=='function')return;if(!visible()){pendingFinish=fn;return;}callback(fn);}
 function settleTravel({notify=true}={}){
  const current=travel;travel=null;clearFrame();idleAt=null;epoch++;
  if(current)position={...current.to};pose(position,{state:'landed'});attr(stage,'data-world-moving','false');clearHover();
  if(notify&&current)deliver(current.onFinish);
 }
 function cancel({notify=false,restore=true}={}){
  const current=travel;travel=null;clearFrame();idleAt=null;epoch++;pendingFinish=null;
  const previousDrag=drag;drag=null;if(previousDrag&&restore)position={...previousDrag.origin};releaseCapture(previousDrag);
  if(current&&restore)position={...current.from};
  pose(position);attr(stage,'data-world-moving','false');attr(stage,'data-world-dragging','false');clearHover();cancelEffects();
  if(notify&&current)deliver(current.onFinish);
 }
 function schedule(fn,token=epoch){
  if(!valid()||!visible()||typeof raf!=='function')return false;
  try{frame=raf(time=>{frame=null;if(valid()&&visible()&&token===epoch)fn(Number.isFinite(time)?time:clock());});return true;}catch{return false;}
 }
 function targetPoint(target){
  const current=dimensions();if(!current)return {...position};size=current;
  const x=target?.dataset?.worldX,y=target?.dataset?.worldY;
  if(x!==undefined&&y!==undefined)return clampPoint({x:current.width*percent(x,50)/100,y:current.height*percent(y,65)/100});
  const r=rect(target);return r?clampPoint({x:(r.left+r.width/2-current.rect.left)*current.width/current.rect.width,y:(r.bottom-current.rect.top)*current.height/current.rect.height}):{...position};
 }
 function isTarget(target){if(!target)return false;const choices=all(stage,'[data-world-choice]');return choices.includes(target)||(target.hasAttribute?.('data-world-gate')&&stage?.contains?.(target));}
 function moveToPoint(to,{onFinish,jump=true}={}){
  if(!valid()||travel||drag)return false;
  if(!stage||!player||!dimensions()){callback(onFinish);return true;}
  clearFrame();idleAt=null;epoch++;clearHover();to=clampPoint(to);
  const from={...position},distance=Math.hypot(to.x-from.x,to.y-from.y),direction=to.x>=from.x?1:-1;
  const motion={from,to,onFinish,start:clock(),duration:distance<45?250:480,settle:105,direction,token:epoch,jump};
  travel=motion;attr(stage,'data-world-moving','true');pose(position,{state:'running',facing:direction});
  if(reduced()||!visible()||typeof raf!=='function'||typeof cancelRaf!=='function'){settleTravel();return true;}
  const tick=time=>{
   if(!travel||travel!==motion)return;
   const elapsed=Math.max(0,time-motion.start),p=clamp(elapsed/motion.duration,0,1);
   if(p>=1){
    const landing=clamp((elapsed-motion.duration)/motion.settle,0,1);
    pose(to,{state:'landed',facing:direction,sx:1+.12*(1-landing),sy:1-.14*(1-landing)});
    if(landing>=1){settleTravel();return;}schedule(tick,motion.token);return;
   }
   const ease=p*p*(3-2*p),hop=motion.jump?Math.sin(Math.PI*p)*Math.min(62,Math.max(23,distance*.2)):Math.abs(Math.sin(p*Math.PI*6))*5;
   const point={x:from.x+(to.x-from.x)*ease,y:from.y+(to.y-from.y)*ease-hop};
   pose(point,{state:motion.jump&&p>.16&&p<.84?'jumping':'running',facing:direction,tilt:direction*Math.sin(p*Math.PI*2)*5,sx:1+.035*Math.sin(p*Math.PI*6),sy:1-.04*Math.sin(p*Math.PI*6)});
   schedule(tick,motion.token);
  };
  if(!schedule(tick,motion.token))settleTravel();return true;
 }
 function travelTo(target,settings={}){
  if(!valid()||travel||drag)return false;
  if(!stage||!player||!dimensions()){callback(settings.onFinish);return true;}
  if(!isTarget(target))return false;
  return moveToPoint(targetPoint(target),settings);
 }
 function moveToPosition(point,settings={}){
  const current=dimensions();if(!current)return valid()?(callback(settings.onFinish),true):false;
  return moveToPoint({x:current.width*percent(point?.x,12)/100,y:current.height*percent(point?.y,94)/100},settings);
 }
 function getPosition(){const current=dimensions()||size;return {x:Number(clamp(displayPoint.x/(current?.width||100)*100,0,100).toFixed(4)),y:Number(clamp(displayPoint.y/(current?.height||100)*100,0,100).toFixed(4))};}
 function setPosition(point){
  if(!valid())return false;cancel({restore:false});const current=dimensions()||size;
  if(current)size=current;position=clampPoint({x:(current?.width||100)*percent(point?.x,12)/100,y:(current?.height||100)*percent(point?.y,94)/100});displayPoint={...position};pose(position);return true;
 }

 function local(event){const current=dimensions();if(!current)return null;size=current;return {x:clamp((finite(event.clientX)-current.rect.left)*current.width/current.rect.width,0,current.width),y:clamp((finite(event.clientY)-current.rect.top)*current.height/current.rect.height,0,current.height)};}
 function closestTarget(point){
  let best=null,distance=Infinity;const current=dimensions();if(!current)return null;
  const actorHeight=finite(player?.offsetHeight,90)||90,body={x:point.x,y:point.y-actorHeight/2};
  for(const target of all(stage,'[data-world-choice]')){
   if(target.disabled||!target.dataset?.worldChoice)continue;
   const at=targetPoint(target),r=rect(target),d=Math.hypot(at.x-point.x,at.y-point.y),radius=Math.max(43,Math.min(78,(r?.width||50)*current.width/current.rect.width*.7));
   let inside=false,bodyDistance=Infinity;
   if(r){const left=(r.left-current.rect.left)*current.width/current.rect.width,top=(r.top-current.rect.top)*current.height/current.rect.height,width=r.width*current.width/current.rect.width,height=r.height*current.height/current.rect.height;inside=body.x>=left-12&&body.x<=left+width+12&&body.y>=top-12&&body.y<=top+height+12;bodyDistance=Math.hypot(body.x-left-width/2,body.y-top-height/2);}
   const score=inside?bodyDistance*.5:d;
   if((inside||d<=radius)&&score<distance){best=target;distance=score;}
  }
  return best;
 }

 function pointerDown(event){
  if(!valid()||!visible()||travel||drag||event.button!==undefined&&event.button!==0||event.isPrimary===false)return;
  if(event.target!==player&&!player?.contains?.(event.target))return;
  const at=local(event);if(!at)return;
  clearFrame();idleAt=null;epoch++;drag={id:event.pointerId??1,start:at,offset:{x:position.x-at.x,y:position.y-at.y},origin:{...position},moved:false};
  try{player.setPointerCapture?.(drag.id);}catch{}attr(stage,'data-world-dragging','true');pose(position,{state:'dragging'});event.preventDefault?.();
 }
 function pointerMove(event){
  if(!drag||!valid()||!visible()||(event.pointerId??1)!==drag.id)return;
  const at=local(event);if(!at)return;const wasMoving=drag.moved;drag.moved ||= Math.hypot(at.x-drag.start.x,at.y-drag.start.y)>6;
  if(drag.moved&&!wasMoving)callback(()=>options.onInteract?.('drag'));
  position=clampPoint({x:at.x+drag.offset.x,y:at.y+drag.offset.y});pose(position,{state:'dragging',tilt:clamp((at.x-drag.start.x)*.07,-10,10),sx:1.025,sy:.975});
  const nearest=closestTarget(position);clearHover();if(nearest)attr(nearest,'data-world-hover','true');event.preventDefault?.();
 }
 function pointerUp(event){
  if(!drag||(event.pointerId??1)!==drag.id)return;
  const previous=drag;drag=null;releaseCapture(previous);attr(stage,'data-world-dragging','false');clearHover();
  const target=valid()&&visible()&&previous.moved?closestTarget(position):null;
  if(!target){const current=dimensions();position=previous.moved&&valid()&&visible()&&current?clampPoint({x:position.x,y:current.height*.94}):{...previous.origin};pose(position);return;}
  lastDrop=clock();pose(position,{state:'idle'});event.preventDefault?.();
  // The synchronous release is the intent. Nothing in a frame can choose again.
  try{options.onChoose?.(target.dataset.worldChoice,target);}catch(error){position={...previous.origin};pose(position);options.onError?.(error);}
 }
 function pointerCancel(event){if(!drag||(event?.pointerId!==undefined&&event.pointerId!==drag.id))return;const previous=drag;drag=null;releaseCapture(previous);position={...previous.origin};clearHover();attr(stage,'data-world-dragging','false');pose(position);}
 function suppressSyntheticClick(event){if(clock()-lastDrop<400&&event.detail!==0){event.preventDefault?.();event.stopImmediatePropagation?.();}}
 function groundClick(event){
  if(!valid()||!visible()||travel||drag||clock()-lastDrop<400||event.defaultPrevented)return;
  if(event.target===player||player?.contains?.(event.target)||event.target?.closest?.('button'))return;
  const at=local(event),current=dimensions();if(!at||!current||at.y<current.height*.6)return;
  moveToPosition({x:at.x/current.width*100,y:94},{jump:false});
 }
 function playerKey(event){
  if(!valid()||!visible()||travel||drag||(event.target!==player&&!player?.contains?.(event.target))||event.repeat)return;
  if(!['ArrowLeft','ArrowRight',' ','Spacebar'].includes(event.key))return;
  event.preventDefault?.();callback(()=>options.onInteract?.('keyboard'));const point=getPosition();
  moveToPosition({x:point.x+(event.key==='ArrowLeft'?-14:event.key==='ArrowRight'?14:0),y:point.y},{jump:!event.key.startsWith('Arrow')});
 }
 function idle(){
  if(!player||reduced()||!visible()||!valid()||typeof raf!=='function'||typeof cancelRaf!=='function')return;
  idleAt=clock();const token=epoch;
  const tick=time=>{if(travel||drag||idleAt===null)return;const progress=clamp((time-idleAt)/2850,0,1);if(progress>=1){idleAt=null;pose(position);return;}const wave=Math.sin(progress*Math.PI*4);pose({x:position.x,y:position.y-Math.max(0,wave)*4},{sx:1+wave*.018,sy:1-wave*.018,tilt:Math.sin(progress*Math.PI*2)*1.5});schedule(tick,token);};
  schedule(tick,token);
 }
 function animateEffects(){
  if(reduced()||!visible())return;
  // The UI reserves normal-flow space for these factual cards outside the stage.
  // Only fresh cards have this hook; their text and final visibility never depend
  // on an animation finishing, and they never fly over another card or the scene.
  all(root,'[data-world-effect]').slice(0,6).forEach((el,index)=>{
   if(typeof el.animate!=='function')return;
   try{
    const animation=el.animate([{opacity:.65,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,delay:index*35,easing:'cubic-bezier(.2,.8,.2,1)',fill:'none'});
    if(!animation)return;
    effects.add(animation);Promise.resolve(animation.finished).then(()=>effects.delete(animation),()=>effects.delete(animation));
   }catch{}
  });
 }
 function visibility(){
  if(doc?.visibilityState==='hidden'){pointerCancel();if(travel)settleTravel();else{clearFrame();idleAt=null;epoch++;pose(position);}cancelEffects();return;}
  if(valid()&&pendingFinish){const fn=pendingFinish;pendingFinish=null;callback(fn);}
 }
 function preference(){if(reduced()){pointerCancel();if(travel)settleTravel();else{clearFrame();idleAt=null;epoch++;pose(position);}cancelEffects();}}
 function resize(){
  if(!valid())return;const previous=size,next=dimensions();if(!next)return;
  pointerCancel();const current=travel,destination=current?.to||position;
  const normalized={x:destination.x/(previous?.width||next.width),y:destination.y/(previous?.height||next.height)};
  if(current)settleTravel({notify:false});
  size=next;position=clampPoint({x:normalized.x*next.width,y:normalized.y*next.height});pose(position);
  if(current)deliver(current.onFinish);
 }
 const listen=(target,type,fn,settings)=>{if(!target?.addEventListener)return;target.addEventListener(type,fn,settings);listeners.push(()=>target.removeEventListener?.(type,fn,settings));};
 listen(stage,'pointerdown',pointerDown);listen(stage,'pointermove',pointerMove);listen(stage,'pointerup',pointerUp);listen(stage,'pointercancel',pointerCancel);listen(stage,'pointerleave',pointerCancel);listen(stage,'lostpointercapture',pointerCancel);listen(stage,'click',suppressSyntheticClick,true);listen(stage,'click',groundClick);listen(stage,'keydown',playerKey);
 listen(doc,'pointerup',pointerUp);listen(doc,'pointercancel',pointerCancel);listen(doc,'visibilitychange',visibility);listen(win,'resize',resize);listen(win,'blur',pointerCancel);
 if(media?.addEventListener)listen(media,'change',preference);else if(media?.addListener){media.addListener(preference);listeners.push(()=>media.removeListener?.(preference));}
 pose(position);attr(stage,'data-world-moving','false');idle();animateEffects();
 function dispose(){if(disposed)return;cancel();disposed=true;pendingFinish=null;for(const remove of listeners){try{remove();}catch{}}}
 return {travelTo,moveToPosition,getPosition,setPosition,cancel,dispose,isMoving:()=>!!travel};
}
