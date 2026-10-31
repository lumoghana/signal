/* Money Story, search and activity drill-downs must describe the same completed spending. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const DAY=86400000,NOW=Date.parse('2026-10-17T18:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let typed='',lastNavigation;
const L={
 state:{txs:[],chats:[]},params:{},route:'activity',views:{more:()=>'',chat:()=>''},
 e:escape,money:value=>'GHS'+Number(value).toFixed(2),
 btn:(label,action,kind='primary')=>`<button class="${kind}" onclick="${escape(action)}">${label}</button>`,
 row:(name,sub,icon,action,total)=>`<button class="row" onclick="${escape(action)}"><strong>${escape(name)}</strong><small>${escape(sub)}</small><span>${escape(total)}</span></button>`,
 header:(title,sub)=>`<h1>${title}</h1><p>${sub}</p>`,icon:()=>'<svg></svg>',
 decorateView:html=>html,render(){},value:()=>typed,
 go(route,params={}){this.route=route;this.params=params;lastNavigation={route,params};}
};
const context={L,Date:Clock,console,document:{getElementById:()=>null},window:{addEventListener(){}}};
vm.createContext(context);
for(const file of ['compact.js','chat-coach.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),context);
const tx=(id,days,amount,extra={})=>({id,name:id,date:new Date(NOW-days*DAY).toISOString(),amount,fee:0,type:'out',status:'success',category:'Food',...extra});
L.state.txs=[
 tx('food-now',1,40,{fee:2,note:'lunch'}),tx('food-pending',1,50,{status:'pending'}),
 tx('food-old',20,80),tx('food-failed',1,70,{status:'failed'}),tx('food-reversed',1,60,{status:'reversed'}),
 tx('food-incoming',1,90,{type:'in'}),tx('food-future',-1,90),tx('transport',1,25,{category:'Transport'})
];
L.params={scope:'spending',filter:'out',days:7,category:'Food'};
const story=L.spendingSummary({days:7,category:'Food',now:NOW});
assert.equal(story.total,42);
let html=L.views.activity();
assert.match(html,/Food · Last 7 days · Completed spending/);
assert.match(html,/Completed spending<\/span><strong>GHS42\.00/);
assert.match(html,/−GHS42\.00/);assert.match(html,/incl\. GHS2\.00 fee/);
for(const name of ['food-pending','food-old','food-failed','food-reversed','food-incoming','food-future','transport'])assert(!html.includes('>'+name+'<'),name+' must not appear');
assert.match(html,/Show all activity/);assert.match(html,/L\.go\(&#39;activity&#39;,\{\}\)/);
assert.match(html,/onsubmit="event.preventDefault\(\);L.searchActivity\(\)"/);
console.log('PASS completed Food spending equals Story GHS42, including fee, with status/date/category exclusions');

typed='food';L.searchActivity();
assert.equal(lastNavigation.params.scope,'spending');assert.equal(lastNavigation.params.days,7);assert.equal(lastNavigation.params.category,'Food');assert.equal(lastNavigation.params.query,'food');assert.equal(lastNavigation.params.page,0);
html=L.views.activity();assert.match(html,/Matching completed spending<\/span><strong>GHS42\.00/);assert(!html.includes('>food-old<'));assert(!html.includes('>food-pending<'));
L.updateActivity({days:30});assert.equal(L.params.scope,'spending');assert.equal(L.params.category,'Food');assert.equal(L.params.query,'food');
html=L.views.activity();assert.match(html,/GHS122\.00/);assert.match(html,/>food-old</);assert(!html.includes('>food-pending<'));
L.updateActivity({category:''});assert.equal(L.params.days,30);assert.equal(L.params.scope,'spending');assert.equal(L.params.query,'food');
L.updateActivity({query:''});assert.match(L.views.activity(),/GHS147\.00/);
console.log('PASS search, period changes and category reset retain compatible spending scope');

// Every displayed page uses the full scope and the total never becomes a page subtotal.
L.state.txs=[...Array.from({length:7},(_,i)=>tx('meal-'+i,1,10)),tx('meal-pending',0,999,{status:'pending'})];
L.params={scope:'spending',days:7,category:'Food',query:'meal'};
html=L.views.activity();assert.match(html,/GHS70\.00/);assert.match(html,/1 \/ 2/);
L.turnPage(1);assert.equal(L.params.scope,'spending');assert.equal(L.params.days,7);assert.equal(L.params.category,'Food');assert.equal(L.params.query,'meal');
html=L.views.activity();assert.match(html,/GHS70\.00/);assert.match(html,/2 \/ 2/);assert(!html.includes('>meal-pending<'));
L.updateActivity({query:'not found'});html=L.views.activity();assert.match(html,/GHS0\.00/);assert.match(html,/Nothing here yet/);assert.equal(L.params.page,0);
console.log('PASS paging, totals and empty searches remain scoped');

L.go('activity',{});html=L.views.activity();assert.match(html,/>meal-pending</);assert.match(html,/Being checked/);assert.doesNotMatch(html,/Completed spending<\/span><strong>/);
L.updateActivity({filter:'pending'});html=L.views.activity();assert.match(html,/>meal-pending</);assert(!html.includes('>meal-0<'));
console.log('PASS ordinary activity retains all-status history and Pending filter');

const form='<label class="field" for="payment-note">Note<input id="payment-note"></label><label class="field">Cover a planned essential<select id="payment-essential"><option>Food</option></select></label>';
const decorated=L.decorateView(form,'send');
assert.match(decorated,/<summary>Add a note<\/summary>/);
assert(decorated.indexOf('</details>')<decorated.indexOf('Cover a planned essential'));
assert.doesNotMatch(decorated,/Add a note or link an essential/);
console.log('PASS planned essential remains visible while only optional note is collapsed');
