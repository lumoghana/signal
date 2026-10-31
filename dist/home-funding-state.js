/* Home's main action changes after money has actually arrived. This remembers
   that milestone without changing balances, payment outcomes or destinations. */
(()=>{
'use strict';
const received=t=>t?.type==='in'&&t.status==='success'&&Number(t.amount)>0&&!t.internal&&!t.internalTransfer&&!L.isInternalTransfer?.(t);
L.hasFundedOperationalAccount=(s=L.state)=>{
 if(!s?.onboarded)return false;
 L.ensureAccounts?.(s);
 const account=s.accounts?.operational;if(!account)return false;
 if(account.hasBeenFunded===true)return true;
 // v13 migration recorded the confirmed opening money before moving its goal
 // allocations into savings. That is evidence of an existing funded account,
 // including a student who has since spent their operational balance.
 const opening=Number(s.accounts?.migration?.operationalBefore);
 if((Number.isFinite(opening)&&opening>0)||(s.txs||[]).some(received)){
  account.hasBeenFunded=true;return true;
 }
 return false;
};
// Both immediate credits and later pending→success resolution already call
// save. Observe them here before the existing persistence step; a wallet
// approval, incoming expectation or internal withdrawal never sets the flag.
const save=L.save;
L.save=function(){L.hasFundedOperationalAccount();return save.apply(this,arguments);};
L.hasFundedOperationalAccount();
})();
