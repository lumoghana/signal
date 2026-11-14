import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeSharedQr, parseSharedQr, renderQr, mountScanner, decodeQrImage} from '../dist/qr.mjs';
import qrcode from '../dist/vendor/qrcode.js';

const SHOP = '8eb37419-aa87-4544-b293-f4ec3555e19b';
const REQUEST = 'ddc44a38-bf06-468a-a253-5655be728e4d';
const rawJson = json => 'lumo:shared:v1:' + btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('person, static shop and fixed request QR identities round trip without amounts', () => {
  for (const value of [{kind:'person',handle:'william_1'}, {kind:'merchant',shopId:SHOP}, {kind:'merchant',shopId:SHOP,requestId:REQUEST}]) {
    const encoded = encodeSharedQr(value);
    assert.deepEqual(parseSharedQr(encoded), value);
    assert.equal(Object.hasOwn(parseSharedQr(encoded), 'amount'), false);
    assert.equal(Object.isFrozen(parseSharedQr(encoded)), true);
  }
});

test('fixed request presence never downgrades null, empty or malformed requests to a shop QR', () => {
  for (const requestId of [null, '', 1, false, [], 'request-1', SHOP + '/another']) {
    assert.throws(() => encodeSharedQr({kind:'merchant',shopId:SHOP,requestId}));
    assert.throws(() => parseSharedQr(rawJson(JSON.stringify({kind:'merchant',shopId:SHOP,requestId}))));
  }
});

test('duplicate JSON keys and unknown fields fail closed', () => {
  for (const json of [
    '{"kind":"person","kind":"merchant","handle":"william"}',
    '{"kind":"person","handle":"william","handle":"another"}',
    `{"kind":"merchant","shopId":"${SHOP}","requestId":"${REQUEST}","requestId":"${SHOP}"}`,
    '{"kind":"person","handle":"william","amount":"500"}',
    `{"kind":"merchant","shopId":"${SHOP}","amount":"500"}`,
    '{"kind":"person","handle":"william","__proto__":"bad"}',
  ]) assert.throws(() => parseSharedQr(rawJson(json)));
});

test('strict protocol rejects arbitrary URLs, legacy sample codes and encoded payload ambiguity', () => {
  const good = encodeSharedQr({kind:'person',handle:'william'});
  for (const value of [null, {}, '', 'https://example.test/?pay=shop', 'lumo:merchant:GOBE', good+'=', good+'?', good+'\n', 'LUMO:shared:v1:'+good.split(':').at(-1), 'lumo:shared:v1:a', 'lumo:shared:v1:'+ '_'.repeat(2048)]) {
    assert.throws(() => parseSharedQr(value));
  }
});

test('flat JSON decoder accepts escaped property strings while rejecting nested and non-string values', () => {
  assert.deepEqual(parseSharedQr(rawJson('{ "kind" : "person", "h\\u0061ndle" : "william" }')), {kind:'person',handle:'william'});
  for (const json of ['[]','{}','null','{"kind":"person","handle":{"handle":"william"}}','{"kind":"person","handle":123}','{"kind":"person","handle":"william",}','{"kind":"person","handle":"william"} false']) {
    assert.throws(() => parseSharedQr(rawJson(json)));
  }
});

test('identities accept only backend-compatible handles and UUIDs', () => {
  for (const handle of ['WiLLiam','w','@william','william@gmail.com','william-name','william.name','1william','william\n']) assert.throws(() => encodeSharedQr({kind:'person',handle}));
  for (const shopId of ['',123,'shop-1','javascript:alert(1)',SHOP+' ']) assert.throws(() => encodeSharedQr({kind:'merchant',shopId}));
  assert.deepEqual(parseSharedQr(encodeSharedQr({kind:'merchant',shopId:SHOP.toUpperCase()})), {kind:'merchant',shopId:SHOP});
});

test('QR SVG generation uses a validated identity and contains a quiet white border', () => {
  const svg = renderQr(encodeSharedQr({kind:'merchant',shopId:SHOP,requestId:REQUEST}));
  assert.match(svg, /^<svg /); assert.match(svg, /viewBox=/); assert.match(svg, /fill="white"/); assert.match(svg, /Shared Lumo payment QR/);
  assert.equal(svg.includes('<script'), false);
  assert.throws(() => renderQr('<svg onload=alert(1)>'));
});

