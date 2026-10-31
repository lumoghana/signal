/* Production-index DOM and a deliberately narrow CSS cascade regression.
   This does not simulate browser paint, device layout or computed styles. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const dist=path.join(__dirname,'../dist');
let count=0;
const check=(name,run)=>{run();count++;console.log('PASS '+name);};
const destinations=[['home','Home'],['plan','Plan'],['chat','Chats'],['pay','Pay'],['more','You']];
function fixture(){
 const h=createHarness({clock:true}),{L}=h;L.explore();
 Object.assign(L.state,{balance:600,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:250,paid:0},{id:'transport',name:'Transport',amount:100,paid:0}],goals:[{id:'laptop',name:'Laptop',target:3000,allocated:100}],allowance:{amount:0,date:''},chats:[]});
 L.route='home';L.params={};L.history=[];L.render();h.flush();return h;
}
function navigation(h,current){
 const nav=h.document.getElementById('nav');assert(nav);assert(!nav.hidden,'Parent navigation is not hidden');
 const items=[...nav.querySelectorAll('.nav-item')];assert.equal(items.length,5,'All five destinations remain present');
 destinations.forEach(([route,label],index)=>{
  const item=items[index];assert.equal(item.getAttribute('onclick'),`L.openTab('${route}')`);assert.equal(item.hidden,false);assert.equal(item.disabled,false);
  assert(item.querySelector('svg'),route+' has an icon');assert.equal(item.querySelector('span')?.textContent,label,route+' has a visible label node');
  assert.notEqual(item.getAttribute('aria-hidden'),'true');assert.equal(item.getAttribute('aria-current'),route===current?'page':null);
 });
 assert.equal(items.filter(item=>item.getAttribute('aria-current')==='page').length,1,'Exactly one current page');
 assert.equal(items.filter(item=>item.classList.contains('active')).length,1,'Exactly one active item');
 return {nav,items,markup:nav.innerHTML};
}

check('actual index keeps every navigation label and icon for all five destinations',()=>{
 const h=fixture();for(const [route]of destinations){h.L.openTab(route);h.flush();assert.equal(h.L.route,route);navigation(h,route);}assert.deepEqual(h.errors,[]);
});

for(const [parent,task]of [['home','addMoney'],['plan','planPeriod'],['chat','balances'],['pay','campusPay'],['more','profile']])check(parent+' retains its five navigation items and current-page marker during '+task,()=>{
 const h=fixture();h.L.openTab(parent);h.flush();const before=navigation(h,parent);
 h.L.go(task);h.flush();assert(h.L.taskSheet.active);assert.equal(h.L.taskSheet.parentRoute,parent);const during=navigation(h,parent);
 assert.equal(during.nav,before.nav,'Same navigation element');assert.equal(during.markup,before.markup,'Current page and labels do not switch to the task');
 before.items.forEach((item,index)=>assert.equal(during.items[index],item,'Navigation item stays mounted'));
 assert(during.nav.inert,'The retained parent is temporarily inert, not removed');
 h.document.querySelector('.task-sheet-close').click();h.flush();assert.equal(h.L.taskSheet.active,false);assert.equal(h.L.route,parent);navigation(h,parent);assert.deepEqual(h.errors,[]);
});

check('payment stages keep Home selected without hiding any retained menu item',()=>{
 const h=fixture(),{L}=h;const before=navigation(h,'home');
 L.go('campusPay');L.pickMerchant('AK01');h.set('payment-amount',280);h.set('payment-essential','');L.preparePayment();h.flush();assert.equal(L.route,'pause');
 let during=navigation(h,'home');assert.equal(during.markup,before.markup);before.items.forEach((item,index)=>assert.equal(during.items[index],item));
 h.advance(3900);L.resumeFromPause();h.advance(90);h.flush();assert.equal(L.route,'authorize');during=navigation(h,'home');assert.equal(during.markup,before.markup);assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,0);assert.deepEqual(h.errors,[]);
});

const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const styles=require('./helpers/shipped-entry.cjs').styles(require('node:path').resolve(__dirname,'..')).map(file=>'/'+file);
const sheets=styles.map((file,index)=>({file,index,text:fs.readFileSync(path.join(dist,file),'utf8').replace(/\/\*[\s\S]*?\*\//g,'')}));
function rules(){
 const result=[];let order=0;
 for(const sheet of sheets)for(const match of sheet.text.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
  for(const selector of match[1].split(',').map(value=>value.trim()))result.push({selector,body:match[2],file:sheet.file,order:order++});
 }
 return result;
}
function declarations(body){return body.split(';').map(pair=>{const at=pair.indexOf(':');return at<0?null:[pair.slice(0,at).trim(),pair.slice(at+1).trim()];}).filter(Boolean);}
const canonical=selector=>selector.replace(/\[aria-current=["']?page["']?\]/g,'[aria-current=page]');
function exactRule(selector){
 // Identical selectors share specificity. Merge their declarations in the
 // actual linked order, preserving !important, so inherited targets and label
 // visibility are checked alongside Everyday's final colour treatment.
 const found=rules().filter(rule=>canonical(rule.selector)===canonical(selector));assert(found.length,'Loaded styles include '+selector);
 const result={},important={};for(const rule of found)for(const [property,raw]of declarations(rule.body)){
  const strong=/!important\s*$/.test(raw);if(important[property]&&!strong)continue;
  result[property]=raw.replace(/\s*!important\s*$/,'');important[property]=strong;
 }return result;
}
const tokens=Object.assign({},...rules().filter(rule=>rule.selector===':root').map(rule=>Object.fromEntries(declarations(rule.body))));
function resolve(value){for(let i=0;i<10&&/var\(/.test(value);i++)value=value.replace(/var\((--[\w-]+)(?:,[^)]+)?\)/g,(_,name)=>tokens[name]||'');return value;}
function contrast(a,b){
 const luminance=hex=>{const rgb=hex.replace('#','').match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}

check('source cascade makes the visible navigation campus paper despite the earlier black-bar rule',()=>{
 assert.deepEqual(styles.slice(-12),['/everyday-edition.css','/plan-clarity.css','/payment-balance.css','/pause-hero.css','/pause-interaction.css','/category-intelligence.css','/transaction-journey.css','/product-accounts.css','/home-plan-refinement.css','/ui-consistency.css','/qr-payments.css','/biometric-auth.css']);assert(styles.indexOf('/clarity-bold.css')<styles.indexOf('/native-refinement.css'));assert(styles.indexOf('/native-refinement.css')<styles.indexOf('/everyday-edition.css'));
 // Only evaluate declarations for the visible bare nav, where the original bug
 // was #nav:not([hidden]) outranking #nav. All relevant media rules are retained;
 // they do not introduce a competing nav background in this project.
 const candidates=[];
 for(const rule of rules()){
  if(!/(?:^|\s)#nav(?::not\(\[hidden\]\))?$/.test(rule.selector))continue;
  for(const [property,value]of declarations(rule.body))if(['background','background-color'].includes(property)){
   const specificity=[(rule.selector.match(/#[\w-]+/g)||[]).length,(rule.selector.match(/\.[\w-]+|\[[^\]]+\]/g)||[]).length];
   candidates.push({...rule,value,specificity,important:/!important\s*$/.test(value)});
  }
 }
 assert(candidates.some(rule=>rule.file==='/clarity-bold.css'&&rule.selector==='#nav:not([hidden])'&&rule.value==='#111111'),'The competing Clarity black bar is included in the regression');
 candidates.sort((a,b)=>Number(a.important)-Number(b.important)||a.specificity[0]-b.specificity[0]||a.specificity[1]-b.specificity[1]||a.order-b.order);
 const winner=candidates.at(-1);assert.equal(winner.file,'/everyday-edition.css');assert.equal(winner.selector,'#nav:not([hidden])');assert.equal(winner.value,'var(--paper)');assert.equal(resolve(winner.value),'#f8f9f4');
});

check('final navigation colours, labels, targets and focus stay readable in the declared design rules',()=>{
 const bar=exactRule('#nav:not([hidden])'),item=exactRule('#nav:not([hidden]) .nav-item'),active=exactRule('#nav:not([hidden]) .nav-item[aria-current="page"]');
 assert.equal(resolve(bar.background),'#f8f9f4');assert.equal(resolve(item.color),'#53614b');assert.equal(resolve(active.color),'#314b1f');assert(contrast(resolve(item.color),resolve(bar.background))>4.5);assert(contrast(resolve(active.color),resolve(bar.background))>4.5);
 assert.equal(item.display,'flex');assert.equal(item.visibility,'visible');assert.equal(item.opacity,'1');assert(parseFloat(item['min-height'])>=44);assert(parseFloat(item['min-width'])>=44);
 const label=exactRule('#nav:not([hidden]) .nav-item span'),icon=exactRule('#nav:not([hidden]) .nav-item svg');
 for(const child of [label,icon]){assert.equal(child.display,'block');assert.equal(child.color,'inherit');assert.equal(child.opacity,'1');assert.equal(child.visibility,'visible');}
 const marker=exactRule('#nav:not([hidden]) .nav-item[aria-current="page"]::after');assert.equal(marker.display,'none');assert.equal(marker.content,'none');
 const selectedIcon=exactRule('#nav:not([hidden]) .nav-item[aria-current=page] svg');assert.equal(resolve(selectedIcon.background),'#b5e96a');assert(contrast(resolve(active.color),resolve(selectedIcon.background))>4.5);assert(parseFloat(selectedIcon['stroke-width'])>parseFloat(icon['stroke-width']),'Current page also has stronger icon and label weights');assert.equal(active['font-weight'],'700');assert.equal(item['font-weight'],'600');
 const focus=exactRule('#nav:not([hidden]) .nav-item:focus-visible');assert.equal(focus.outline,'3px solid var(--green-ink)');assert(contrast(resolve('var(--green-ink)'),resolve(bar.background))>4.5);
 const earlier=sheets.find(sheet=>sheet.file==='/clarity-bold.css').text,final=sheets.find(sheet=>sheet.file==='/everyday-edition.css').text;assert(final.includes('@media(prefers-reduced-motion:reduce)'));assert(/#nav \.nav-item svg,#nav \.nav-item:active svg\{transition:none!important;transform:none!important\}/.test(earlier));assert(/#nav \.nav-item svg\{transition:none!important;animation:none!important\}/.test(final));
});

console.log(count+' navigation DOM and source-cascade checks passed. Browser paint and physical phone layouts remain unverified.');
