/* The benefit example must explain the saved-plan consequence without touching money.
   This VM suite exercises the cost-first plan module and its explanation entry. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const dir=path.join(__dirname,'../dist');
const copy=value=>JSON.parse(JSON.stringify(value));
const fresh=()=>({onboarded:true,locked:false,closed:false,balance:71.23,allowance:{amount:0,date:'',source:'Family'},essentials:[],goals:[],txs:[],planSaved:false,paymentDraft:{id:'untouched-payment',amount:12.34,name:'Ama'}});
const harness=initial=>{
 const elements=new Map(),navigations=[],guards=[],errors=[];let html='',saves=0;
 const L={state:copy(initial||fresh()),route:'home',params:{},views:{home:()=>'<h1>Home</h1>',plan:()=>'<h1>My plan</h1>',welcome:()=>'<h1>Welcome</h1>',signin:()=>'<h1>Sign in</h1>',accountInfo:()=>'<h1>Account</h1>'},e:String,
  money:value=>'GH₵'+Number(value).toFixed(2),icon:()=>'<svg aria-hidden="true"></svg>',header:(title,sub='')=>`<h1>${title}</h1><p>${sub}</p>`,
  btn:(label,action,kind='primary')=>`<button type="button" class="${kind}" onclick="${action}">${label}</button>`,
  field:(label,id,placeholder='',type='text',value='')=>`<label for="${id}">${label}</label><input id="${id}" value="${value}" type="${type}" autocomplete="off">`,
  illustration:kind=>`<figure class="scene-art" data-art="${kind}" aria-hidden="true"></figure>`,
  value:id=>String(elements.get(id)?.value||'').trim(),save:()=>{saves++;},error:message=>errors.push(message),toast(){},id:()=>String(Math.random()),balances:()=>({available:L.state.balance}),
  guard(){guards.push(L.route);if(['planSetup','firstEssentials','firstGoal','firstPlanReview'].includes(L.route)&&(!L.state.onboarded||L.state.locked||L.state.closed))L.route=L.state.closed?'accountInfo':'signin';},
  render(){L.guard();html=L.views[L.route]?.()||'';},
  go(route,params={}){L.beforeNavigate?.(route,params);L.route=route;L.params=params;navigations.push(route);L.render();}
 };
 L.onboarding={start:()=>L.go('phone')};
 const context={L,Date,window:{addEventListener(){}},document:{getElementById:id=>elements.get(id)||null}};
 vm.createContext(context);
 for(const name of ['pause-engine.js','plan-impact.js','plan-setup.js','plan-benefit.js'])vm.runInContext(fs.readFileSync(path.join(dir,name),'utf8'),context,{filename:name});
 const click=label=>{
  const button=[...html.matchAll(/<button\b[^>]*onclick="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)].find(match=>match[2].replace(/<[^>]+>/g,'')===label);
  assert(button,'Missing action '+label+' on '+L.route);vm.runInContext(button[1],context);
 };
 return {L,html:()=>html,click,navigations,guards,errors,set:(id,value)=>elements.set(id,{value:String(value)}),saves:()=>saves};
};
const check=(label,fn)=>{fn();console.log('PASS '+label);};

check('The first setup entry explains a plan before an optional, isolated example and creates no draft',()=>{
 const h=harness(),{L}=h,before=JSON.stringify(L.state),saves=h.saves();
 L.go('planSetup');assert.equal(L.route,'planBenefit');assert.equal(JSON.stringify(L.state),before);assert.equal(h.saves(),saves);assert(!L.state.planDraft);
 const html=h.html();assert.equal((html.match(/data-art=/g)||[]).length,1);assert.match(html,/data-art="pause"/);
 for(const label of ['What is a plan?','A plan lists the costs your money needs to cover','Lumo uses your plan to:','Show what’s left.','Show what a payment changes.','Creating a plan doesn’t move or lock your money.','Example only','not your balance','Start with one cost','Maybe later'])assert(html.includes(label),label);
 assert(!html.includes('A SAMPLE PAUSE'));assert(!/<h1>Food and transport/.test(html));
 const sample=html.match(/<details\b([^>]*)class="optional-fields plan-benefit-example"([^>]*)>([\s\S]*?)<\/details>/);assert(sample,'Worked example lives in its own disclosure');assert(!/\bopen\b/.test(sample[1]+sample[2]));assert(sample[3].includes('<summary>See an example</summary>'));
 assert(html.indexOf('What is a plan?')<html.indexOf('See an example'));assert(sample[3].includes('Food and transport would be GH₵30.00 short.'));
 assert(html.includes('Food and transport would be GH₵30.00 short.'));
 assert(html.includes('GH₵600.00 available − GH₵350.00 essentials − GH₵100.00 for a laptop = GH₵150.00 left after the plan.'));
 assert(html.includes('GH₵280.00 purchase'));assert.match(html,/Account after purchase<\/dt><dd>GH₵320.00/);
 assert(html.includes('GH₵100.00 uncovered'));assert(html.includes('GH₵130.00 altogether'));
 assert(!html.includes('71.23'));assert(!html.includes('12.34'));assert(!html.includes('untouched-payment'));
 L.views.planBenefit();L.views.planBenefit();assert.equal(JSON.stringify(L.state),before,'Repeated renders cannot save sample money, example goals or a payment');
 h.click('Maybe later');assert.equal(L.route,'home');assert.equal(JSON.stringify(L.state),before);assert.equal(h.saves(),saves);
});

check('The fresh main path has costs and review, with one atomic final save',()=>{
 const h=harness(),{L}=h;L.openPlanBenefit();assert.equal(L.route,'planBenefit');h.click('Start with one cost');
 assert.equal(L.route,'firstEssentials');assert(L.state.planDraft);assert.match(h.html(),/1 of 2/);
 assert.equal(L.state.balance,71.23);assert.equal(L.state.essentials.length,0);assert.equal(L.state.goals.length,0);
 h.set('firstEssName','Food');h.set('firstEssAmount','20');L.reviewFirstPlanCosts();assert.equal(L.route,'firstPlanReview');assert.match(h.html(),/2 of 2/);
 assert.equal(L.state.planSaved,false);L.saveFirstPlan();assert.equal(L.route,'home');assert.equal(L.state.planSaved,true);assert.equal(L.state.essentials.length,1);assert.equal(L.state.balance,71.23);assert.equal(L.state.paymentDraft.id,'untouched-payment');
 assert.equal(h.errors.length,0);
});

check('Returning drafts resume directly without replaying the example or discarding unfinished fields',()=>{
 for(const step of ['planSetup','firstEssentials','firstGoal','firstPlanReview']){
  const state=fresh();state.planDraft={step,allowance:{amount:500,date:'',source:'Family'},essentials:[],goals:[],planHorizon:{mode:'unspecified',date:''},goalFields:{name:'My laptop',target:'3500',allocated:''}};
  const h=harness(state);h.L.openPlanBenefit();assert.equal(h.L.route,step);assert(!h.navigations.includes('planBenefit'));assert.equal(h.L.state.planDraft.goalFields.name,'My laptop');assert.equal(h.L.state.balance,71.23);
  h.L.go('planSetup');assert.equal(h.L.route,'planSetup','Editing an existing draft must not show the example');
 }
});

check('Saved plans and existing commitments do not acquire a compulsory benefit screen',()=>{
 for(const patch of [{planSaved:true},{essentials:[{id:'food',name:'Food',amount:20,paid:0}]},{goals:[{id:'laptop',name:'Laptop',target:100,allocated:10}]}]){
  const h=harness({...fresh(),...patch});h.L.openPlanBenefit();assert.equal(h.L.route,'plan');assert(!h.navigations.includes('planBenefit'));
  h.L.go('planSetup');assert.equal(h.L.route,'planSetup');assert(!h.navigations.includes('planBenefit'));
 }
});

check('The education example is public, pre-account Build starts onboarding, and saved accounts retain access checks',()=>{
 for(const patch of [{onboarded:false},{locked:true},{closed:true}]){
  const h=harness({...fresh(),...patch}),before=JSON.stringify(h.L.state);h.L.openPlanBenefit();assert.equal(h.L.route,'planBenefit');assert.equal(JSON.stringify(h.L.state),before);
  assert(!h.guards.includes('planBenefit'),'No financial guard state is needed to view fixed sample figures');
  h.click('Start with one cost');assert.equal(h.L.route,patch.closed?'accountInfo':patch.locked?'signin':'phone');assert.equal(h.L.state.planDraft,undefined);assert.equal(h.L.state.balance,71.23);
  h.L.go('planBenefit');h.click('Maybe later');assert.equal(h.L.route,patch.closed?'accountInfo':patch.locked?'signin':'welcome');
 }
});

check('Leaving the example does not authorize another fresh first-plan entry',()=>{
 const h=harness();h.L.openPlanBenefit();h.click('Maybe later');h.L.go('planSetup');assert.equal(h.L.route,'planBenefit');assert(!h.L.state.planDraft);
});
console.log('All plan benefit checks passed.');
