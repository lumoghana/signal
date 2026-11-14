import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// The approved artwork is immutable. File-based uploads can omit this large
// public asset; the build restores its exact bytes from the reviewed source.
const source='https://raw.githubusercontent.com/lumoghana/signal/f8850a7a4e7ec17d41f4dacc2654ec790df72ac0/dist/assets/student-warm-welcome.png';
const expectedSha256='5f27156498872a33e79d709acf81bfee6a3abbbb1716165cb4c30b62c7dd7dbe';
const expectedBytes=2174722;

export async function prepareApprovedWelcome({directory=new URL('../dist/assets/',import.meta.url),transport=globalThis.fetch}={}){
  const target=new URL('student-warm-welcome.png',directory);
  let bytes,missing=false;
  try{bytes=await readFile(target);}catch(error){if(error.code!=='ENOENT')throw error;missing=true;}
  if(missing){
    const response=await transport(source,{redirect:'error',signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw Error(`Approved welcome artwork download failed (${response.status}).`);
    bytes=Buffer.from(await response.arrayBuffer());
  }
  if(bytes.length!==expectedBytes||createHash('sha256').update(bytes).digest('hex')!==expectedSha256)throw Error('Approved welcome artwork integrity check failed.');
  if(missing){await mkdir(directory,{recursive:true});await writeFile(target,bytes,{flag:'wx'});}
  console.log('Verified original approved welcome artwork.');
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1]||'')).href)await prepareApprovedWelcome();