function raster(raw) {
  const qr=qrcode(0,'M');qr.addData(raw,'Byte');qr.make();
  const cell=6,border=4,count=qr.getModuleCount(),width=(count+border*2)*cell,data=new Uint8ClampedArray(width*width*4);
  data.fill(255);
  for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(qr.isDark(row,col))for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){
    const index=(((row+border)*cell+y)*width+(col+border)*cell+x)*4;data[index]=data[index+1]=data[index+2]=0;
  }
  return {width,height:width,data};
}

test('local QR image decoder recovers the fixed-request payload and releases the image', async () => {
  const raw=encodeSharedQr({kind:'merchant',shopId:SHOP,requestId:REQUEST}),pixels=raster(raw);let closes=0;
  const decoded=await decodeQrImage({type:'image/png',size:100},{createImageBitmap:async()=>({width:pixels.width,height:pixels.height,close(){closes++;}}),createCanvas:()=>({getContext:()=>({drawImage(){},getImageData:()=>pixels})})});
  assert.equal(decoded,raw); assert.equal(closes,1); assert.equal(parseSharedQr(decoded).requestId,REQUEST);
});

test('QR image input rejects excessive files and unreadable pixels without any upload', async () => {
  await assert.rejects(()=>decodeQrImage({type:'text/html',size:20}), /Choose a QR image/);
  await assert.rejects(()=>decodeQrImage({type:'image/png',size:16*1024*1024}), /smaller than/);
  let closes=0;
  await assert.rejects(()=>decodeQrImage({type:'image/png',size:1},{createImageBitmap:async()=>({width:10,height:10,close(){closes++;}}),createCanvas:()=>({getContext:()=>({drawImage(){},getImageData:()=>({width:10,height:10,data:new Uint8ClampedArray(400)})})})}),/No readable QR/);
  assert.equal(closes,1);
});

function scannerFixture() {
  const document=new EventTarget();document.hidden=false;
  let stops=0,frames=0,cancels=0;
  const track=new EventTarget();track.stop=()=>stops++;
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  const video={srcObject:null,play:async()=>{},pause(){},readyState:2,videoWidth:100,videoHeight:100};
  const options={document,createCanvas:()=>({getContext:()=>({drawImage(){},getImageData:()=>({width:100,height:100,data:new Uint8ClampedArray(40000)})})}),requestFrame:()=>++frames,cancelFrame:()=>cancels++,mediaDevices:{getUserMedia:async()=>stream}};
  return {document,track,stream,video,options,counts:()=>({stops,frames,cancels})};
}

test('camera cleanup stops tracks, detaches preview and does not restart frames', async () => {
  const f=scannerFixture(),errors=[];
  const stop=await mountScanner(f.video,()=>{},error=>errors.push(error),f.options);
  assert.equal(f.video.srcObject,f.stream);assert.equal(f.counts().frames,1);
  stop();stop();assert.equal(f.video.srcObject,null);assert.equal(f.counts().stops,1);assert.equal(f.counts().cancels,1);assert.equal(errors.length,0);
});

test('a late camera permission result is stopped after navigation abort', async () => {
  const f=scannerFixture(),controller=new AbortController();let resolve;
  f.options.signal=controller.signal;f.options.mediaDevices.getUserMedia=()=>new Promise(r=>resolve=r);
  const mounting=mountScanner(f.video,()=>{},()=>{},f.options);
  controller.abort();resolve(f.stream);const stop=await mounting;stop();
  assert.equal(f.video.srcObject,null);assert.equal(f.counts().stops,1);assert.equal(f.counts().frames,0);
});

test('backgrounding or camera disconnect stops capture and reports only usable errors', async () => {
  const f=scannerFixture();await mountScanner(f.video,()=>{},()=>{},f.options);
  f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));assert.equal(f.counts().stops,1);
  const g=scannerFixture(),errors=[];await mountScanner(g.video,()=>{},e=>errors.push(e.message),g.options);
  g.track.dispatchEvent(new Event('ended'));assert.equal(g.counts().stops,1);assert.match(errors[0],/disconnected/);
});
