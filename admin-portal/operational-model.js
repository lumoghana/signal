export const DEFAULT_SERVICE_MESSAGE='This payment method is temporarily unavailable. Please use another method or try again later.';
export function serviceUpdatePayload(record,mode,reason,message){
 if(!Number.isSafeInteger(record.version)||record.version<1)throw Error('Refresh this service before saving.');
 return {id:record.id||record.serviceId,mode,reason:reason.trim(),expectedVersion:record.version,...(mode==='manual_off'?{message:message.trim()}:{})};
}
export function servicePublicMessage(record){return record.publicMessage||record.public_message||record.message||DEFAULT_SERVICE_MESSAGE;}
export function privateCaseContact(type,id,{required=false}={}){
 if(!type&&!id){if(required)throw Error('Choose the private recipient for this payment case.');return {customerId:null,merchantId:null};}
 if(!['consumer','merchant'].includes(type)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('Choose a recipient type and enter its account record ID.');
 return {customerId:type==='consumer'?id:null,merchantId:type==='merchant'?id:null};
}
