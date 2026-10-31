const test=require('node:test');
const {checks}=require('../scripts/check-edition-parity.cjs');
for(const [name,check] of checks) test('edition contract: '+name,()=>check());
