/* Expressive pass: one recurring Lumo character, three distinct moments.
   Decorative images are separate from financial facts and transaction status. */
(()=>{
'use strict';
const scenes=Object.freeze({
 home:'lumo-home-open-v2.png',
 pause:'lumo-pause-space-v2.png',
 confirmed:'lumo-result-done-v2.png'
});
const illustration=L.illustration,contextual=L.contextualIllustration;
const confirmed=()=>{
 const tx=L.clarityArt?.resultTx?.();
 return !!(tx&&L.clarityArt?.confirmed?.(tx));
};
const figure=(scene,compact=false)=>`<figure class="scene-art scene-editorial clarity-art expressive-art expressive-art-${scene} scene-size-${compact?'decision':'everyday'}${compact?' scene-compact':''}" data-art="expressive-${scene}-v2" data-art-source="lumo-expressive-v2" data-scene="${scene}" aria-hidden="true"><img class="clarity-art-image expressive-art-image" src="/assets/expressive/${scenes[scene]}" width="1536" height="1024" alt="" draggable="false" decoding="async"></figure>`;
L.expressiveArt=Object.freeze({scenes,confirmed});
L.illustration=(kind='home',compact=false)=>{
 // First money and funded Home share the same confident, non-transaction scene.
 if(kind==='home'||kind==='clarity'&&L.route==='home')return figure('home',compact);
 // A neutral gesture supports any calculated cost, without imposing a purchase.
 if(['pause','decision','tradeoff'].includes(kind))return figure('pause',true);
 // Generic success elsewhere keeps the existing illustration family. A payment
 // only celebrates an actual confirmed and delivered transaction.
 if(kind==='paymentResult'||L.route==='paymentResult'&&kind==='success')return confirmed()?figure('confirmed',compact):illustration(kind,compact);
 return illustration(kind,compact);
};
L.contextualIllustration=route=>route==='paymentResult'&&confirmed()?figure('confirmed',false):contextual?.(route);
})();
