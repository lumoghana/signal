import assert from 'node:assert/strict';
import test from 'node:test';
import {createSignup} from '../dist/signup.js';

class Storage{constructor(){this.data=new Map()}getItem(key){return this.data.get(key)??null}setItem(key,value){this.data.set(key,String(value))}removeItem(key){this.data.delete(key)}}
globalThis.FormData=class{constructor(form){this.entries=form.entries}*[Symbol.iterator](){yield* this.entries}};
const form=values=>{const entries=Object.entries(values);return {entries,elements:Object.fromEntries(entries.map(([key,value])=>[key,{value,checked:value==='on'}])),querySelector(){return null}}};
const extract=(html,name)=>html.match(new RegExp('name="'+name+'"[^>]*value="([^"]*)"'))?.[1];
const result=()=>({business:{id:'shared-business',name:'Campus Kitchen',accountNumber:'9900111222'},shops:[{id:'shared-shop',name:'Night Market',code:'LUM200'}]});
function setup(onComplete,storage=new Storage(),extra={}){globalThis.sessionStorage=storage;const calls=[];const signup=createSignup({onRender(){},onComplete:async value=>{calls.push(structuredClone(value));return onComplete?onComplete(value,calls.length):result()},...extra});return {signup,calls,storage}}
async function reachReview(signup,{username='reliable.owner',password='OriginalTest123'}={}){
 signup.handleClick('signup-begin',{});await signup.handleSubmit(form({phone:'0245550100'}));await signup.handleSubmit(form({otp:'123456'}));
 await signup.handleSubmit(form({username,password,confirmation:password}));await signup.handleSubmit(form({name:'Campus Kitchen',ownerName:'Akua Test',businessType:'sole-trader'}));
 signup.handleClick('signup-verify-id',{});signup.handleClick('signup-verify-face',{});await signup.handleSubmit(form({}));
 await signup.handleSubmit(form({bankProvider:'GCB Bank',bankNumber:'113004567890'}));await signup.handleSubmit(form({shopName:'Night Market',area:'Night Market',category:'Food & drinks'}));
}

test('sample signup credentials are unique per request and never persist a plaintext generated password',async()=>{
 const first=setup(),second=setup();
 globalThis.sessionStorage=first.storage;first.signup.handleClick('signup-begin',{});first.signup.handleClick('signup-sample',{});await first.signup.handleSubmit(form({}));await first.signup.handleSubmit(form({otp:'123456'}));
 const one=first.signup.render(),username=extract(one,'username'),password=extract(one,'password');assert.match(username,/^sample\./);assert.ok(password.length>=20);assert.notEqual(password,'CampusLumo27');
 first.signup.handleClick('signup-sample',{});assert.equal(extract(first.signup.render(),'username'),username);assert.equal(extract(first.signup.render(),'password'),password);
 for(const value of first.storage.data.values())assert.ok(!value.includes(password));
 globalThis.sessionStorage=second.storage;second.signup.handleClick('signup-begin',{});second.signup.handleClick('signup-sample',{});await second.signup.handleSubmit(form({}));await second.signup.handleSubmit(form({otp:'123456'}));
 assert.notEqual(extract(second.signup.render(),'username'),username);assert.notEqual(extract(second.signup.render(),'password'),password);
});

test('an uncertain response retries the same immutable request and attempt instead of choosing a new username',async()=>{
 const {signup,calls,storage}=setup((payload,count)=>{if(count===1)throw Error('Connection interrupted');return result()});
 await reachReview(signup);await signup.handleSubmit(form({consent:'on'}));assert.match(signup.render(),/Resume account request|RESUME ACCOUNT REQUEST/);assert.match(signup.render(),/same account request/);
 const attempt=calls[0].attemptId;assert.ok(attempt);assert.equal(calls[0].signupAttemptId,attempt);
 for(const value of storage.data.values())assert.ok(!value.includes('OriginalTest123'));
 await signup.handleSubmit(form({password:'IgnoredDifferent123',consent:'on'}));assert.equal(calls.length,2);assert.deepEqual(calls[1],calls[0]);assert.match(signup.render(),/signup-success-account/);
});

test('an uncertain request survives reload without storing credentials and resumes with its original attempt',async()=>{
 const first=setup(()=>{throw Error('Response lost')});await reachReview(first.signup);await first.signup.handleSubmit(form({consent:'on'}));const original=first.calls[0];
 const resumed=setup(()=>result(),first.storage);assert.match(resumed.signup.render(),/account request needs confirmation/);resumed.signup.handleClick('signup-resume-request',{});
 assert.equal(extract(resumed.signup.render(),'password'),'');await resumed.signup.handleSubmit(form({password:'OriginalTest123',consent:'on'}));
 assert.equal(resumed.calls[0].attemptId,original.attemptId);assert.deepEqual(resumed.calls[0],original);
});

test('explicit first-request username collisions return to credentials without pretending the request was uncertain',async()=>{
 const {signup,storage}=setup(()=>{const error=Error('That username is already in use. Choose another.');error.status=400;throw error});await reachReview(signup);await signup.handleSubmit(form({consent:'on'}));
 assert.match(signup.render(),/Your own login/);assert.doesNotMatch(signup.render(),/RESUME ACCOUNT REQUEST/);assert.equal(JSON.parse([...storage.data.values()][0]).submissionStarted,false);
});

test('uncertain sign-in passes the original username and successful matching sign-in clears the pending marker',async()=>{
 let options=null;const {signup,storage}=setup(()=>{throw Error('Response lost')},new Storage(),{onLogin:value=>{options=value}});await reachReview(signup);await signup.handleSubmit(form({consent:'on'}));
 signup.handleClick('signup-pending-login',{});assert.equal(options.username,'reliable.owner');assert.equal(signup.isActive(),false);
 signup.clearPendingFor('reliable.owner');assert.equal(JSON.parse([...storage.data.values()][0]).submissionStarted,false);
});

test('a previously used browser can start another explicit signup without overwriting saved server records',async()=>{
 const {signup}=setup(undefined,new Storage(),{hasRegistration:()=>true});assert.match(signup.render(),/Create a different merchant account/);signup.handleClick('signup-begin',{});assert.match(signup.render(),/Mobile number/);
});
