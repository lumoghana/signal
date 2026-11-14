import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parseMerchantPaymentLink,merchantQuoteParams,resolveSamplePaymentLink,validateMerchantPaymentQuote} from '../dist/payment-link-intent.js';

const origin='https://merchant.example.test',now=Date.parse('2026-11-12T15:00:00Z');
const shop={id:'night-market',code:'LUM101',accepting:true,open:true};
const request={id:'request-25',shopId:shop.id,amount:2500,status:'open',expiresAt:new Date(now+60000).toISOString()};
const state=()=>({shops:[{...shop}],requests:[{...request}],transactions:[]});
const parse=value=>parseMerchantPaymentLink(origin+value,{origin});
const fixed=()=>parse('/?pay=night-market&workspace=sample&request=request-25&amount=2500');

// Exercise the actual app generator without bootstrapping a signed-in browser.
const generatorSource=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').match(/^function paymentLink\(.*$/m)?.[0];
assert.ok(generatorSource,'The app payment-link generator must be available for this integration check');
function generatedLink({workspace='registered',selected,request=null}={}) {
 const paymentLink=runInNewContext('('+generatorSource+')',{URL,CONNECTED_CONSUMER_ORIGIN:'https://lumo-connected-pilot.vercel.app',location:{origin},getWorkspaceMode:()=>workspace,shop:()=>selected});
 return new URL(paymentLink(selected.id,request));
}

test('registered app QR links keep shop, private access and fixed request while omitting redundant hints',()=>{
 const selected={id:'3eef5917-2c4c-4bb9-aa2b-983d453eac6a',published:false,testAcceptanceToken:'a'.repeat(64)},charge={id:'409560d9-f721-4fed-a9b3-133b254d9173',amount:2500};
 const reusable=generatedLink({selected}),fixed=generatedLink({selected,request:charge});
 for(const link of [reusable,fixed]){assert.equal(link.origin,'https://lumo-connected-pilot.vercel.app');assert.equal(link.searchParams.get('pay'),selected.id);assert.equal(link.searchParams.get('testKey'),selected.testAcceptanceToken);assert.equal(link.searchParams.has('workspace'),false);assert.equal(link.searchParams.has('amount'),false);}
 assert.equal(reusable.searchParams.has('request'),false);assert.equal(fixed.searchParams.get('request'),charge.id);
 const publicLink=generatedLink({selected:{...selected,published:true}});assert.equal(publicLink.searchParams.has('testKey'),false);assert.deepEqual([...publicLink.searchParams.keys()],['pay']);
 const intent=parseMerchantPaymentLink(fixed,{origin:fixed.origin});assert.equal(intent.workspace,'registered');assert.equal(intent.amount,null);assert.equal(intent.requestId,charge.id);assert.equal(merchantQuoteParams(intent).get('testKey'),selected.testAcceptanceToken);
});

test('compact fixed links obtain their exact amount from the matching unexpired server request',()=>{
 const intent=parse('/?pay=night-market&request=request-25');
 const quote={shop:{...shop},request:{...request}};
 assert.equal(validateMerchantPaymentQuote(intent,quote,{now}).request.amount,2500);
 for(const altered of [{...quote,request:null},{...quote,request:{...request,id:'another'}},{...quote,request:{...request,shopId:'pentagon'}},{...quote,shop:null},{...quote,shop:{...shop,id:'pentagon'}},{...quote,request:{...request,amount:0}},{...quote,request:{...request,expiresAt:new Date(now).toISOString()}},{...quote,request:{...request,status:'paid'}}])assert.throws(()=>validateMerchantPaymentQuote(intent,altered,{now}),/request|shop|amount|expired/);
});

test('sample app QR payload stays in its browser workspace with its existing amount hint',()=>{
 const link=generatedLink({workspace:'sample',selected:shop,request});
 assert.equal(link.href,origin+'/?pay=night-market&workspace=sample&request=request-25&amount=2500');
});

