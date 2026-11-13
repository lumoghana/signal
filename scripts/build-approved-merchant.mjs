import {cp,mkdir,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),source=path.join(root,'merchant-approved','dist'),destination=path.join(root,'dist','merchant');
await mkdir(destination,{recursive:true});
for(const entry of await readdir(source,{withFileTypes:true})){
 if(['server','.openai'].includes(entry.name))continue;
 await cp(path.join(source,entry.name),path.join(destination,entry.name),{recursive:true});
}
// Keep this static export independent of the original Site's Worker/deployment identity.
await rm(path.join(destination,'.openai'),{recursive:true,force:true});
await rm(path.join(destination,'server'),{recursive:true,force:true});
console.log('Prepared approved merchant v7 at /merchant/.');
