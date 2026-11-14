import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaymentLinkSharing,publicCheckoutURL,paymentShareMessage,shareTargets,paymentCardSVG} from '../dist/share-payment-link.js';

const token='a'.repeat(64),url=`https://lumo-connected-pilot.vercel.app/checkout.html?link=${token}`;
const link={id:'link-a',url,publicToken:token,merchantName:'Ama’s Kitchen',shopName:'Night Market',shopId:'shop-a',description:'Order 204 · Lunch',amount:2500,expiresAt:'2099-11-14T10:15:00Z',status:'open',kind:'request',requestId:'request-a'};
const click=(view,action,extra={})=>view.handleClick({dataset:{action:'share-'+action,...extra}});
function fixture(extra={}) {
 const data=new Map(),calls=[],opened=[],shares=[];let identity='owner-a';
 const storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const config={storage,getIdentity:()=>identity,getMerchantName:()=>link.merchantName,formData:form=>Object.entries(form),createLink:async payload=>{calls.push(payload);return {link}},listLinks:async()=>({links:[link]}),openExternal:target=>opened.push(target),navigator:{share:async data=>shares.push(data),clipboard:{writeText:async()=>{}}},...extra};
 const view=createPaymentLinkSharing(config);view.open({shop:{id:'shop-a',name:'Night Market'},amount:2500,description:'Order 204 · Lunch'});
 return {view,config,data,calls,opened,shares,switchIdentity:value=>{identity=value}};
}

test('only canonical public checkout capabilities can be shared',()=>{
 assert.equal(publicCheckoutURL(url),url);
 for(const value of [url+'&testKey=private',url+'&phone=0245550100',url+'&link='+token,url+'#private',url.replace('https:','http:'),url.replace('/checkout.html','/'),url.replace('lumo-connected-pilot.vercel.app','example.test'),'javascript:alert(1)'])assert.throws(()=>publicCheckoutURL(value));
});

test('editable share messages and destination fallbacks retain merchant, purpose, fixed amount and public URL',()=>{
 const message=paymentShareMessage(link);assert.match(message,/Ama’s Kitchen · Night Market/);assert.match(message,/Order 204/);assert.match(message,/GH₵25.00/);assert.ok(message.endsWith(url));
 const targets=shareTargets('My edited note',url);assert.equal(new URL(targets.whatsapp).searchParams.get('text'),'My edited note\n'+url);assert.match(decodeURIComponent(targets.email),/My edited note/);assert.ok(targets.text.endsWith(url));
 assert.match(paymentShareMessage({...link,amount:null}),/Choose your amount/);
});

test('link preparation is separate from the native share gesture and never sends automatically',async()=>{
 const f=fixture();await f.view.handleSubmit({paymentShareAmount:'25.00',paymentSharePurpose:'Order 204',paymentShareValidity:'7d'});
 assert.equal(f.calls.length,1);assert.equal(f.shares.length,0);assert.equal(f.calls[0].amount,2500);assert.equal(f.calls[0].validity,'7d');assert.ok(f.calls[0].attemptId);
 f.view.handleChange({name:'paymentShareMessage',value:'Order ready for you.'});await click(f.view,'native');assert.equal(f.shares.length,1);assert.equal(f.shares[0].url,url);assert.match(f.shares[0].text,/Order ready/);assert.doesNotMatch(f.view.render(),/Payment sent|Link sent|Successfully shared/);
});

test('cancelling native sharing leaves the original server link intact without creating another request',async()=>{
 const f=fixture({navigator:{share:async()=>{throw new DOMException('Cancelled','AbortError')}}});await f.view.handleSubmit({paymentShareAmount:'25.00'});await click(f.view,'native');
 assert.equal(f.calls.length,1);assert.equal(f.view.getLink().id,link.id);assert.match(f.view.render(),/Share cancelled/);assert.match(f.view.render(),/still ready/);
});

test('WhatsApp and email open a draft destination and never claim the message was sent',async()=>{
 const f=fixture();await f.view.handleSubmit({paymentShareAmount:'25.00'});await click(f.view,'whatsapp');assert.ok(f.opened[0].startsWith('https://wa.me/'));assert.match(f.view.render(),/Continue in WhatsApp to complete sending/);await click(f.view,'email');assert.ok(f.opened[1].startsWith('mailto:'));assert.doesNotMatch(f.view.render(),/Message sent|Successfully shared/);
});

test('copy fallback keeps a selectable public URL when clipboard access fails',async()=>{
 const f=fixture({navigator:{clipboard:{writeText:async()=>{throw Error('Select the link below to copy it.')}}}});await f.view.handleSubmit({paymentShareAmount:'25.00'});await click(f.view,'copy');assert.match(f.view.render(),/Select the link below/);assert.ok(f.view.render().includes(`value="${url}" readonly`));
});

