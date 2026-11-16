const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const only=(value,keys)=>plain(value)&&Object.keys(value).every(key=>keys.includes(key));
const invalid=()=>{throw Object.assign(new Error('Check and accept the current setup notice before continuing.'),{code:'INVALID_INPUT',status:400});};
export const ONBOARDING_TERMS_VERSION='2026-11-08.1';
/** Non-sensitive setup evidence only. Camera media and provider assurance never enter account state. */
export function onboardingReceipt(value,now=Date.now()){
 if(value===undefined)return undefined;
 if(!only(value,['termsAcceptance','verification']))invalid();
 const terms=value.termsAcceptance,verification=value.verification;
 if(!only(terms,['version','acceptedAt'])||terms.version!==ONBOARDING_TERMS_VERSION)invalid();
 const timestamp=(value,earliest=now-86400000)=>{if(typeof value!=='string'||value.length>40)invalid();const at=Date.parse(value);if(!Number.isFinite(at)||at>now+300000||at<earliest)invalid();return new Date(at).toISOString();};
 const acceptedAt=timestamp(terms.acceptedAt,Date.parse('2026-11-08T00:00:00Z'));
 if(!only(verification,['mode','capture','status','method','liveness','sampleIdentity','detailsConfirmed','completedAt'])||verification.mode!=='simulation'||verification.capture!=='live-camera'||verification.status!=='complete'||verification.method!=='ghana-card-number'||verification.liveness!=='guided-camera'||verification.sampleIdentity!==true||verification.detailsConfirmed!==true)invalid();
 return {termsAcceptance:{version:ONBOARDING_TERMS_VERSION,acceptedAt},verification:{mode:'simulation',capture:'live-camera',status:'complete',method:'ghana-card-number',liveness:'guided-camera',sampleIdentity:true,detailsConfirmed:true,completedAt:timestamp(verification.completedAt)}};
}
