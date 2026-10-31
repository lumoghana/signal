/* Presentation cleanup after the native task controller has named its view.
   No drafts, financial state, navigation or consent are changed here. */
(()=>{
'use strict';
if(!window.L||L.productFinish)return;
const normalize=text=>String(text||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase().replace(/[.!?]+$/u,'').trim();
// These views name a user-owned entity, receipt or report. A coincidental
// match with the generic chrome title must never conceal the entity's name.
const entityHeadings=new Set(['goal','budgetCategory','groupMoneyDetail','virtualCard','requestDetail','txDetail','caseDetail']);
let queued=false;
function reserveHomeAmounts(){
 for(const amount of document.querySelectorAll('.screen-home .everyday-primary-money>strong')){
  const card=amount.closest('.everyday-money-card');
  const bucket=card?.classList.contains('has-huge-amount')?'huge':card?.classList.contains('has-wide-amount')?'wide':'ordinary';
  let reserve=amount.querySelector('.product-money-reserve');
  if(!reserve){
   reserve=document.createElement('span');reserve.setAttribute('aria-hidden','true');
   // CSS generates neutral zero glyphs. No real or placeholder amount is put
   // in DOM text/attributes, and the shared formatter still owns visible money.
   reserve.innerHTML='<span class="currency product-reserve-currency"></span><span class="whole product-reserve-whole"></span><span class="cents product-reserve-cents"></span>';
   amount.appendChild(reserve);
  }
  reserve.className='product-money-reserve product-money-reserve-'+bucket;
 }
}
function sync(){
 reserveHomeAmounts();
 const body=document.querySelector('.task-sheet-body');
 const title=document.getElementById('task-sheet-title');
 if(!L.taskSheet?.active||!body||!title)return;
 // These are navigation rows emitted by L.header and its equivalent helpers.
 // Device/status rows also use .topline, so their contents must remain visible.
 for(const row of body.querySelectorAll('.topline')){
  const controls=Array.from(row.children).filter(el=>el.tagName==='BUTTON');
  if(controls.some(el=>el.getAttribute('aria-label')==='Go back')&&controls.some(el=>el.getAttribute('aria-label')==='Get help')){
   row.classList.add('product-legacy-nav');row.hidden=true;
  }
 }
 // Re-check our own marks, so a reused view/title can never keep a stale echo.
 for(const heading of body.querySelectorAll('[data-product-title-echo]')){
  heading.classList.remove('product-title-echo');heading.removeAttribute('data-product-title-echo');
  heading.parentElement?.classList.remove('product-title-only');
 }
 const heading=body.querySelector('.page-heading>h1');
 if(entityHeadings.has(L.route)||!heading||heading.hasAttribute('data-product-keep-heading')||!normalize(title.textContent)||normalize(heading.textContent)!==normalize(title.textContent))return;
 heading.classList.add('product-title-echo');heading.setAttribute('data-product-title-echo','');
 if(heading.parentElement.children.length===1)heading.parentElement.classList.add('product-title-only');
 // Preserve the accessible h1, but start keyboard/screen-reader focus at the
 // visible title when core's renderer initially focused the duplicate h1.
 if(document.activeElement===heading){title.setAttribute('tabindex','-1');title.focus?.({preventScroll:true});}
}
function schedule(){
 if(queued)return;queued=true;
 const next=()=>{queued=false;sync();};
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(next);else setTimeout(next,0);
}
const render=L.render;
L.render=function(...args){const result=render.apply(this,args);sync();schedule();return result;};
L.productFinish={sync};
sync();schedule();
})();