test('an interrupted creation retries its original reference after reload rather than producing another link',async()=>{
 const f=fixture();let first=true;f.config.createLink=async payload=>{f.calls.push(payload);if(first){first=false;throw Error('Response lost')}return {link}};
 await f.view.handleSubmit({paymentShareAmount:'25.00',paymentSharePurpose:'Order 204'});assert.match(f.view.render(),/Retrieve payment link/);assert.equal(f.data.size,1);
 const reopened=createPaymentLinkSharing(f.config);reopened.open({shop:{id:'shop-a',name:'Night Market'}});await reopened.handleSubmit({paymentShareAmount:'99.00'});assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(f.calls[1].amount,2500);assert.equal(f.data.size,0);
});

test('account switching hides an old link and drops delayed responses and share drafts',async()=>{
 let resolve;const pending=new Promise(yes=>{resolve=yes});const f=fixture({createLink:()=>pending});const preparing=f.view.handleSubmit({paymentShareAmount:'25.00'});f.switchIdentity('cashier-b');resolve({link});await preparing;assert.equal(f.view.getLink(),null);assert.doesNotMatch(f.view.render(),/Order 204|checkout.html|Ama’s Kitchen/);await click(f.view,'native');assert.equal(f.shares.length,0);
});

test('fixed counter shares keep the original amount, request and expiry without extending into an online order',async()=>{
 const f=fixture();const request={id:'request-a',shopId:'shop-a',amount:1234,description:'Counter purchase',status:'open',expiresAt:'2099-11-14T10:15:00Z'};f.view.open({shop:{id:'shop-a',name:'Night Market'},request});await f.view.handleSubmit({paymentShareAmount:'99.00',paymentShareValidity:'7d'});assert.equal(f.calls[0].requestId,request.id);assert.equal(f.calls[0].amount,undefined);assert.equal(f.calls[0].validity,undefined);assert.match(f.calls[0].description,/Counter purchase/);
});

test('paid, cancelled and expired requests cannot be prepared as another payment',async()=>{
 for(const request of [{status:'paid',expiresAt:'2099-01-01'},{status:'cancelled',expiresAt:'2099-01-01'},{status:'open',expiresAt:'2020-01-01'}]){const f=fixture();f.view.open({shop:{id:'shop-a'},request:{id:'old',shopId:'shop-a',amount:2500,...request}});await f.view.handleSubmit({});assert.equal(f.calls.length,0);assert.match(f.view.render(),/already been paid|cancelled|expired/);}
});

test('sample merchants cannot create a link that claims to work across connected phones',async()=>{
 const f=fixture({isSample:()=>true});assert.match(f.view.render(),/browser-only sample/);await f.view.handleSubmit({paymentShareAmount:'25.00'});assert.equal(f.calls.length,0);assert.equal(f.view.getLink(),null);
});

test('payment cards contain the public checkout QR and escaped merchant text, with no external image content',()=>{
 const card=paymentCardSVG({...link,merchantName:'<script>alert(1)</script>'},'<svg viewBox="0 0 24 24"><path d="M1 1h5v5z"/></svg>');assert.match(card,/&lt;script&gt;/);assert.match(card,/width="720"/);assert.ok(card.includes(url));assert.throws(()=>paymentCardSVG(link,'<svg><image href="https://elsewhere.test/"/></svg>'));
});

test('shared-link history uses the scoped service list and opens the selected existing reference',async()=>{
 const f=fixture({listLinks:async()=>({links:[link,{...link,id:'paid-link',status:'paid',description:'Already paid'}]})});f.view.openList({shop:{id:'shop-a'}});await new Promise(resolve=>setImmediate(resolve));assert.match(f.view.render(),/Already paid/);assert.match(f.view.render(),/paid/);await click(f.view,'open',{id:'paid-link'});assert.equal(f.view.getLink().id,'paid-link');assert.match(f.view.render(),/Share payment link<\/button>/);assert.match(f.view.render(),/disabled/);assert.equal(f.calls.length,0);
});


test('a mismatched server destination or fixed amount cannot become a shareable link',async()=>{
 for(const changed of [{shopId:'other-shop'},{amount:9900},{currency:'USD'},{publicToken:'b'.repeat(64)}]){const f=fixture({createLink:async()=>({link:{...link,...changed}})});await f.view.handleSubmit({paymentShareAmount:'25.00'});assert.equal(f.view.getLink(),null);assert.match(f.view.render(),/did not match|does not match/);assert.match(f.view.render(),/Retrieve payment link/);}
});


test('known unpublished shops explain publication and do not create a public link',async()=>{
 const f=fixture();f.view.open({shop:{id:'shop-a',name:'Private shop',published:false}});assert.match(f.view.render(),/Ask the owner or shop manager to publish/);await f.view.handleSubmit({paymentShareAmount:'25.00'});assert.equal(f.calls.length,0);
});
