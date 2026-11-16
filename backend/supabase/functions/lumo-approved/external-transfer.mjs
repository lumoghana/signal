/** Explicit personal test-money exit. No external provider or verified account lookup. */
const fail=(code,message)=>Object.assign(new Error(message),{code,noMutation:true});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clean=(value,max=80)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value)?value.trim():'';
const networks=new Map([['mtn','MTN MoMo'],['mtn momo','MTN MoMo'],['telecel','Telecel Cash'],['telecel cash','Telecel Cash'],['at','AT Money'],['at money','AT Money']]);
export const EXTERNAL_SIMULATION_FEES=Object.freeze({momo:50,bank:100});
export function externalRecipient(input){
 if(!plain(input)||!['momo','bank'].includes(input.rail))throw fail('INVALID_INPUT','Choose a test MoMo or bank destination.');
 const rail=input.rail,raw=clean(input.number,50),name=clean(input.name,60);
 if(input.name!==undefined&&input.name!==''&&(!name||name.length<2))throw fail('INVALID_INPUT','Use a short recipient label without control characters.');
 let number,network='',bank='';
 if(rail==='momo'){
  if(!raw||!/^[+\d() \u00a0-]+$/.test(raw)||/^\-|\-$|--/.test(raw))throw fail('INVALID_INPUT','Use a valid Ghana MoMo number.');
  let depth=0;for(const c of raw){if(c==='('&&++depth>1||c===')'&&--depth<0)throw fail('INVALID_INPUT','Check the MoMo number formatting.');}if(depth||/\([ \u00a0-]*\)/.test(raw))throw fail('INVALID_INPUT','Check the MoMo number formatting.');
  number=raw.replace(/[\s()-]/g,'').replace(/^\+233/,'0');
  if(!/^0(?:2[034567]|5[0345679])\d{7}$/.test(number))throw fail('INVALID_INPUT','Use a valid Ghana MoMo number.');
  network=networks.get(clean(input.network,40).toLowerCase())||'';if(!network)throw fail('INVALID_INPUT','Choose MTN MoMo, Telecel Cash or AT Money.');
  if(input.bank!==undefined&&input.bank!=='')throw fail('INVALID_INPUT','A MoMo destination does not use a bank.');
 }else{
  number=raw.replace(/\s/g,'');bank=clean(input.bank,80);
  if(!/^\d{8,16}$/.test(number)||!bank||bank.length<2)throw fail('INVALID_INPUT','Use an 8–16 digit account number and a bank label.');
  if(input.network!==undefined&&input.network!=='')throw fail('INVALID_INPUT','A bank destination does not use a MoMo network.');
 }
 return {rail,name:name||(rail==='momo'?'Test MoMo recipient':'Test bank recipient'),number,...(network?{network}:{}),...(bank?{bank}:{}),lookupSource:'sandbox'};
}
export function externalTransfer(payload){
 if(payload.externalSimulation!==true||payload.providerMode!=='sandbox')throw fail('PROVIDER_UNAVAILABLE','Choose the explicit sandbox transfer. No live bank or MoMo provider is connected.');
 if(['iouId','requestId','groupId','shopId','serviceId','testKey'].some(key=>Object.hasOwn(payload,key))||payload.paymentKind!==undefined&&payload.paymentKind!=='person')throw fail('PROVIDER_UNAVAILABLE','Only a separate personal sandbox transfer is supported here.');
 const recipient=externalRecipient({rail:payload.rail,...(plain(payload.recipient)?payload.recipient:{})});
 if(recipient.rail!==payload.rail)throw fail('INVALID_INPUT','Check the destination rail.');
 const fee=EXTERNAL_SIMULATION_FEES[payload.rail];
 if(payload.fee!==fee)throw fail('FEE_CHANGED','Review this sandbox transfer with its current test fee.');
 if(!Number.isSafeInteger(payload.amount)||payload.amount<1||payload.amount+fee>1000000)throw fail('PILOT_LIMIT','The amount plus test fee must be between one pesewa and GH₵10,000.');
 return {recipient,fee,total:payload.amount+fee};
}
export function decorateExternalTransaction(tx,transfer){
 Object.assign(tx,{externalSimulation:true,simulation:true,providerMode:'sandbox',labelUnverified:true,recipient:transfer.recipient});
}
export function externalReceiptFields(receipt){
 const amount=receipt.principalAmount,fee=receipt.simulationFee,total=receipt.totalDebited;
 if(!['momo','bank'].includes(receipt.rail)||receipt.providerMode!=='sandbox'||!Number.isSafeInteger(amount)||amount<1||fee!==EXTERNAL_SIMULATION_FEES[receipt.rail]||total!==amount+fee||total!==receipt.amount)throw fail('UNBACKED_STATE','The saved sandbox transfer does not match its ledger debit.');
 const recipient=externalRecipient({rail:receipt.rail,...receipt.recipient});if(recipient.rail!==receipt.rail)throw fail('UNBACKED_STATE','The receipt destination rail does not match its posting.');
 return {amount,fee,total,rail:receipt.rail,recipient,externalSimulation:true,simulation:true,providerMode:'sandbox',labelUnverified:true};
}
