import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {createEmptyState} from '../../dist/js/model.js';
import {handleLux} from '../../api/lux.mjs';

// This server is verification-only. It never proxies a production service.
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),DIST=resolve(ROOT,'dist'),FIXTURE=resolve(ROOT,'verification/browser/fixture');
const OWNER='11111111-1111-4111-8111-111111111111',SHOP='22222222-2222-4222-8222-222222222222',BUSINESS='33333333-3333-4333-8333-333333333333';
const now=new Date(),today=now.toISOString().slice(0,10),tomorrow=new Date(Date.parse(today)+86400000).toISOString().slice(0,10),quotes=new Map();
const shop={id:SHOP,businessId:BUSINESS,businessName:'Synthetic Campus Kitchen',name:'Night Market counter',category:'Food',area:'Night Market',landmark:'Synthetic test location',code:'LUM900001',hours:'7 am–9 pm',lat:5.6509,lng:-.1878,published:true,accepting:true,open:true};
const programme=()=>({merchantId:BUSINESS,merchantName:shop.businessName,programme:{id:'synthetic-programme',name:'Kitchen Regulars',status:'active',colour:'#d4f65a'},rules:{version:1,earning:'visits',target:5,minimumSpend:2000,onePerDay:false,reward:{type:'discount',name:'Five cedis off',value:500,minimumSpend:2000,expiryDays:30}},terms:'Five qualifying visits earns five cedis off.',ruleVersion:1,consentVersion:'synthetic-browser-consent-v1',shops:[{id:SHOP,name:shop.name,accepting:true,published:true}],canJoin:true});
function state(){const s=createEmptyState({name:'Synthetic Student'});s.onboardingDone=true;s.wallet=100000;s.buffer=0;s.budget={created:true,items:[],endDate:tomorrow};s.income={amount:99999,nextDate:tomorrow};s.ious=[{id:'incoming-today',name:'Synthetic Esi',type:'owedToMe',amount:5000,paid:500,status:'open',due:today},{id:'incoming-tomorrow',name:'Synthetic Sena',type:'owedToMe',amount:8000,paid:0,status:'open',due:tomorrow},{id:'outgoing-today',name:'Synthetic Akos',type:'owedByMe',amount:2000,paid:500,status:'open',due:today}];return s;}
const snapshot=()=>({ok:true,state:state(),account:{userId:OWNER,id:'44444444-4444-4444-8444-444444444444',balance:100000,status:'active'},revision:1,sandbox:true,currency:'GHS'});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Lumo-Outcome':value.ok?'ok':'rejected'});res.end(JSON.stringify(value));}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>100000)throw Error('BODY_TOO_LARGE');}return JSON.parse(text||'{}');}
const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; worker-src 'none'; object-src 'none'; frame-src 'none'");
 try{
  const url=new URL(req.url,'http://127.0.0.1:4177');
  if(url.pathname==='/__fixture/health')return json(res,{ok:true,syntheticOnly:true});
  if(url.pathname==='/auth/v1/logout'){res.writeHead(204);return res.end();}
  if(req.method==='POST'&&url.pathname==='/__fixture/lux'){
   const input=await body(req);const result=await handleLux({method:'POST',authorization:'Bearer a.b.c',body:input},{credential:'',limiter:new Map(),now,fetcher:async()=>({ok:true,status:200,json:async()=>snapshot()})});return json(res,result.body,result.status);
  }
  if(req.method==='POST'&&url.pathname==='/functions/v1/lumo-approved'){
   const input=await body(req),scenario=url.searchParams.get('scenario'),run=req.headers['x-lumo-fixture-run']||'default';
   if(input.action==='merchant'&&input.method==='GET'&&input.path==='/api/directory')return json(res,{ok:true,shops:[{...shop,accepting:scenario!=='paused'}]});
   if(input.action==='quote'){
    const count=(quotes.get(run)||0)+1;quotes.set(run,count);
    if(scenario==='delayed')await new Promise(resolve=>setTimeout(resolve,1500));
    if(input.shopId!==SHOP||Object.hasOwn(input,'query'))return json(res,{ok:false,code:'SHOP_NOT_FOUND',message:'Shop not found.'});
    return json(res,{ok:true,merchant:{id:BUSINESS,name:shop.businessName},shop:{...shop,...(scenario==='changed'&&count>1?{name:'Changed synthetic counter'}:{})}});
   }
   if(input.action==='loyalty'&&input.operation==='programme')return json(res,{ok:true,loyalty:{version:'1.1.0',memberships:[],membership:null,programme:programme()}});
   if(input.action==='loyalty'&&input.operation==='list')return json(res,{ok:true,loyalty:{version:'1.1.0',memberships:[],membership:null,programme:null}});
   if(input.action==='snapshot')return json(res,snapshot());
   if(input.action==='serviceStatus')return json(res,{ok:true,services:[]});
   return json(res,{ok:false,code:'FIXTURE_WRITE_REJECTED',message:'This verification server does not execute money, enrolment or approval writes.'},400);
  }
  if(req.method!=='GET')return json(res,{ok:false,code:'METHOD_NOT_ALLOWED'},405);
  const isFixture=url.pathname.startsWith('/__fixture/'),base=isFixture?FIXTURE:DIST,relative=isFixture?url.pathname.slice('/__fixture/'.length):url.pathname==='/'?'index.html':url.pathname.slice(1),path=resolve(base,decodeURIComponent(relative));
  if(!path.startsWith(base+sep)||!mime[extname(path)])return json(res,{ok:false,code:'NOT_FOUND'},404);
  const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]});res.end(data);
 }catch(error){json(res,{ok:false,code:error.code==='ENOENT'?'NOT_FOUND':'FIXTURE_ERROR'},error.code==='ENOENT'?404:500);}
});
const argument=name=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];};
const port=Number(process.env.PORT||argument('--port')||4177),host=process.env.HOST||argument('--host')||'127.0.0.1';
server.listen(port,host,()=>console.log(`Synthetic browser verification at http://${host}:${port}`));
