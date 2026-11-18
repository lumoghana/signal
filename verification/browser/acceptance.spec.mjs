import {test,expect} from '@playwright/test';

const SHOP='22222222-2222-4222-8222-222222222222',CLAIM='LC1-'+'AB'.repeat(24);
const harness=(scenario='normal')=>'/__fixture/harness.html?scenario='+scenario;
const audit=async page=>JSON.parse(await page.locator('#fixture-audit').textContent());
async function openShop(page){await page.getByRole('button',{name:/Synthetic Campus Kitchen.*Night Market counter/}).click();await expect(page.getByRole('button',{name:'Pay this shop',exact:true})).toBeVisible();}
test.beforeEach(async({page,baseURL})=>{
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===baseURL)return route.continue();return route.abort('blockedbyclient');});
});

test('actual consumer welcome and preview can be entered and exited without signup or a money action',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await expect(page.getByRole('heading',{name:'Your money. Made clear.'})).toBeVisible();await expect(page.getByText('Interactive prototype · No real money.')).toBeVisible();
 await page.getByRole('button',{name:'Explore Lumo',exact:true}).click();await expect(page.getByRole('heading',{name:'A quick look inside.'})).toBeVisible();
 await page.getByRole('button',{name:'Ask Lumo, scene 4 of 6'}).click();await expect(page.getByRole('heading',{name:'Chat with your money.'})).toBeVisible();
 await page.getByRole('button',{name:'Skip',exact:true}).click();await page.getByRole('button',{name:'Back to welcome',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your money. Made clear.'})).toBeVisible();expect(errors).toEqual([]);
});

test('directory button reaches the actual amount screen through an explicit authenticated shop quote',async({page})=>{
 await page.goto(harness());await openShop(page);await page.getByRole('button',{name:'Pay this shop',exact:true}).click();
 await expect(page.getByRole('heading',{name:'How much?'})).toBeVisible();await expect(page.getByText('Synthetic Campus Kitchen',{exact:true})).toBeVisible();
 const a=await audit(page),quotes=a.requests.filter(r=>r.body.action==='quote');expect(quotes.map(r=>r.body)).toEqual([{action:'quote',shopId:SHOP}]);expect(a.wallet).toBe(100000);expect(a.transactions).toBe(0);expect(a.authRequests).toBe(0);
});

test('amount and review recheck receiving identity and stop at real approval boundary without debiting',async({page})=>{
 await page.goto(harness());await openShop(page);await page.getByRole('button',{name:'Pay this shop',exact:true}).click();
 await page.getByRole('textbox',{name:'Payment amount in Ghana cedis'}).fill('5');await page.locator('[data-action="pay-amount-next"]').click();
 await expect(page.getByRole('heading',{name:'All looking right?'})).toBeVisible();await expect(page.getByText('Night Market counter',{exact:true})).toBeVisible();await page.locator('[data-action="pay-review-next"]').click();
 await expect(page.getByRole('status')).toContainText('Approval requested');const a=await audit(page);expect(a.requests.filter(r=>r.body.action==='quote')).toHaveLength(2);expect(a.authRequests).toBe(1);expect(a.wallet).toBe(100000);expect(a.transactions).toBe(0);expect(a.requests.some(r=>r.body.action==='action')).toBe(false);
});

test('paused shops and an unresolved original request cannot start another payment',async({page})=>{
 await page.goto(harness('paused'));await openShop(page);await expect(page.getByRole('button',{name:'Pay this shop',exact:true})).toBeDisabled();expect((await audit(page)).requests.some(r=>r.body.action==='quote')).toBe(false);
 await page.goto(harness('pending'));await openShop(page);await page.getByRole('button',{name:'Pay this shop',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Let’s check the original.'})).toBeVisible();const a=await audit(page);expect(a.paymentReference).toBe('original-reviewed-browser-request');expect(a.requests.some(r=>r.body.action==='quote')).toBe(false);expect(a.wallet).toBe(100000);expect(a.authRequests).toBe(0);
});

test('a delayed old-session quote cannot open a recipient after the synthetic session ends',async({page})=>{
 await page.goto(harness('delayed'));await openShop(page);const response=page.waitForResponse(r=>r.url().includes('/functions/v1/lumo-approved')&&r.request().postDataJSON()?.action==='quote');
 await page.getByRole('button',{name:'Pay this shop',exact:true}).click();await expect.poll(async()=>(await audit(page)).requests.filter(r=>r.body.action==='quote').length).toBe(1);
 await page.getByRole('button',{name:'End synthetic session',exact:true}).click();await response;
 await expect(page.getByRole('heading',{name:'Fixture Home'})).toBeVisible();await expect(page.getByRole('heading',{name:'How much?'})).toHaveCount(0);const a=await audit(page);expect(a.authRequests).toBe(0);expect(a.transactions).toBe(0);
});

test('actual shop rewards retain programme and consent context through Home and Pay',async({page})=>{
 await page.goto(harness());await openShop(page);await page.getByRole('button',{name:'Loyalty & rewards',exact:true}).click();await expect(page.getByText('Kitchen Regulars',{exact:true})).toBeVisible();
 await expect(page.getByRole('checkbox',{name:/Optional/})).not.toBeChecked();await page.getByRole('button',{name:'Home',exact:true}).click();await expect(page.getByRole('heading',{name:'Fixture Home'})).toBeVisible();await page.getByRole('button',{name:'Pay',exact:true}).click();
 await expect(page.getByText('Kitchen Regulars',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Join this programme',exact:true})).toBeVisible();const a=await audit(page),calls=a.requests.filter(r=>r.body.action==='loyalty');expect(calls.length).toBeGreaterThanOrEqual(2);expect(calls.every(r=>r.body.operation==='programme'&&r.body.payload.shopId===SHOP)).toBe(true);expect(a.transactions).toBe(0);
});

test('actual chat and recorded API distinguish incoming IOUs from outgoing debt for the same day',async({page})=>{
 await page.goto(harness());await page.getByRole('button',{name:'Money Chat',exact:true}).click();await page.getByRole('textbox',{name:'Ask about your money'}).fill('What do people owe me today?');await page.getByRole('button',{name:'Send question',exact:true}).click();
 const first=page.locator('.chat-message.assistant').last();await expect(first.getByRole('heading',{name:'Money owed to you.'})).toBeVisible();await expect(first).toContainText('GH₵45.00');await expect(first).not.toContainText('Synthetic Akos');await expect(first).not.toContainText('GH₵999.99');
 await page.getByRole('textbox',{name:'Ask about your money'}).fill('What do I owe today?');await page.getByRole('button',{name:'Send question',exact:true}).click();const second=page.locator('.chat-message.assistant').last();await expect(second.getByRole('heading',{name:'Here is what you owe.'})).toBeVisible();await expect(second).toContainText('GH₵15.00');await expect(second).not.toContainText('Synthetic Esi');
 const a=await audit(page);expect(a.requests.filter(r=>r.path==='/__fixture/lux')).toHaveLength(2);expect(a.wallet).toBe(100000);expect(a.transactions).toBe(0);expect(a.authRequests).toBe(0);
});

test('private membership linking stays out of saved money records and consent remains explicit',async({page})=>{
 await page.goto(harness());await openShop(page);await page.getByRole('button',{name:'Loyalty & rewards',exact:true}).click();await page.getByRole('button',{name:'Link an existing membership instead',exact:true}).click();
 await page.getByRole('textbox',{name:'Private account-linking code'}).fill(CLAIM);await page.getByRole('button',{name:'Check linking code',exact:true}).click();await expect(page.getByRole('heading',{name:'Your existing terms.',exact:true})).toBeVisible();await expect(page.getByText('Five qualifying visits earns five cedis off.',{exact:true})).toBeVisible();
 for(const checkbox of await page.getByRole('checkbox').all())await expect(checkbox).not.toBeChecked();
 const saved=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));expect(saved).not.toContain(CLAIM);expect(saved).not.toContain('claimCode');const a=await audit(page);expect(a.requests.some(r=>r.body.operation==='claim'||r.body.operation==='join'||r.body.action==='action')).toBe(false);expect(a.transactions).toBe(0);
});
