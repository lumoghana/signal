export const DEFAULT_SERVICE_MESSAGE='This payment method is temporarily unavailable. Please use another method or try again later.';
// These exact service-owned notes are emitted by an immutable older migration.
// Apply only to its display-note arrays, never customer/staff names or messages.
const legacySystemNotes=new Map([
 ['Pause trigger and Lux answer telemetry are not recorded by the current backend.','Pause trigger and Lumo answer telemetry are not recorded by the current backend.'],
 ['Only recorded outcomes are counted. Client abandonments and Lux satisfaction are not yet instrumented.','Only recorded outcomes are counted. Client abandonments and Lumo satisfaction are not yet instrumented.']
]);
export function systemNotesForDisplay(data){
 if(!data||typeof data!=='object'||Array.isArray(data))return data;
 let out=data;
 for(const key of ['limitations','definitions'])if(Array.isArray(data[key])){
  const notes=data[key].map(note=>legacySystemNotes.get(note)??note);
  if(notes.some((note,index)=>note!==data[key][index])){if(out===data)out={...data};out[key]=notes;}
 }
 return out;
}
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
