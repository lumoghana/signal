/* Plain language must preserve the shared calculation and saved conversations. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(patch={}){
 const h=createHarness(),{L}=h;L.explore();
 Object.assign(L.state,{balance:600,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:200,paid:0},{id:'transport',name:'Transport',amount:150,paid:0}],goals:[{id:'laptop',name:'Laptop',target:3500,allocated:100}],allowance:{amount:0,date:''},chats:[],...patch});
 L.route='home';L.params={};L.render();h.flush();return h;
}
const plain=reply=>[reply.text,...reply.calculation.rows.flat(),...reply.calculation.notes].join(' ');
const clean=h=>assert.deepEqual(h.errors,[]);
check('Pause and Chat describe the same essentials-first shortfall in plain goal language',()=>{
 const h=fixture(),{L}=h,before=copy(L.state),impact=L.planImpactSummary(280),reply=L.chatAnswer('Can I spend GH₵280?');
 assert.equal(reply.headline,impact.headline);assert.equal(reply.support,impact.goalExplanation);
 assert.equal(impact.essentialGap,30);assert.equal(impact.goalGap,100);assert.equal(impact.totalGap,130);
 assert.equal(impact.goalExplanation,'Money set aside for Laptop: GH₵100.00 uncovered after essentials.');
 assert.equal(reply.calculation.rows.find(([label])=>label==='Money set aside for goals')[1],'GH₵100.00');
 assert.equal(reply.calculation.rows.find(([label])=>label==='Goal money uncovered')[1],'GH₵100.00');
 assert(plain(reply).includes('Only the payment total leaves your account.'));
 assert(!/allocat/i.test(plain(reply)));assert.deepEqual(copy(L.state),before);clean(h);
});
check('A goal-only consequence retains actual coverage and safely escapes a goal name',()=>{
 const h=fixture(),{L}=h;L.state.goals[0].name='<Study laptop>';
 const impact=L.planImpactSummary(200),comparison=L.pauseComparison(impact),markup=L.pauseComparisonMarkup(impact);
 assert.equal(impact.after,400);assert.equal(impact.essentialGap,0);assert.equal(impact.goalGap,50);
 assert.equal(comparison.before,100);assert.equal(comparison.after,50);
 assert.equal(comparison.label,'<Study laptop> money covered');
 assert(markup.includes('&lt;Study laptop&gt; money covered'));assert(!markup.includes('<Study laptop>'));
 assert(!/allocation/i.test(markup));clean(h);
});
check('Covered Chat answers explain the limited scope of one saved cost',()=>{
 const h=fixture({essentials:[{id:'food',name:'Food',amount:50,paid:0}],goals:[]}),{L}=h;
 const reply=L.chatAnswer('Can I spend GH₵80?');
 assert.equal(reply.planImpact.after,520);assert.equal(reply.planImpact.room,470);
 assert.equal(reply.support,'Based on your 1 saved cost. Other costs aren’t included.');
 assert(reply.calculation.notes.some(note=>note.includes('Based on your 1 saved cost.')));
 assert(!plain(reply).includes('cost..'));assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,0);clean(h);
});
check('Zero-valued costs cannot make Chat claim it has assessed affordability',()=>{
 const h=fixture({essentials:[{id:'food',name:'Food',amount:0,paid:0}]}),reply=h.L.chatAnswer('Can I spend GH₵80?');
 assert(reply.headline.includes('I can’t assess affordability yet.'));assert.equal(reply.route,'essentials');
 assert(!reply.headline.includes('Your plan stays covered.'));clean(h);
});
check('Saved replies retain their wording and arithmetic when new replies use plain language',()=>{
 const h=fixture(),{L}=h;
 const legacy={q:'Can I spend GH₵280?',headline:'Food and transport would be GH₵30.00 short.',support:'Laptop allocation: GH₵100.00 uncovered after essentials.',text:'Food and transport would be GH₵30.00 short. Laptop allocation: GH₵100.00 uncovered after essentials.',intent:'affordability',planImpact:{amount:280},calculation:{rows:[['Goal allocation uncovered','GH₵100.00']],notes:['Saved example.']}};
 L.state.chats=[copy(legacy)];L.go('chat');h.flush();
 assert.deepEqual(copy(L.state.chats[0]),legacy);assert(h.document.getElementById('view').textContent.includes('Laptop allocation:'));
 const reply=L.chatAnswer('Can I spend GH₵280?');assert(reply.support.startsWith('Money set aside for Laptop:'));
 assert.deepEqual(copy(L.state.chats[0]),legacy);assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,0);clean(h);
});
console.log(passed+' plain-language and saved-conversation checks passed.');
