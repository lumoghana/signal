/* Active-campus-family checks through the shipped index. No browser-fit claims. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const dist=path.join(__dirname,'../dist');
let count=0;const check=(name,run)=>{run();count++;console.log('PASS '+name);};
const hashes={
 'lumo-editorial-atlas-v22.webp':'b41e51b7069c4365d96ecc2418ce4efc7879b90162861271ed76b414f6c4b0d1',
 'lumo-payment-atlas-v19.webp':'9d3b40c21a2caef03b8134306bfb647bcfa280012b40dc2801a1784c1a29abbb',
 'lumo-you-atlas-v22.webp':'7cb248c99f64f5fd544a37c32c5c4baf4286d4ffffd00895e642696d471b8540',
 'lumo-clarity-v22.webp':'53fe477969e7ccfff868a3558d7453be639451543cd62d0fa5e4771646bfc012',
 'lumo-add-money-v22.webp':'27610b91ef6e232d21ea3266e0a67195ebbe8ef8e7a74bb1d35ddcd3d4717a7a',
 'legon-balme-v21.webp':'14d30dc91747f717b35afc6e4dfadea8c74b728368a450ccf27779a566af5f5e',
 'legon-avenue-v21.webp':'a055fdd397145004093470ed3b14df6672d3b769b1e0885d062fe0e851f6ca0f',
 'legon-hill-v21.webp':'917bdca0664b93bc5bb1e0be838119566433273593c327d8e1d0cd4c20eabb2a'
};
function fixture(){const h=createHarness(),L=h.L;L.explore();Object.assign(L.state,{balance:600,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:250,paid:0},{id:'transport',name:'Transport',amount:100,paid:0}],goals:[{id:'laptop',name:'Laptop',target:3000,allocated:100}],allowance:{amount:0,date:''},chats:[]});L.route='home';L.params={};L.history=[];L.render();h.flush();return h;}
const view=h=>h.document.getElementById('view');
function parsed(h,html){const box=h.document.createElement('div');box.innerHTML=html;return box;}
function art(h,route,params={}){h.L.route=route;h.L.params=params;return parsed(h,h.L.contextualIllustration(route));}
function assertCampus(root){
 const scene=root.querySelector('.campus-scene');assert(scene,'An active Campus illustration exists');
 assert.equal(scene.getAttribute('data-art-source'),'campus-pilot-v25');
 assert.equal(scene.getAttribute('aria-hidden'),'true');assert.equal(scene.querySelectorAll('[id]').length,0);
 assert(!/url\(#|\/assets\/(?:clarity\/|clarity-context\/|clarity-tasks\/|clarity-bold\/|expressive\/)/.test(scene.outerHTML));
 for(const image of scene.querySelectorAll('image,img')){const url=image.getAttribute('href')||image.getAttribute('src');assert(url?.startsWith('/assets/'));assert(Object.hasOwn(hashes,path.basename(url)),url+' is a recovered campus master');assert(fs.existsSync(path.join(dist,url)));}
 assert.equal(scene.querySelectorAll('.legon-backdrop').length,1);assert.equal(scene.querySelectorAll('.expressive-figure').length,1);return scene;
}
check('all eight campus masters are exact recovered assets, not approximations',()=>{for(const [name,hash]of Object.entries(hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,'assets',name))).digest('hex'),hash,name);});
check('every existing illustration route uses only the campus family without fragile SVG IDs',()=>{
 const h=fixture(),L=h.L;L.balances();const money=JSON.stringify({balance:L.state.balance,txs:L.state.txs,essentials:L.state.essentials,goals:L.state.goals});
 assert.equal(Object.keys(L.views).length,116);
 for(const name of Object.keys(L.views)){const scene=assertCampus(art(h,name,{id:'missing',kind:'airtime'}));assert(scene.getAttribute('data-scene'));}
 assert.equal(JSON.stringify({balance:L.state.balance,txs:L.state.txs,essentials:L.state.essentials,goals:L.state.goals}),money);assert.deepEqual(h.errors,[]);
});
check('Home switches between the original funded student and unfunded illumination',()=>{
 const h=fixture();assert.equal(assertCampus(view(h)).getAttribute('data-scene'),'home');assert(!view(h).innerHTML.includes('home-clarity-mirror'));
 Object.assign(h.L.state,{balance:0,txs:[]});h.L.render();h.flush();assert.equal(assertCampus(view(h)).getAttribute('data-scene'),'clarity');assert(view(h).querySelector('.campus-foreground').getAttribute('src').endsWith('lumo-clarity-v22.webp'));
});
check('planning, funding and Chat retain the original activity-specific drawings',()=>{
 const h=fixture();for(const [route,scene]of [['plan','plan'],['planBenefit','plan'],['firstEssentials','plan'],['addMoney','funding'],['chat','chat'],['samplePause','decision']])assert.equal(assertCampus(art(h,route)).getAttribute('data-scene'),scene,route);
 assert(art(h,'chat').querySelector('image').getAttribute('href').endsWith('lumo-editorial-atlas-v22.webp'));
});
check('verification art never presents the approved identity scene prematurely',()=>{
 const h=fixture();for(const route of ['identity','livecheck','identityResult'])assert.equal(assertCampus(art(h,route)).getAttribute('data-scene'),'phone');h.L.state.setup.identityStatus='approved';assert.equal(assertCampus(art(h,'identityResult')).getAttribute('data-scene'),'identity');
});
check('selected food, printing and generic campus tasks do not share a meal illustration',()=>{
 const h=fixture(),L=h.L;assert.equal(assertCampus(art(h,'campusPay')).getAttribute('data-scene'),'pay');
 for(const [draft,scene]of [[{method:'campus',category:'Food'},'merchant'],[{method:'campus',category:'Study',merchantId:'CP02'},'activity'],[{method:'campus',category:'Transport'},'pay'],[{method:'bank'},'bank']]){L.state.paymentDraft={id:'test',amount:20,fee:0,...draft};assert.equal(assertCampus(art(h,'send')).getAttribute('data-scene'),scene);}
});
check('six top-up services preserve their distinct complete campus props',()=>{
 const h=fixture();for(const kind of ['airtime','data','electricity','water','tv','internet']){h.L.state.paymentDraft={id:'service',method:'bill',bill:kind,amount:20,fee:0};const scene=assertCampus(art(h,'bill',{kind}));assert.equal(scene.getAttribute('data-scene'),kind);assert.equal(scene.querySelector('.campus-atlas-cell').getAttribute('viewBox'),h.L.campusArt.serviceSprites[kind].join(' '));}
});
check('essentials shortfall is neutral while a real laptop-only goal trade-off can use goal art',()=>{
 const h=fixture(),L=h.L;L.state.paymentDraft={id:'projection',method:'campus',category:'Food',amount:280,fee:0};assert.equal(assertCampus(art(h,'pause')).getAttribute('data-scene'),'decision');assert(art(h,'pause').querySelector('.campus-neutral-decision'));
 L.state.paymentDraft.amount=200;assert.equal(assertCampus(art(h,'pause')).getAttribute('data-scene'),'goal');L.state.goals[0].name='Bicycle';assert.equal(assertCampus(art(h,'pause')).getAttribute('data-scene'),'decision');assert.equal(L.state.balance,600);
});
check('unconfirmed payment and funding states never select celebration',()=>{
 const h=fixture(),L=h.L;for(const [status,delivery,scene]of [['pending',undefined,'decision'],['failed',undefined,'help'],['reversed',undefined,'decision'],['success','pending','decision'],['success','failed','decision'],['success','delivered','success']]){L.state.txs=[{id:'result',type:'out',status,delivery,amount:20,fee:0}];assert.equal(assertCampus(art(h,'paymentResult',{id:'result'})).getAttribute('data-scene'),scene);}
 L.state.fundingDraft={txId:'credit'};L.state.txs=[{id:'credit',type:'in',status:'pending',amount:50}];assert.equal(assertCampus(art(h,'momoAdd')).getAttribute('data-scene'),'decision');L.state.txs[0].status='success';assert.equal(assertCampus(art(h,'momoAdd')).getAttribute('data-scene'),'success');
});
check('opening a sheet retains the same Home illustration with no broken fragment references',()=>{
 const h=fixture(),L=h.L,parent=view(h),scene=assertCampus(parent),before=scene.outerHTML;
 L.openFunding('home');h.flush();assert.equal(h.document.getElementById('task-parent-view'),parent);assert.equal(parent.querySelector('.campus-scene'),scene);assert.equal(scene.outerHTML,before);
 h.document.querySelector('.task-sheet-close').click();h.flush();assert.equal(view(h),parent);assert.equal(view(h).querySelector('.campus-scene'),scene);assert.equal(scene.outerHTML,before);assert.equal(L.state.balance,600);assert.deepEqual(h.errors,[]);
});
check('native confirmation keeps its selected goal without exposing fields or authorising a transaction',()=>{
 const h=fixture(),L=h.L;L.go('goal',{id:'laptop'});h.flush();L.archiveGoal('laptop');h.flush();assert.equal(L.route,'actionConfirm');assert.equal(assertCampus(view(h)).getAttribute('data-scene'),'goal');assert.equal(view(h).querySelectorAll('input').length,0);L.cancelNativeDecision();h.flush();assert.equal(L.route,'goal');assert.equal(L.state.goals.length,1);assert.equal(L.state.txs.length,0);
});
console.log(count+' active Campus illustration checks passed. Physical rendering and phone fit remain unverified.');
