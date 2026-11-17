import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Restore the separately delivered signed artifact without putting APK bytes in Git.
// This is the same approved immutable-asset pattern as the welcome artwork helper.
export const APPROVED_DOWNLOAD=Object.freeze({
  version:'2.12.4',
  versionCode:21204,
  source:'https://lumo-connected-pilot.vercel.app/downloads/Lumo-Test-Android.apk',
  sha256:'0518c4a379fe815b5f794e7555f7fd49db12bbdb1a062e5046aabbd56e30d223',
  bytes:4621263,
});
export function verifyApprovedDownload(bytes){
  if(bytes.length!==APPROVED_DOWNLOAD.bytes||createHash('sha256').update(bytes).digest('hex')!==APPROVED_DOWNLOAD.sha256)throw Error('Approved Android download integrity check failed.');
  return true;
}
async function approvedBuildParts(directory){
  let raw;
  try{raw=await readFile(new URL('manifest.json',directory));}catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(raw.length>40000)throw Error('Android build input manifest is too large.');
  const manifest=JSON.parse(raw.toString('utf8')),chunkSize=49152,count=Math.ceil(APPROVED_DOWNLOAD.bytes/chunkSize);
  if(manifest.version!==APPROVED_DOWNLOAD.version||manifest.versionCode!==APPROVED_DOWNLOAD.versionCode||manifest.overallSize!==APPROVED_DOWNLOAD.bytes||manifest.overallSha256!==APPROVED_DOWNLOAD.sha256||manifest.chunkSize!==chunkSize||manifest.partCount!==count||!Array.isArray(manifest.parts)||manifest.parts.length!==count)throw Error('Android build input manifest does not match the approved release.');
  const buffers=[];
  for(let index=0;index<count;index++){
    const part=manifest.parts[index],name=`apk-${APPROVED_DOWNLOAD.version.replace(/\./g,'')}-${String(index).padStart(3,'0')}.part`,size=Math.min(chunkSize,APPROVED_DOWNLOAD.bytes-index*chunkSize);
    if(part?.index!==index||part.file!==name||part.size!==size||typeof part.sha1!=='string'||!/^[a-f0-9]{40}$/.test(part.sha1))throw Error('Invalid Android build input part.');
    const bytes=await readFile(new URL(name,directory));
    if(bytes.length!==size||createHash('sha1').update(bytes).digest('hex')!==part.sha1)throw Error('Android build input part failed its integrity check.');
    buffers.push(bytes);
  }
  const bytes=Buffer.concat(buffers,APPROVED_DOWNLOAD.bytes);verifyApprovedDownload(bytes);return bytes;
}
export async function prepareApprovedDownload({directory=new URL('../dist/downloads/',import.meta.url),partsDirectory=new URL('../build-inputs/approved-apk/',import.meta.url),transport=globalThis.fetch}={}){
  const target=new URL('Lumo-Test-Android.apk',directory),temporary=new URL('.Lumo-Test-Android.apk.download',directory);
  try{const bytes=await readFile(target);verifyApprovedDownload(bytes);console.log('Verified approved signed Android download.');return;}catch(error){if(error.code!=='ENOENT')throw error;}
  const buildBytes=await approvedBuildParts(partsDirectory);
  if(buildBytes){
    await mkdir(directory,{recursive:true});
    try{await writeFile(temporary,buildBytes,{flag:'wx'});await rename(temporary,target);}catch(error){await rm(temporary,{force:true});throw error;}
    console.log('Restored verified signed Android download from build inputs.');return;
  }
  const response=await transport(APPROVED_DOWNLOAD.source,{redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error(`Approved Android download failed (${response.status}).`);
  const reader=response.body?.getReader();if(!reader)throw Error('Approved Android download has no body.');
  const parts=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>APPROVED_DOWNLOAD.bytes){await reader.cancel();throw Error('Approved Android download exceeds its verified size.');}parts.push(value);}}finally{reader.releaseLock();}
  const bytes=Buffer.concat(parts.map(part=>Buffer.from(part)),size);verifyApprovedDownload(bytes);
  await mkdir(directory,{recursive:true});
  try{await writeFile(temporary,bytes,{flag:'wx'});await rename(temporary,target);}catch(error){await rm(temporary,{force:true});throw error;}
  console.log('Restored verified approved signed Android download.');
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1]||'')).href)await prepareApprovedDownload();
