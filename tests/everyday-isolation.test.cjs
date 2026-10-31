/* Independent-project and demo-storage regression checks. No browser layout claims. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const read=file=>fs.readFileSync(path.join(dist,file),'utf8');
const log=message=>console.log('PASS '+message);

const hosting=JSON.parse(fs.readFileSync(path.join(root,'.openai/hosting.json'),'utf8'));
assert.equal(hosting.project_id,'appgprj_6ad67bef448c8191a629d9168df0c804');
assert(!['appgprj_6ad218a40dc88191b94e086da13e81e1','appgprj_6ad4c822fe3881919757091e91e2ce9f','appgprj_6ac13e3a0dac81919c00c7f1252e6617'].includes(hosting.project_id));
assert.equal(hosting.static.directory,'dist');
const manifest=JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.name,'Lumo · Everyday Edition');
assert.equal(manifest.short_name,'Lumo Everyday');
log('hosting manifest points to the independent Everyday project, distinct from both original project IDs');

const ownKey='lumo-minna-edition-v1';
const legacyRecord=JSON.stringify({version:1,onboarded:true,balance:999999,profile:{name:'Do not import this account'},txs:[{id:'legacy-record'}]});
const seeded=new Map([
  ['lumo-campus-v1',legacyRecord],
  ['lumo-clarity-edition-v1',legacyRecord],
  ['lumo-v1',legacyRecord],
  ['lumo-illustration-first-v1',legacyRecord]
]);
const before=new Map(seeded),reads=[],writes=[];
function boot(store=seeded){
  const context={
    console,URLSearchParams,Date,Math,
    document:{getElementById:()=>null},
    location:{search:''},
    localStorage:{
      getItem:key=>{reads.push(key);return store.get(key)||null;},
      setItem:(key,value)=>{writes.push(key);store.set(key,value);}
    },
    addEventListener(){},setTimeout:()=>0,clearTimeout(){},
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(read('core.js'),context,{filename:'core.js'});
  return context.L;
}
const L=boot();
assert.equal(L.state.onboarded,false);
assert.equal(L.state.balance,0);
assert.equal(L.state.profile.name,'Kwame Mensah');
assert.equal(L.state.txs.length,0);
assert.deepEqual(reads,[ownKey]);
assert.deepEqual(writes,[]);
L.state.profile.name='Everyday-only sample';
L.save();
assert.equal(JSON.parse(seeded.get(ownKey)).profile.name,'Everyday-only sample');
for(const [key,value]of before)assert.equal(seeded.get(key),value);
const resumed=boot();
assert.equal(resumed.state.profile.name,'Everyday-only sample');
assert.equal(resumed.state.balance,0);
log('seeded original/legacy demo records are never read, imported or overwritten; only Everyday progress resumes');

// The actual bundled explore/reset methods keep their built-in sample data.
// Avoid DOM work here while retaining their real save/state behaviour.
L.render=()=>L.save();
L.explore();
assert.equal(L.state.onboarded,true);
assert.equal(L.state.balance,920);
assert.equal(L.state.profile.name,'Kwame Mensah');
assert.equal(L.state.txs.length,3);
assert(!L.state.txs.some(tx=>tx.id==='legacy-record'));
for(const [key,value]of before)assert.equal(seeded.get(key),value);
L.reset();
assert.equal(L.state.onboarded,false);
assert.equal(L.state.balance,0);
assert.equal(L.state.txs.length,0);
for(const [key,value]of before)assert.equal(seeded.get(key),value);
assert(reads.every(key=>key===ownKey));
assert(writes.length>0&&writes.every(key=>key===ownKey));
log('sample exploration and reset use only Everyday storage and preserve every seeded original record');

const index=read('index.html');
const scripts=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
assert(scripts.length>0);
assert.equal(scripts[0],'core.js');
assert.equal(scripts.at(-1),'ambassador.js');
for(const file of scripts)assert(fs.existsSync(path.join(dist,file)),file);
for(const [beforeFile,afterFile]of [
  ['pause-engine.js','plan-impact.js'],['plan-impact.js','mobile-network.js'],['mobile-network.js','payments.js'],
  ['focus.js','chat-coach.js'],['chat-coach.js','decision-system.js'],
  ['decision-system.js','clarity-art.js'],['clarity-art.js','clarity-pause.js'],
  ['clarity-pause.js','expressive-art.js'],['expressive-art.js','bold-system.js'],['bold-system.js','campus-art.js'],['campus-art.js','native-decisions.js'],['native-decisions.js','task-sheet.js'],['task-sheet.js','ambassador.js']
])assert(scripts.indexOf(beforeFile)>=0&&scripts.indexOf(beforeFile)<scripts.indexOf(afterFile),beforeFile+' before '+afterFile);
const sources=scripts.map(read);
for(let i=0;i<sources.length;i++)if(scripts[i]!=='core.js')assert(!/\b(?:localStorage|sessionStorage|indexedDB)\b/.test(sources[i]),scripts[i]+' introduced a separate persistence path');
assert(!/localStorage\.(?:clear|removeItem|key)\s*\(|Object\.keys\s*\(\s*localStorage/.test(sources[0]));
log('deployed modules preserve financial/presentation/entry order and have one isolated persistence path');

for(const [colour,digest]of [
  ['Black','e6a2e95d213dad264d1f01b277c6f8924004a0167a2bb01056b56b8398e80712'],
  ['White','82b5c0a63df5fdd89b0b28b5e437f81d76502dcb260ef5314172d9b2f016c739']
]){
  const asset='brand/Lumo-Wordmark-'+colour+'.svg';
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,asset))).digest('hex'),digest);
  assert(index.includes('/'+asset));
}
const allMarkup=[index,...sources].join('\n');
assert(!/>lum<span>o<\/span>|>lumo<\/|>lum<span/i.test(allMarkup),'retired live-text wordmark returned');
const wrappers=[...allMarkup.matchAll(/<(?:a|span|div|strong)\b[^>]*class="[^"]*\bwordmark(?:-small)?\b[^"]*"[^>]*>\s*([^<]*)(<[^>]+>)?/g)];
assert(wrappers.length>=4,'Expected original artwork in shared headers and entry');
for(const wrapper of wrappers){
  assert.equal(wrapper[1],'','Wordmark must not be recreated as text');
  assert(wrapper[2]?.startsWith('<img '),'Wordmark wrapper must contain actual SVG image');
  assert(/\/brand\/Lumo-Wordmark-(?:Black|White)\.svg/.test(wrapper[2]));
}
const sheets=require('./helpers/shipped-entry.cjs').styles(require('node:path').resolve(__dirname,'..'));
assert(sheets.indexOf('clarity-type.css')>sheets.indexOf('type-system.css'));
assert(sheets.indexOf('clarity-edition.css')>sheets.indexOf('clarity-type.css'));
const preloads=[...index.matchAll(/<link rel="preload"[^>]*href="([^"]+)"/g)].map(m=>m[1]);
assert.deepEqual(preloads,['/assets/fonts/PlusJakartaSans-v2.071.woff']);
assert.deepEqual(sheets.slice(-7),['everyday-edition.css','plan-clarity.css','payment-balance.css','pause-hero.css','pause-interaction.css','category-intelligence.css','transaction-journey.css']);
assert(fs.statSync(path.join(dist,preloads[0])).size>1000);
const theme=read('everyday-edition.css');
assert(theme.includes("font-family:'Lumo Jakarta'"));
assert(/font-weight:400 700/.test(theme));
const edition=read('clarity-edition.css');
assert(!/--font-ui\s*:/.test(edition),'Composition must inherit original Lumo Sans');
assert([...edition.matchAll(/font-weight\s*:\s*(\d+)/g)].every(m=>[400,500,600,700].includes(Number(m[1]))));
log('original Black/White wordmarks, actual campus font preload and final Everyday theme are integrated');
