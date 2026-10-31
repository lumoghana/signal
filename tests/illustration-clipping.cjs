/* Raster regression for neighbouring atlas images appearing in wide SVG viewports. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const sharp=require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp'));
const root=path.join(__dirname,'../dist'),context={L:{header:()=>''}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'illustrations.js'),'utf8'),context);
const compact=fs.readFileSync(path.join(root,'compact.js'),'utf8');
vm.runInContext(compact.slice(0,compact.indexOf('const menuIcons='))+'})();',context);
const L=context.L;
const examples=[
 ...['welcome','identity','pay','pause','tradeoff','goals','plan','chat','merchant','success','clarity','funding'].map(key=>({key:'editorial '+key,html:L.illustration(key)})),
 ...['lumo','momo','bank','campus','request','airtime','data','electricity','water','tv','internet','activity'].map(key=>({key:'payment '+key,html:L.paymentArt(key)})),
 ...['profile','account','security','privacy','notifications','help','testing','feedback','devices'].map(key=>({key:'account '+key,html:L.accountArt(key)}))
];
(async()=>{
 let checks=0;
 const assets=new Map();
 for(const example of examples)for(const match of example.html.matchAll(/href="(\/assets\/[^\"]+)"/g))if(!assets.has(match[1]))assets.set(match[1],(await sharp(path.join(root,match[1].slice(1))).png().toBuffer()).toString('base64'));
 for(const example of examples){
  assert.equal((example.html.match(/class="legon-backdrop"/g)||[]).length,1,example.key+' must have one campus underlay');
  assert.equal((example.html.match(/data-art=/g)||[]).length,1,example.key+' must remain one illustration');
  assert(/\bscene-legon\b/.test(example.html),example.key+' must preserve composed-art styling');
  const campus=example.html.match(/data-campus="(balme|avenue|hill)"/)?.[1];
  assert(campus,example.key+' must identify its campus scene');
  assert(example.html.includes(`/assets/legon-${campus}-v21.webp`),example.key+' must match its campus asset');
  assert(example.html.indexOf('class="legon-backdrop"')<example.html.indexOf('href="/assets/lumo-'),example.key+' must keep campus below the original foreground');
  const backdrop=example.html.match(/<g class="legon-backdrop"[^>]*>[\s\S]*?<\/g>/)?.[0],neutral=backdrop?.match(/filter="url\(#([^\)]+)\)"/)?.[1];
  assert(neutral,example.key+' must neutralise campus colours');
  assert(example.html.includes(`<filter id="${neutral}" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/></filter>`),example.key+' must use a neutral greyscale matrix');
  assert.equal((example.html.match(/\bfilter="/g)||[]).length,1,example.key+' must apply the matrix only to the background group');
  assert(!backdrop.includes('/assets/lumo-'),example.key+' must preserve original foreground colours');
  assert(!/<(?:mask|radialGradient)\b/.test(example.html),example.key+' must keep naturally open line-art edges');
  assert(/href="\/assets\/legon-[^"]+"[^>]+preserveAspectRatio="xMidYMax meet"/.test(example.html),example.key+' must contain complete campus line art without a photo crop');
  if(/data-art="editorial-/.test(example.html)){
   const rect=example.html.match(/<clipPath id="lumo-art-[^"]+"><rect x="([^"]+)" y="[^"]+" width="([^"]+)"/);
   assert(rect,example.key+' must keep an explicit foreground cell clip');
   assert(Number(rect[1])>=0&&Number(rect[1])+Number(rect[2])<=512,example.key+' must never expose a neighbouring atlas cell');
   assert(example.html.includes('/assets/lumo-editorial-atlas-v22.webp'),example.key+' must use the expressive editorial foreground');
  }else if(example.key.startsWith('account '))assert(example.html.includes('/assets/lumo-you-atlas-v22.webp'),example.key+' must use the expressive account foreground');
  else if(example.key==='editorial clarity')assert(example.html.includes('/assets/lumo-clarity-v22.webp'),example.key+' must use the expressive clarity foreground');
  else if(example.key==='editorial funding')assert(example.html.includes('/assets/lumo-add-money-v22.webp'),example.key+' must use the expressive funding foreground');
  const source=example.html.match(/<svg[\s\S]*<\/svg>/)[0];
  const [,rawBox]=source.match(/viewBox="([^"]+)"/),[x,y,boxWidth,boxHeight]=rawBox.split(/\s+/).map(Number);
  assert(boxWidth>0&&boxHeight>0);
  const inline=source.replace(/href="(\/assets\/[^\"]+)"/g,(_,asset)=>'href="data:image/png;base64,'+assets.get(asset)+'"');
  for(const [width,height] of [[320,200],[400,200],[460,168]]){
   const svg=inline.replace('<svg ',`<svg width="${width}" height="${height}" `);
   const {data,info}=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   const scale=Math.min(width/boxWidth,height/boxHeight),left=(width-boxWidth*scale)/2,top=(height-boxHeight*scale)/2,right=width-left,bottom=height-top;
   let spill=0,ink=0;
   for(let row=0;row<info.height;row++)for(let column=0;column<info.width;column++){
    const alpha=data[(row*info.width+column)*info.channels+info.channels-1];
    if(alpha>24){ink++;if(column<left-2||column>right+2||row<top-2||row>bottom+2)spill++;}
   }
   assert(ink>200,example.key+' must remain visible');
   assert.equal(spill,0,`${example.key} leaks neighbouring art at ${width}×${height}`);
   checks++;
  }
 }
 console.log(`PASS ${checks} illustration clipping checks: 33 scenes with one reusable campus underlay each at three wide phone viewports.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
