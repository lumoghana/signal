import test from 'node:test';
import assert from 'node:assert/strict';
import {createOnboardingDraft} from '../dist/js/onboarding-model.js';
import {renderOnboarding} from '../dist/js/onboarding.js';
import {renderQrScreen} from '../dist/js/qr-screen.js';
import {normalizeLumoUsername,validUsername} from '../dist/js/login-credentials.js';
import {createEmptyState} from '../dist/js/model.js';
import {renderAccount} from '../dist/js/account-ui.js';

test('signup explains a unique public payment username separately from the full name and secrets',()=>{
 const html=renderOnboarding({connected:true,draft:{onboarding:createOnboardingDraft()}},{step:'login'});
 assert.match(html,/Choose a unique @username/);assert.match(html,/send you money/);assert.match(html,/different from your full name/);assert.match(html,/Your password signs you in.*Your PIN approves money moves.*Keep both private/);assert.match(html,/aria-describedby="onb-username-help"/);
 assert.doesNotMatch(html,/username is available|username reserved|name is available/i);
});
test('payment username input accepts a single @ prefix and validates canonical syntax',()=>{
 assert.equal(normalizeLumoUsername(' @Ama.Campus '),'ama.campus');assert.equal(validUsername(normalizeLumoUsername('@Ama.Campus')),true);
 assert.equal(validUsername(normalizeLumoUsername('@@ama.campus')),false);assert.equal(validUsername(normalizeLumoUsername('@ab')),false);assert.equal(validUsername(normalizeLumoUsername('@ama campus')),false);
});
test('shared receiving code shows the authoritative public username and explains receiving money',()=>{
 const ctx={connected:true,shared:{account:{handle:'ama.campus'}},state:{profile:{name:'Ama Full Name'},account:{login:{username:'older.name'}}},draft:{},qrCodeMarkup:()=>'<svg></svg>'};
 const html=renderQrScreen(ctx,{mode:'code'});assert.match(html,/@ama.campus/);assert.doesNotMatch(html,/@older.name/);assert.match(html,/receive money from another Lumo user/);assert.match(html,/Ama Full Name/);
 const sample=renderQrScreen({...ctx,connected:false},{mode:'code'});assert.doesNotMatch(sample,/data-receiving-username/);
});
test('profile login details display the receiving username without exposing a password or PIN',()=>{
 const state=createEmptyState();state.onboardingDone=true;state.account.login={username:'ama.campus'};
 const html=renderAccount({connected:true,state,shared:{account:{handle:'ama.campus'}},draft:{}},{page:'account-login-setup'});
 assert.match(html,/@ama.campus/);assert.match(html,/find you and send you money/);assert.doesNotMatch(html,/type="password"|type="tel"/);
});

import {signupUsernameMessage} from '../dist/js/onboarding.js';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('taken names and temporary reservations have distinct actionable messages',()=>{
 for(const code of ['HANDLE_TAKEN','HANDLE_UNAVAILABLE','USERNAME_TAKEN'])assert.match(signupUsernameMessage({code}),/already taken.*Choose another/);
 assert.match(signupUsernameMessage({code:'REGISTRATION_PENDING'}),/temporarily reserved.*again shortly/);
 for(const code of ['PHONE_EXISTS','EXISTING_ACCOUNT','UNKNOWN_OUTCOME'])assert.equal(signupUsernameMessage({code}),'');
});
test('a server username collision returns to username choice without retaining either PIN or falsely claiming an account',async()=>{
 const source=await readFile(new URL('../dist/js/app.js',import.meta.url),'utf8'),start=source.indexOf('async function completeSignup(){'),end=source.indexOf('\nfunction exitAccountActivation()',start),routes=[],toasts=[];
 const d={name:'Ama',phone:'0240000000',login:{username:'ama.campus'},pin:'1234',pinConfirm:'1234',completed:true,completedSteps:['name','phone','identity-review','login','pin','pin-confirm']};
 const ctx=vm.createContext({completingSignup:false,onboardingDraft:()=>d,buildOnboardingState:()=>({ok:true,state:{}}),shared:{connected:true,async register(){return{ok:false,code:'HANDLE_TAKEN',message:'generic'};}},signupPassword:'kept-only-in-memory',signupUsernameMessage,persistSession(){},toast:message=>toasts.push(message),go:route=>routes.push(route),render(){throw Error('A taken username must return to the username field, not strand the user on PIN.');}});
 vm.runInContext(source.slice(start,end)+';this.run=completeSignup;',ctx);await ctx.run();
 assert.equal(routes.at(-1).step,'login');assert.equal(d.currentStep,'login');assert.equal(d.completed,false);assert.equal(d.pin,'');assert.equal(d.pinConfirm,'');assert.deepEqual(d.completedSteps,['name','phone','identity-review']);assert.match(d.usernameError,/already taken/);assert.equal(ctx.signupPassword,'kept-only-in-memory');assert.match(toasts.at(-1),/Choose another/);
});
