/* Deterministic ordered source bundler. It never edits index.html or removes
   original modules. Capture the reviewed entry before replacing its tags. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const GENERATED=/^(?:lumo-runtime\.[a-f0-9]{12}\.js|lumo-ui\.[a-f0-9]{12}\.css|platform-assets\.json|platform-precache\.js)$/;
function localPath(url){
 if(typeof url!=='string'||!url.startsWith('/')||url.startsWith('//'))throw Error('Only same-origin absolute asset URLs can be bundled');
 const p=decodeURIComponent(url.split(/[?#]/)[0]).slice(1);
 if(!p||p.split('/').some(part=>!part||part==='.'||part==='..')||p.includes('\\'))throw Error('Unsafe asset path: '+url);
 return p;
}
function captureEntry(html){
 const scripts=[...html.matchAll(/<script\b[^>]*\bsrc=(['"])(.*?)\1[^>]*>/gi)].map(match=>match[2]);
 const styles=[...html.matchAll(/<link\b[^>]*>/gi)].filter(match=>/\brel=(['"])stylesheet\1/i.test(match[0])).map(match=>match[0].match(/\bhref=(['"])(.*?)\1/i)?.[2]);
 if(!scripts.length||!styles.length)throw Error('The canonical source entry needs scripts and styles');
 for(const [kind,list]of [['script',scripts],['style',styles]]){
  if(new Set(list.map(localPath)).size!==list.length)throw Error('Duplicate '+kind+' source');
  if(list.some(url=>GENERATED.test(localPath(url))))throw Error('Capture the original source tags, not generated bundle tags');
 }
 return {schemaVersion:1,scripts,styles};
}
function validateEntry(entry){
 if(entry?.schemaVersion!==1||!Array.isArray(entry.scripts)||!Array.isArray(entry.styles)||!entry.scripts.length||!entry.styles.length)throw Error('Invalid config/platform-entry.json');
 for(const list of [entry.scripts,entry.styles])if(new Set(list.map(localPath)).size!==list.length)throw Error('Duplicate canonical source');
 return entry;
}
function cssUrls(source,file){
 return source.replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g,(whole,quote,url)=>{
  if(/^(?:[a-z]+:|\/|#)/i.test(url))return whole;
  const resolved=new URL(url,'https://lumo.invalid/'+file);
  return 'url('+quote+resolved.pathname+resolved.search+resolved.hash+quote+')';
 });
}
function bundle(root,urls,kind){
 let output='/* Lumo ordered '+kind+' bundle. Generated from reviewed original modules. */\n',line=2;
 const sources=[];
 for(const url of urls){
  const file=localPath(url),bytes=fs.readFileSync(path.join(root,'dist',file)),hash=sha(bytes);
  let source=bytes.toString('utf8').replace(/^\uFEFF/,'');
  if(kind==='css'){
   if(/@import\s/i.test(source))throw Error('Inline or remove CSS @import before bundling: '+file);
   source=cssUrls(source.replace(/@charset\s+(['"]).*?\1\s*;/gi,''),file);
  }
  const prefix=(kind==='js'?';\n':'')+'/* Source: '+file+' | sha256:'+hash+' */\n';
  output+=prefix;line+=prefix.split('\n').length-1;
  const startLine=line;output+=source+'\n';line+=source.split('\n').length;
  sources.push({url,path:file,sha256:hash,sizeBytes:bytes.length,startLine,endLine:line-1});
 }
 if(kind==='js')new vm.Script(output,{filename:'lumo-runtime.js'});
 const bytes=Buffer.from(output),hash=sha(bytes),file=(kind==='js'?'lumo-runtime.':'lumo-ui.')+hash.slice(0,12)+'.'+kind;
 return {path:file,sha256:hash,sizeBytes:bytes.length,sources,bytes};
}
function allFiles(root){
 const list=[];
 function walk(dir,prefix=''){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const rel=prefix+item.name;if(item.name.startsWith('__')||item.name.startsWith('.'))continue;if(item.isDirectory())walk(path.join(dir,item.name),rel+'/');else if(!GENERATED.test(rel))list.push(rel);}}
 walk(path.join(root,'dist'));return list.sort();
}
function namespace(root){
 try{const cfg=JSON.parse(fs.readFileSync(path.join(root,'config/editions.json'),'utf8'));const key=cfg.editions?.[cfg.currentEdition]?.storageKey;if(/^[a-z0-9_-]+$/i.test(key||''))return key;}catch{}
 try{const id=JSON.parse(fs.readFileSync(path.join(root,'.openai/hosting.json'),'utf8')).project_id;if(/^[a-z0-9_-]+$/i.test(id||''))return id;}catch{}
 return 'lumo-preview';
}
function buildPlatformAssets({root=path.resolve(__dirname,'..'),entry,capture=false,check=false}={}){
 const entryFile=path.join(root,'config/platform-entry.json');
 if(capture){entry=captureEntry(fs.readFileSync(path.join(root,'dist/index.html'),'utf8'));fs.mkdirSync(path.dirname(entryFile),{recursive:true});fs.writeFileSync(entryFile,JSON.stringify(entry,null,2)+'\n');}
 entry=validateEntry(entry||JSON.parse(fs.readFileSync(entryFile,'utf8')));
 const js=bundle(root,entry.scripts,'js'),css=bundle(root,entry.styles,'css');
 const publicSources=allFiles(root).map(file=>{const bytes=fs.readFileSync(path.join(root,'dist',file));return {path:file,sha256:sha(bytes),sizeBytes:bytes.length};});
 const byPath=new Map(publicSources.map(item=>[item.path,item]));
 const wanted=new Set(['index.html','manifest.webmanifest',js.path,css.path,
  'fonts/Manrope-Variable.woff2','fonts/LumoSans-Regular.woff2',
  'brand/Lumo-Wordmark-Black.svg','brand/Lumo-Wordmark-White.svg','brand/lumo-avatar-icon.svg',
  'brand/lumo-avatar-icon-180.png','brand/lumo-avatar-icon-192.png','brand/lumo-avatar-icon-512.png',
  'assets/signal/signal-wordmark.webp','assets/legon-balme-v21.webp']);
 // Font fallbacks and four current Home scenes make the installed shell useful
 // offline without caching the complete legacy art archive.
 for(const file of byPath.keys())if(/^fonts\/[^/]+\.woff2$/.test(file)||/^assets\/ask-lumo-campus-immersive\/[^/]+\.webp$/.test(file))wanted.add(file);
 // Include fonts actually referenced by each edition, including Hibiscus TTF.
 // Do not broaden this into caching its unused illustration/archive assets.
 const fontReferences=[...css.bytes.toString('utf8').matchAll(/url\(\s*['"]?(\/[^)'"\s]+\.(?:woff2?|ttf)(?:\?[^)'"\s]*)?)/gi)].map(match=>match[1]);
 for(const tag of fs.readFileSync(path.join(root,'dist/index.html'),'utf8').matchAll(/<link\b[^>]*>/gi))if(/\bas=['"]font['"]/i.test(tag[0])){const url=tag[0].match(/\bhref=['"]([^'"]+)['"]/i)?.[1];if(url?.startsWith('/'))fontReferences.push(url);}
 for(const url of fontReferences){const file=localPath(url);if(byPath.has(file))wanted.add(file);}
 const bundleMeta=[js,css].map(({bytes,...metadata})=>metadata);
 const precache=[...wanted].sort().map(file=>{const source=[js,css].find(item=>item.path===file)||byPath.get(file);return source?{url:'/'+file,sha256:source.sha256,sizeBytes:source.sizeBytes}:null;}).filter(Boolean);
 if(!precache.some(item=>item.url==='/index.html')||!precache.some(item=>item.url==='/'+js.path)||!precache.some(item=>item.url==='/'+css.path))throw Error('Required shell assets are missing');
 const workerHash=byPath.get('sw.js')?.sha256||'';
 const version=sha(JSON.stringify({precache,workerHash})).slice(0,20);
 const workerConfig={schemaVersion:1,namespace:namespace(root),version,assets:precache};
 const registry={schemaVersion:1,generatedBy:'scripts/build-platform-assets.cjs',entry,bundles:{script:bundleMeta[0],stylesheet:bundleMeta[1]},sourceAssets:publicSources,shell:{namespace:workerConfig.namespace,version,precacheBytes:precache.reduce((n,item)=>n+item.sizeBytes,0),assetCount:precache.length}};
 const outputs=new Map([[js.path,js.bytes],[css.path,css.bytes],['platform-assets.json',Buffer.from(JSON.stringify(registry,null,2)+'\n')],['platform-precache.js',Buffer.from('/* Public static shell manifest. Generated; no customer records. */\nself.LUMO_PRECACHE='+JSON.stringify(workerConfig)+';\n')]]);
 for(const [file,bytes] of outputs){
  const target=path.join(root,'dist',file);
  if(check){if(!fs.existsSync(target)||!fs.readFileSync(target).equals(bytes))throw Error('Platform artifact is stale: '+file);}
  else fs.writeFileSync(target,bytes);
 }
 if(!check)for(const file of fs.readdirSync(path.join(root,'dist')))if(GENERATED.test(file)&&!outputs.has(file))fs.rmSync(path.join(root,'dist',file));
 return {entryFile,script:'/'+js.path,stylesheet:'/'+css.path,scriptSha256:js.sha256,stylesheetSha256:css.sha256,scriptCount:entry.scripts.length,stylesheetCount:entry.styles.length,precacheBytes:registry.shell.precacheBytes,precacheAssets:precache.length,version,checked:check};
}
module.exports={captureEntry,validateEntry,bundle,buildPlatformAssets,localPath};
if(require.main===module){try{const result=buildPlatformAssets({capture:process.argv.includes('--capture-entry'),check:process.argv.includes('--check')});console.log(JSON.stringify(result,null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
