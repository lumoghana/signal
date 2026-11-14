import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createD1} from '../scripts/d1-adapter.mjs';
import {handleAPI} from '../server/api.js';
import {readNetwork} from '../server/network.js';
export function harness(){
 const DB=createD1();for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())DB.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 const env={DB};function client(){const cookies=new Map();return {cookies,async call(path,body){const headers={'X-Lumo-Request':'1','Origin':'https://counter.test','cf-connecting-ip':'counter-test'};if(body!==undefined)headers['Content-Type']='application/json';if(cookies.size)headers.Cookie=[...cookies].map(([k,v])=>k+'='+v).join('; ');const res=await handleAPI(new Request('https://counter.test'+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),env);for(const c of res.headers.getSetCookie()){const [key,value]=c.split(';')[0].split('=');cookies.set(key,value);}return {status:res.status,data:await res.json()};}}}return {env,client,close:()=>DB.close()};
}
export const action=async(c,type,payload)=>{const view=(await c.call('/api/session')).data;return c.call('/api/action',{type,payload:{...payload,...(view.counter&&!view.counter.locked?{counterStaffId:view.counter.staffId,counterShiftId:view.counter.shiftId}:{})}});};
export async function setup(h,mode='shared'){
 const owner=h.client(),phone=h.client(),student=h.client(),suffix=crypto.randomUUID().slice(0,8),password='OwnerTest12345',username='owner.'+suffix;
 const reg=await owner.call('/api/signup',{attemptId:'signup-'+suffix,name:'Campus Kitchen',ownerName:'Akua',phone:'0245550100',businessType:'sole-trader',destination:'Test bank',verification:{phone:true,identity:true,face:true},shop:{name:'Night Market',area:'Legon',category:'Food',lat:5.65,lng:-.18},credentials:{username,password}});assert.equal(reg.status,201);
 const shop=reg.data.state.shops[0],staff=[];
 for(const [index,name,pin] of [[0,'Ama','147258'],[1,'Kojo','258369']]){const invite=await owner.call('/api/invitations',{name,phone:'055555010'+index,role:'cashier',shopIds:[shop.id]});const accepted=await h.client().call('/api/invitations/accept',{token:invite.data.invitation.token,username:'cash.'+index+'.'+suffix,password:'CashierTest12345'});assert.equal(accepted.status,201);const user=accepted.data.user;staff.push({...user,pin,staffId:'access-'+user.id});assert.equal((await owner.call('/api/counter/pin',{userId:user.id,pin})).status,200);}
 assert.equal((await phone.call('/api/auth/login',{username,password})).status,200);
 const paired=await phone.call('/api/counter/setup',{deviceId:'counter-phone-'+suffix,shopId:shop.id,label:'Till one',mode,staffUserId:mode==='dedicated'?staff[0].id:undefined});assert.equal(paired.status,200);
 return {owner,phone,student,shop,staff,counter:paired.data.counter,paired};
}
export const unlock=(c,person,pin=person.pin)=>c.call('/api/counter/unlock',{userId:person.id,pin});