test('a fixed QR on a fresh browser cannot downgrade to an editable static shop payment',()=>{
 const fresh=state();fresh.requests=[];
 assert.throws(()=>resolveSamplePaymentLink(fresh,fixed(),{now}),/fixed-amount request is not saved in this browser/);
 const resolved=resolveSamplePaymentLink(state(),fixed(),{now});assert.equal(resolved.request.amount,2500);assert.equal(resolved.request.id,'request-25');
});
test('a reusable shop QR has no fixed request or hinted amount',()=>{
 const intent=parse('/?pay=night-market&workspace=sample');
 assert.equal(resolveSamplePaymentLink(state(),intent,{now}).request,null);
 assert.throws(()=>parse('/?pay=night-market&workspace=sample&amount=2500'),/no payment request/);
});
test('QR amount and receiving shop stay bound to the exact saved request',()=>{
 assert.throws(()=>resolveSamplePaymentLink(state(),{...fixed(),shopId:'pentagon'},{now}),/different shop/);
 assert.throws(()=>resolveSamplePaymentLink(state(),{...fixed(),amount:2600},{now}),/amount does not match/);
 const noHint=parse('/?workspace=sample&request=request-25');
 assert.equal(resolveSamplePaymentLink(state(),noHint,{now}).shop.id,shop.id);
});
test('expired, cancelled, paid and processing sample requests cannot reopen as payable QRs',()=>{
 for(const status of ['cancelled','paid','expired']){const saved=state();saved.requests[0].status=status;assert.throws(()=>resolveSamplePaymentLink(saved,fixed(),{now}),/expired, been paid or been cancelled/)}
 const expired=state();expired.requests[0].expiresAt=new Date(now).toISOString();assert.throws(()=>resolveSamplePaymentLink(expired,fixed(),{now}),/expired/);
 for(const status of ['paid','processing']){const saved=state();saved.transactions.push({requestId:request.id,status});assert.throws(()=>resolveSamplePaymentLink(saved,fixed(),{now}),/already has a payment/)}
});
test('registered quote responses cannot remove or replace a fixed amount',()=>{
 const intent={...fixed(),workspace:'registered'};
 const quote={shop:{...shop},request:{...request}};
 assert.equal(validateMerchantPaymentQuote(intent,quote,{now}),quote);
 for(const altered of [{...quote,request:null},{...quote,request:{...request,id:'another-request'}},{...quote,request:{...request,amount:2600}},{...quote,shop:{...shop,id:'pentagon'}}])assert.throws(()=>validateMerchantPaymentQuote(intent,altered,{now}),/request|shop|amount/);
 assert.throws(()=>validateMerchantPaymentQuote(parse('/?pay=night-market'),quote,{now}),/different payment request/);
});
test('ambiguous, malformed and external links fail before any quote or payment opens',()=>{
 for(const query of ['pay=night-market&request=request-25&request=other','pay=night-market&amount=2&amount=3&request=request-25','pay=night-market&workspace=sample&workspace=registered','pay=night-market&request=request-25&amount=25.00','pay=night-market&request=request-25&amount=0','pay=night-market&request=','pay=night-market&testKey=short'])assert.throws(()=>parse('/?'+query));
 assert.throws(()=>parseMerchantPaymentLink('https://evil.test/?pay=night-market',{origin}),/not a QR from this Lumo prototype/);
 assert.throws(()=>parseMerchantPaymentLink(origin+'/?pay=night-market#request=request-25',{origin}));
 assert.throws(()=>parseMerchantPaymentLink('javascript:alert(1)',{origin}));
});
test('quote parameters retain request and private test key but do not trust the URL amount',()=>{
 const intent=parse('/?pay=night-market&request=request-25&amount=2500&testKey='+'a'.repeat(64));
 const query=merchantQuoteParams(intent);assert.equal(query.get('requestId'),request.id);assert.equal(query.get('shopId'),shop.id);assert.equal(query.get('testKey'),'a'.repeat(64));assert.equal(query.has('amount'),false);
});
