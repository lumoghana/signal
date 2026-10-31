/* Component raster regression for atlas neighbours leaking into SVG letterbox
   space. Loads the shipped script order; no browser, page screenshot or server. */
'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const sharp=require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp'));
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const dist=path.join(__dirname,'../dist');
const sizes=[[400,64],[256,48],[160,160]];
const parse=(h,html)=>{const node=h.document.createElement('div');node.innerHTML=html;return node;};

async function raster(source,width,height,atlas,asset='/assets/lumo-payment-atlas-v19.webp'){
 const end=source.indexOf('>');
 const opening=source.slice(0,end).replace(/\bwidth="[^"]*"/,`width="${width}"`).replace(/\bheight="[^"]*"/,`height="${height}"`);
 const inline=(opening+source.slice(end)).replaceAll('href="'+asset+'"','href="data:image/png;base64,'+atlas+'"');
 return sharp(Buffer.from(inline)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
}
function pixelsOutsideCell(result,box,width,height){
 const [, ,cellWidth,cellHeight]=box,scale=Math.min(width/cellWidth,height/cellHeight);
 const left=(width-cellWidth*scale)/2,top=(height-cellHeight*scale)/2;
 const right=width-left,bottom=height-top;
 let ink=0,spill=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const alpha=result.data[(y*result.info.width+x)*result.info.channels+result.info.channels-1];
  if(alpha>24){ink++;if(x<left-2||x>right+2||y<top-2||y>bottom+2)spill++;}
 }
 return {ink,spill};
}

(async()=>{
 const h=createHarness(),{L}=h;
 const atlas=(await sharp(path.join(dist,L.boldArt.serviceAtlas)).png().toBuffer()).toString('base64');
 let checks=0;
 for(const [scene,box]of Object.entries(L.boldArt.serviceSprites)){
  const svg=parse(h,L.boldArt.draw(scene,'bill',true)).querySelector('svg.service-prop');
  assert(svg,scene+' must emit its foreground SVG');
  assert.equal(svg.querySelectorAll('[id]').length,0,scene+' crop must not depend on renamed fragment IDs');
  assert(!svg.hasAttribute('id'));assert(!/url\(\s*#/.test(svg.outerHTML));
  for(const [width,height]of sizes){
   const result=await raster(svg.outerHTML,width,height,atlas);
   assert.equal(result.info.width,width);assert.equal(result.info.height,height);
   const {ink,spill}=pixelsOutsideCell(result,box,width,height);
   assert(ink>200,scene+' must remain visibly drawn at '+width+'×'+height);
   assert.equal(spill,0,scene+' exposes adjacent atlas art at '+width+'×'+height);
   checks++;
  }
 }
 console.log('PASS '+checks+' raster crops: all eight selected service props remain visible and isolate their atlas cell at wide, narrow and square sizes');

 // Demonstrate that the pixel oracle catches the original failure. The same
 // atlas inside only an outer meet/viewBox viewport must spill into its margins.
 const unbounded=parse(h,L.boldArt.draw('airtime','bill',true)).querySelector('svg.service-prop');
 const image=unbounded.querySelector('image').outerHTML;unbounded.innerHTML=image;
 const control=pixelsOutsideCell(await raster(unbounded.outerHTML,400,64,atlas),L.boldArt.serviceSprites.airtime,400,64);
 assert(control.spill>1000,'The regression must detect adjacent cells in the original unbounded SVG');
 console.log('PASS negative control detects neighbouring atlas content when the cell boundary is removed');

 L.explore();L.openTab('pay');L.setPayTab('send');h.flush();
 const parent=h.document.getElementById('view'),svg=parent.querySelector('svg.campus-foreground'),scene=svg?.closest('.campus-scene');
 assert(svg&&scene,'Pay emits its active Campus transfer illustration');
 assert.equal(scene.getAttribute('data-art-source'),'campus-pilot-v25');
 assert.equal(scene.getAttribute('data-scene'),L.campusArt.sceneFor('pay'));
 const spec=L.campusArt.scenes[scene.getAttribute('data-scene')];assert(spec?.crop,'Pay uses a bounded Campus atlas cell');
 assert.equal(svg.querySelector('image').getAttribute('href'),spec.asset);
 assert.equal(svg.getAttribute('viewBox'),spec.crop.join(' '));
 assert.equal(svg.getAttribute('preserveAspectRatio'),'xMidYMid meet');
 assert.equal(svg.querySelector('.campus-atlas-cell').getAttribute('overflow'),'hidden');
 const activeAtlas=(await sharp(path.join(dist,spec.asset)).png().toBuffer()).toString('base64');
 const before=svg.outerHTML,money=JSON.stringify([L.state.balance,L.state.txs]);
 const beforePixels=await raster(before,400,64,activeAtlas,spec.asset),bounded=pixelsOutsideCell(beforePixels,spec.crop,400,64);
 assert(bounded.ink>200,'The active Campus illustration remains visibly drawn');
 assert.equal(bounded.spill,0,'The active Campus cell excludes its atlas neighbours');
 L.go('campusPay');h.flush();
 assert(L.taskSheet.active);assert.equal(h.document.getElementById('task-parent-view'),parent);
 assert.equal(parent.querySelector('svg.campus-foreground'),svg,'Opening a task keeps the same Campus foreground node');
 assert.equal(svg.outerHTML,before,'HTML field-ID namespacing must not alter the retained crop');
 assert.equal(svg.querySelectorAll('[id]').length,0);
 assert((await raster(svg.outerHTML,400,64,activeAtlas,spec.asset)).data.equals(beforePixels.data),'The retained Campus crop must paint identically while the sheet is open');
 L.closeTask();h.flush();
 assert.equal(L.taskSheet.active,false);assert.equal(L.route,'pay');
 assert.equal(h.document.getElementById('view'),parent);assert.equal(parent.querySelector('svg.campus-foreground'),svg);
 assert.equal(svg.outerHTML,before);assert.equal(JSON.stringify([L.state.balance,L.state.txs]),money);
 assert.deepEqual(h.errors,[]);
 console.log('PASS active Campus Pay SVG isolates its atlas cell, survives sheet open/close unchanged and never changes money');
})().catch(error=>{console.error(error);process.exitCode=1;});
