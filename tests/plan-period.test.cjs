/* Explicit plan periods are optional metadata, never a balance or forecast input. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'../dist/plan-setup.js'),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-10-17T12:00:00Z']));}static now(){return new Date('2026-10-17T12:00:00Z').getTime();}}
const fresh=()=>({balance:1000,allowance:{amount:1200,date:'2026-10-27',source:'Family'},essentials:[],goals:[],txs:[]});
const setup=initial=>{
 const elements=new Map(),saved=[],errors=[];
 const L={state:copy(initial||fresh()),route:'home',params:{},views:{},e:String,money:n=>'GHS '+Number(n).toFixed(2),
  field:(label,id,placeholder='',type='text',value='')=>`<label for="${id}">${label}</label><input id="${id}" value="${value||''}" type="${type}" autocomplete="off">`,
  header:(a,b='')=>`<h1>${a}</h1><p>${b}</p>`,btn:(a,b)=>`<button onclick="${b}">${a}</button>`,icon:()=>'',
  value:id=>String(elements.get(id)?.value||'').trim(),save:()=>saved.push(copy(L.state)),error:message=>errors.push(message),
  toast(){},render(){},id:()=>String(Math.random()),balances:()=>({available:L.state.balance}),
  go(route){L.beforeNavigate?.(route,{});L.route=route;}
 };
 const context={L,Date:Clock,document:{getElementById:id=>elements.get(id)||null}};vm.createContext(context);vm.runInContext(source,context);
 return {L,elements,saved,errors,set:(id,value)=>elements.set(id,{value:String(value)})};
};
const check=(name,fn)=>{fn();console.log('PASS '+name);};
check('Existing plans get an unspecified period even with a known future allowance',()=>{
 const {L}=setup();assert.deepEqual(copy(L.state.planHorizon),{mode:'unspecified',date:''});assert.equal(L.planPeriodLabel(),'Plan period not set');
 L.route='planSetup';L.views.planSetup();assert.equal(L.state.planDraft.planHorizon.mode,'unspecified');
});
check('Period selection and essential fields recover after navigation and reload without changing the saved plan',()=>{
 const h=setup(),{L,set}=h;L.route='firstEssentials';L.views.firstEssentials();
 set('firstEssName','Weekly food');set('firstEssAmount','150');set('firstPlanPeriodMode','date');set('firstPlanPeriodDate','2026-10-24');
 L.beforeNavigate('help');assert.equal(L.state.planDraft.essentialFields.name,'Weekly food');assert.equal(L.state.planDraft.planHorizon.date,'2026-10-24');
 assert.equal(L.state.planHorizon.mode,'unspecified');assert.equal(L.state.essentials.length,0);
 const recovered=setup(L.state);recovered.L.route='firstEssentials';const html=recovered.L.views.firstEssentials();
 assert(html.includes('value="2026-10-24"'));assert(html.includes('Weekly food'));assert(html.includes('How long should this plan cover?'));
});
check('Choosing a date renders an empty date field, and clearing it is not silently ignored',()=>{
 const {L,set}=setup();L.route='firstEssentials';L.views.firstEssentials();set('firstEssName','');set('firstPlanPeriodMode','date');L.changePlanPeriod();
 assert(L.views.firstEssentials().includes('id="firstPlanPeriodDate"'));assert.equal(L.state.planDraft.planHorizon.date,'');
 set('firstPlanPeriodDate','2026-10-24');L.capturePlanPeriod();set('firstPlanPeriodDate','');L.capturePlanPeriod();assert.equal(L.state.planDraft.planHorizon.date,'');
});
check('Past dates and impossible dates are rejected before advancing or changing a saved period',()=>{
 const {L,set,errors}=setup();L.route='firstEssentials';L.views.firstEssentials();set('firstEssName','');set('firstEssAmount','');set('firstPlanPeriodMode','date');set('firstPlanPeriodDate','2026-10-16');
 L.firstPlanNextGoal();assert.equal(L.route,'firstEssentials');assert(errors.length);assert.equal(L.state.planHorizon.mode,'unspecified');
 L.route='planPeriod';L.views.planPeriod();set('planPeriodMode','date');set('planPeriodDate','2027-02-30');L.savePlanPeriod();assert.equal(L.route,'planPeriod');assert.equal(L.state.planHorizon.mode,'unspecified');
});
check('Unknown period saves without inventing a date, and balance math stays untouched',()=>{
 const {L,set}=setup();L.route='planPeriod';L.views.planPeriod();set('planPeriodMode','unspecified');L.savePlanPeriod();
 assert.deepEqual(copy(L.state.planHorizon),{mode:'unspecified',date:''});assert.equal(L.state.balance,1000);assert.equal(L.state.allowance.date,'2026-10-27');assert.equal(L.planPeriodLabel(),'Plan period not set');
});
check('Expected income is an explicit choice and remains distinct from a specific date',()=>{
 const {L,set}=setup();L.route='planPeriod';L.views.planPeriod();set('planPeriodMode','allowance');L.savePlanPeriod();
 assert.deepEqual(copy(L.state.planHorizon),{mode:'allowance',date:'2026-10-27'});assert.equal(L.planPeriodLabel(),'Through 27 Oct');
 L.state.allowance.date='2026-10-30';assert.equal(L.state.planHorizon.date,'2026-10-27','Changing the income estimate must not silently change an already confirmed period');
 L.route='planPeriod';L.views.planPeriod();set('planPeriodMode','date');set('planPeriodDate','2026-10-27');L.savePlanPeriod();
 assert.deepEqual(copy(L.state.planHorizon),{mode:'date',date:'2026-10-27'});
 L.state.planHorizon={mode:'date',date:'2026-10-16'};assert.equal(L.planPeriodLabel(),'Plan ended 16 Oct');
});
check('An unknown, current or past income date cannot become an allowance period',()=>{
 for(const date of ['', '2026-10-17','2026-10-16']){
  const state=fresh();state.allowance.date=date;const {L,set}=setup(state);L.route='planPeriod';const html=L.views.planPeriod();
  assert(!html.includes('value="allowance"'),'Unavailable income-based period is omitted until a future date exists');set('planPeriodMode','allowance');L.savePlanPeriod();assert.equal(L.route,'planPeriod');assert.equal(L.state.planHorizon.mode,'unspecified');
 }
});
check('First plan save commits income, essentials, goals and period together only after validation',()=>{
 const {L}=setup();L.route='firstPlanReview';L.views.firstPlanReview();
 Object.assign(L.state.planDraft,{allowance:{amount:700,date:'2026-10-27',source:'Work'},essentials:[{id:'food',name:'Food',amount:100,paid:0,date:'2026-10-20'}],goals:[{id:'g',name:'Laptop',target:500,allocated:100}],planHorizon:{mode:'date',date:'2026-10-16'}});
 L.saveFirstPlan();assert.equal(L.state.allowance.amount,1200);assert.equal(L.state.essentials.length,0);assert.equal(L.state.goals.length,0);assert.equal(L.state.planHorizon.mode,'unspecified');assert(L.state.planDraft);
 L.state.planDraft.planHorizon.date='2026-10-24';L.saveFirstPlan();assert.equal(L.route,'home');assert.equal(L.state.allowance.amount,700);assert.equal(L.state.essentials[0].date,'2026-10-20');assert.equal(L.state.goals[0].allocated,100);assert.deepEqual(copy(L.state.planHorizon),{mode:'date',date:'2026-10-24'});assert.equal(L.state.planDraft,null);assert.equal(L.state.balance,1000);
});
check('Period editing survives Back and Cancel leaves the saved period unchanged',()=>{
 const {L,set}=setup();L.route='planPeriod';L.views.planPeriod();set('planPeriodMode','date');set('planPeriodDate','2026-10-24');L.beforeNavigate('help');L.route='help';L.go('planPeriod');
 assert(L.views.planPeriod().includes('value="2026-10-24"'));L.cancelPlanPeriod();assert.equal(L.state.planHorizon.mode,'unspecified');assert.equal(L.state.planPeriodDraft,null);
});
