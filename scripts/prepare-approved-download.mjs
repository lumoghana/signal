import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Restore the separately delivered signed artifact without putting APK bytes in Git.
// This is the same approved immutable-asset pattern as the welcome artwork helper.
export const APPROVED_DOWNLOAD=Object.freeze({
  version:'2.12.2',
  versionCode:21202,
  source:'https://lumo-connected-pilot.vercel.app/downloads/Lumo-Test-Android.apk',
  sha256:'f1bdb612b0a08be224d44bfa636aca8848181dbb856117ee9a4fc00ace602898',
  bytes:4617167,
});
export function verifyApprovedDownload(bytes){
  if(bytes.length!==APPROVED_DOWNLOAD.bytes||createHash('sha256').update(bytes).digest('hex')!==APPROVED_DOWNLOAD.sha256)throw Error('Approved Android download integrity check failed.');
  return true;
}
export async function prepareApprovedDownload({directory=new URL('../dist/downloads/',import.meta.url),transport=globalThis.fetch}={}){
  const target=new URL('Lumo-Test-Android.apk',directory),temporary=new URL('.Lumo-Test-Android.apk.download',directory);
  try{const bytes=await readFile(target);verifyApprovedDownload(bytes);console.log('Verified approved signed Android download.');return;}catch(error){if(error.code!=='ENOENT')throw error;}
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
