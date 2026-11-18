/** Brief tab returns restore the page; account-owned drafts remain under Continue. */
import {safeRoute,routeKey} from './navigation.js';

export const MAIN_TABS=Object.freeze(['home','activity','pay','boxes','plan']);
export const MAIN_TAB_RESUME_MS=5000;
const tabs=new Set(MAIN_TABS);
const root=section=>({section,page:'home'});
const scalarKeys=['section','page','id','step','filter','month','hubTab','list','mode','boxId','edit','editing'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const membershipId=/^loyalty-member-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function copyRoute(value,depth=0){
  if(!value||typeof value!=='object'||Array.isArray(value)||depth>3)return null;
  const out={};
  for(const key of scalarKeys){const v=value[key];if(typeof v==='string')out[key]=v.slice(0,180);else if(typeof v==='boolean'||Number.isSafeInteger(v))out[key]=v;}
  for(const key of ['shopId','businessId'])if(typeof value[key]==='string'&&uuid.test(value[key]))out[key]=value[key];
  if(typeof value.membershipId==='string'&&membershipId.test(value.membershipId))out.membershipId=value.membershipId;
  for(const key of ['backTo','returnTo']){const r=copyRoute(value[key],depth+1);if(r)out[key]=r;}
  return typeof out.section==='string'?out:null;
}
const position=value=>Number.isFinite(value)?Math.max(0,Math.min(value,1e7)):0;
function resumable(route){
  const r=copyRoute(route);
  if(!r||!tabs.has(r.section))return null;
  // Re-entering a tab must never restart a camera or present a finished payment.
  if(r.section==='pay'&&['scan','status','fund-status'].includes(r.page))return root('pay');
  if(r.section==='pay'&&r.page==='pause')return {section:'pay',page:'review'};
  return r;
}
export function isMainTabCheckpointFresh(saved,now=Date.now()){
  const elapsed=now-saved?.leftAt;
  return Number.isFinite(now)&&Number.isFinite(saved?.leftAt)&&elapsed>=0&&elapsed<MAIN_TAB_RESUME_MS;
}
export function rememberMainTab(draft,route,scroll=0,disclosures,now=Date.now()){
  const r=resumable(route);if(!r)return;
  if(!draft.mainTabs||typeof draft.mainTabs!=='object'||Array.isArray(draft.mainTabs))draft.mainTabs={};
  const unchanged=routeKey(route)===routeKey(r),records=unchanged?cleanDisclosures(disclosures):[];
  draft.mainTabs[r.section]={route:r,leftAt:now,scroll:unchanged?position(scroll):0,...(records.length?{disclosures:records}:{})};
}
export function mainTabDestination(tab,state,draft,{now=Date.now(),currentRoute}={}){
  if(!tabs.has(tab))tab='home';
  const saved=draft.mainTabs?.[tab],candidate=resumable(saved?.route);
  const cached=currentRoute?.section!==tab&&candidate?.section===tab&&isMainTabCheckpointFresh(saved,now),requested=cached?candidate:root(tab);
  let route=safeRoute(requested,state,draft);
  if(route.section==='pay'&&['status','fund-status'].includes(route.page))route=root('pay');
  const unchanged=cached&&routeKey(route)===routeKey(requested),records=unchanged?cleanDisclosures(saved?.disclosures):[];
  return {route,scroll:unchanged?position(saved?.scroll):0,...(records.length?{disclosures:records}:{})};
}

const MAX_DISCLOSURES=64;
const disclosureId=/^[A-Za-z][A-Za-z0-9_.:-]{0,95}$/;
const disclosureKey=/^(?:id:[A-Za-z][A-Za-z0-9_.:-]{0,95}|summary:[a-f0-9]{8}):[0-9]{1,2}$/;
function summaryHash(value){
 const text=String(value||'').replace(/\s+/gu,' ').trim().slice(0,256);if(!text)return null;
 let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0');
}
function pageDisclosures(view){
 if(typeof view?.querySelectorAll!=='function')return [];
 const occurrences=new Map(),rows=[];
 for(const detail of [...view.querySelectorAll('details')].slice(0,MAX_DISCLOSURES)){
  const id=typeof detail.id==='string'&&disclosureId.test(detail.id)?detail.id:null;
  const summary=detail.querySelector?.(':scope > summary'),hash=id?null:summaryHash(summary?.textContent);
  if(!id&&!hash)continue;
  const base=id?`id:${id}`:`summary:${hash}`,index=occurrences.get(base)||0;occurrences.set(base,index+1);
  rows.push({key:`${base}:${index}`,detail});
 }
 return rows;
}
function cleanDisclosures(records){
 if(!Array.isArray(records))return [];
 const seen=new Set();return records.slice(0,MAX_DISCLOSURES).filter(record=>{
  if(!record||typeof record.key!=='string'||!disclosureKey.test(record.key)||typeof record.open!=='boolean'||seen.has(record.key))return false;seen.add(record.key);return true;
 }).map(({key,open})=>({key,open}));
}
/** Store only an element key and its openness, never fields, codes or summary text. */
export function captureMainTabDisclosures(view){return pageDisclosures(view).map(({key,detail})=>({key,open:detail.open===true}));}
/** Apply state only to the disclosures that still exist on this exact page. */
export function restoreMainTabDisclosures(view,records){
 const saved=new Map(cleanDisclosures(records).map(record=>[record.key,record.open]));
 for(const {key,detail} of pageDisclosures(view))if(saved.has(key)&&detail.open!==saved.get(key))detail.open=saved.get(key);
}
