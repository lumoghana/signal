import {createServer} from 'node:http';
import {readFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createD1} from './d1-adapter.mjs';
import {handleAPI} from '../server/api.js';
const root=process.cwd();await mkdir('.sites-runtime',{recursive:true});const DB=createD1('.sites-runtime/merchant.sqlite');
for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort()){
 await DB.exec('CREATE TABLE IF NOT EXISTS __local_migrations (name TEXT PRIMARY KEY)');
 if(!await DB.prepare('SELECT name FROM __local_migrations WHERE name=?').bind(name).first()){await DB.exec(await readFile(path.join('drizzle',name),'utf8'));await DB.prepare('INSERT INTO __local_migrations(name) VALUES (?)').bind(name).run()}
}
const arg=process.argv.indexOf('--port'),port=arg>=0?Number(process.argv[arg+1]):4173;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);const url=new URL(req.url,'http://'+req.headers.host);const request=new Request(url,{method:req.method,headers:req.headers,...(body.length?{body,duplex:'half'}:{})});let response=await handleAPI(request,{DB});if(!response){const file=path.resolve(root,'dist','.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(path.join(root,'dist')+path.sep))response=new Response('Not found',{status:404});else{try{const data=await readFile(file);response=new Response(data,{headers:{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}})}catch{response=new Response('Not found',{status:404})}}}res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch(e){console.error(e.message);res.writeHead(500);res.end('Preview error')}}).listen(port,'0.0.0.0',()=>console.log('Lumo preview listening on http://0.0.0.0:'+port));
