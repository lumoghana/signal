#!/usr/bin/env node
/* Serial heavy-test runner. Never evaluates a shell command or loads application fixtures itself. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {captureAll,changedPins,filePin}=require('./capture-review-pins.cjs');
const root=path.resolve(__dirname,'../..'),args=process.argv.slice(2),separator=args.indexOf('--');
const option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const name=option('--name'),owner=option('--owner'),nodeArgs=separator<0?[]:args.slice(separator+1);
if(!name||!owner||!nodeArgs.length||!/^[a-z0-9-]+$/.test(name))throw Error('Usage: node tests/manual-layout/run-review-check.cjs --owner primary --name primary-finish -- --test tests/primary-finish.test.cjs');
const lock='/tmp/lumo-deep-review/runtime-test.lock',records=path.join(root,'docs/review-2026-10-27/test-runs');
fs.mkdirSync(path.dirname(lock),{recursive:true});
try{fs.mkdirSync(lock);}catch(error){if(error.code==='EEXIST')throw Error('Another heavy runtime test owns the queue: '+fs.readFileSync(path.join(lock,'owner.json'),'utf8'));throw error;}
process.once('exit',()=>fs.rmSync(lock,{recursive:true,force:true}));
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),recordPath=path.join(records,stamp+'-'+name+'.json'),logPath=recordPath.replace(/\.json$/,'.log');
fs.mkdirSync(records,{recursive:true});
const before=captureAll(),inputFiles=nodeArgs.filter(a=>/\.(?:cjs|mjs|js)$/.test(a)&&fs.existsSync(path.resolve(root,a)));
if(nodeArgs.includes('--regression'))for(const script of inputFiles){const basename=path.basename(script),checkout=path.resolve(path.dirname(path.resolve(root,script)),'..');let manifest;
 if(basename==='check-edition-parity.cjs')manifest=JSON.parse(fs.readFileSync(path.join(checkout,'config/editions.json'))).verification.regressionTests;
 if(basename==='check-hibiscus-contract.cjs')manifest=JSON.parse(fs.readFileSync(path.join(checkout,'config/hibiscus-edition.json'))).regressionTests;
 if(manifest)for(const test of manifest)inputFiles.push(path.join(checkout,test));
}
const testInputs=Object.fromEntries([...new Set(inputFiles)].map(a=>[a,filePin(path.resolve(root,a))]));
const record={name,owner,startedAt:new Date().toISOString(),cwd:root,executable:process.execPath,arguments:nodeArgs,testInputs,before,logPath,status:'running'};
fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify({name,owner,pid:process.pid,startedAt:record.startedAt,recordPath},null,2));
fs.writeFileSync(recordPath,JSON.stringify(record,null,2)+'\n');
const log=fs.createWriteStream(logPath),child=cp.spawn(process.execPath,nodeArgs,{cwd:root,stdio:['ignore','pipe','pipe']});
for(const [stream,target]of [[child.stdout,process.stdout],[child.stderr,process.stderr]])stream.on('data',chunk=>{log.write(chunk);target.write(chunk);});
let done=false;
function finish(code,signal,error){if(done)return;done=true;record.endedAt=new Date().toISOString();record.exitCode=code;record.signal=signal||null;record.error=error?String(error.stack||error):null;record.status=code===0&&!error?'passed':'failed';try{record.after=captureAll();record.sourceChangesDuringRun=changedPins(before,record.after);record.sourceStable=record.sourceChangesDuringRun.length===0;record.testInputsAfter=Object.fromEntries(Object.keys(testInputs).map(f=>[f,filePin(path.resolve(root,f))]));record.testInputsStable=Object.entries(testInputs).every(([f,p])=>p.sha256===record.testInputsAfter[f].sha256);fs.writeFileSync(recordPath,JSON.stringify(record,null,2)+'\n');}finally{fs.rmSync(lock,{recursive:true,force:true});log.end();}console.log(JSON.stringify({recordPath,logPath,status:record.status,exitCode:code,sourceStable:record.sourceStable,changedSources:record.sourceChangesDuringRun?.length,testInputsStable:record.testInputsStable}));process.exitCode=code===0&&!error?0:code||1;}
child.once('error',error=>finish(null,null,error));child.once('close',(code,signal)=>finish(code,signal));
