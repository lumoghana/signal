/* Semantic and raster checks for the shared illustration family. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const sharp=require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp'));
const root=path.join(__dirname,'../dist'),context={L:{header:()=>'',state:{txs:[]},params:{}}};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'illustrations.js'),'utf8'),context);
const L=context.L;
const neutral=L.illustration('pause'),tradeoff=L.illustration('tradeoff');
assert.match(neutral,/data-art="decision-neutral"/);
assert.match(neutral,/scene-size-decision/);
assert.match(tradeoff,/scene-tradeoff/);
assert.notEqual(neutral,tradeoff,'The generic Pause must not assume a footwear/laptop purchase.');
assert.doesNotMatch(neutral,/<text\b/,'Financial copy must remain outside images.');
assert.match(L.illustration('welcome'),/scene-size-intro/);
assert.match(L.illustration('chat'),/scene-size-everyday/);
assert.match(L.illustration('plan',true),/scene-size-decision/);
const result=(status,delivery)=>{
 L.state.txs=[{id:'test',status,delivery}];L.params={id:'test'};
 return L.illustration('paymentResult');
};
assert.match(result('pending'),/data-art="decision-neutral"/);
assert.match(result('success','pending'),/data-art="decision-neutral"/);
assert.doesNotMatch(result('failed'),/scene-success/);
assert.match(result('success','delivered'),/scene-success/);
const css=fs.readFileSync(path.join(root,'illustration-system.css'),'utf8');
assert.match(css,/\.scene-size-decision \.legon-backdrop\{display:none\}/);
(async()=>{
 const png=(await sharp(path.join(root,'assets/lumo-editorial-atlas-v22.webp')).png().toBuffer()).toString('base64');
 const raster=async html=>{
  let svg=html.match(/<svg[\s\S]*<\/svg>/)[0];
  // This is the CSS-hidden compact background, not an altered foreground asset.
  svg=svg.replace(/<g class="legon-backdrop"[^>]*>[\s\S]*?<\/g>/,'');
  svg=svg.replace(/href="\/assets\/lumo-editorial-atlas-v22.webp"/g,`href="data:image/png;base64,${png}"`);
  return sharp(Buffer.from(svg.replace('<svg ','<svg width="512" height="342" '))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 };
 const [decision,original]=await Promise.all([raster(neutral),raster(tradeoff)]);
 const ink=(r,[left,top,right,bottom])=>{
  let count=0;for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(r.data[(y*r.info.width+x)*r.info.channels+3]>32)count++;
  return count;
 };
 assert.equal(ink(decision,[280,0,500,140]),0,'No thought objects or fragments remain above the knee.');
 assert(ink(original,[280,0,500,140])>2000,'The explicit footwear/laptop illustration remains available.');
 assert(ink(decision,[225,120,265,190])>700,'The complete upright phone and holding hand remain.');
 assert(ink(decision,[180,80,235,170])>1200,'The thoughtful chin gesture remains.');
 assert(ink(decision,[270,150,360,230])>1800,'The bent knee is not clipped by the neutral silhouette.');
 console.log('PASS illustration semantics, result-status selection, compact sizes and complete neutral student silhouette.');
})().catch(error=>{console.error(error);process.exitCode=1;});
