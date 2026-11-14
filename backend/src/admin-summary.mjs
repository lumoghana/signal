// Reuse the approved consumer domain calculations. This adapter runs only on
// the staff server; neither the canonical snapshot nor private state is returned.
import {buildState} from '../supabase/functions/lumo-approved/engine.mjs';
import {getSummary} from '../supabase/functions/lumo-approved/domain/model.js';
export function adminMoneySummary(snapshot,now=new Date()){
 if(!snapshot?.ok||!snapshot?.account)throw Error('Summary unavailable');
 const state=buildState(snapshot),s=getSummary(state,now);
 const keys=['available','planned','spendable','savings','transferHolds','pendingPaymentHolds','pendingCardHolds','pendingContributionHolds','cardBalance','outsideTotal','expected','daysLeft','dailyAllowance'];
 const result={};for(const key of keys)result[key]=Number.isSafeInteger(s[key])?s[key]:0;
 return {...result,leftAfterPlan:result.spendable,buffer:Math.max(0,Math.trunc(Number(state.buffer)||0)),currency:'GHS',unit:'pesewas',guidanceDate:s.guidanceDate||null,guidanceSource:s.guidanceSource||null,hasDailyGuide:s.hasDailyGuide===true,calculatedAt:now.toISOString(),calculationSource:'Approved consumer money domain',explanation:'Everyday balance minus outstanding commitments and buffer gives left after plan. Money Boxes, group funds, expected income and manually recorded outside money are not added to spendable funds.'};
}
