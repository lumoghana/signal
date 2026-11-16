import {encodeRecoveryCanvas} from './recovery-camera.js';

/** Encode these same camera snapshots for enrollment; never open another camera. */
export async function encodeSignupRecoveryCaptures(captures,{
 decode=globalThis.createImageBitmap,
 createCanvas=()=>globalThis.document.createElement('canvas'),
 encodeCanvas=encodeRecoveryCanvas,
}={}){
 if(!Array.isArray(captures)||captures.length!==3||new Set(captures).size!==3||typeof decode!=='function'||captures.some(blob=>blob?.type!=='image/jpeg'||!Number.isFinite(blob.size)||blob.size<1||blob.size>20000000))throw Error('Three current signup camera photos are required.');
 const photos=[];
 for(const blob of captures){
  let image,canvas;
  try{
   image=await decode(blob);const width=Number(image?.width),height=Number(image?.height);
   if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>16384||height>16384)throw Error('The signup camera image could not be read.');
   const scale=Math.min(1,960/Math.max(width,height));canvas=createCanvas();canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
   const context=canvas.getContext('2d',{alpha:false});if(!context)throw Error('The signup camera image could not be prepared.');
   context.drawImage(image,0,0,canvas.width,canvas.height);
   const photo=await encodeCanvas(canvas);
   if(typeof photo!=='string'||photo.length>349551||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)||atob(photo.slice(23)).length>262144)throw Error('The signup camera image exceeds the recovery upload limit.');
   photos.push(photo);
  }finally{image?.close?.();if(canvas){canvas.width=0;canvas.height=0;}}
 }
 return photos;
}
