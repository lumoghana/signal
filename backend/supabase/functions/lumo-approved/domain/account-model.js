import {groupSummary,groupPayoutStatus,canReadGroup,groupApprovers} from './group-ledger.js';
import {normalizeUsername,validUsername,validLoginCredential,passwordProofMatches} from './login-credentials.js';
import {consumeDeviceProof} from './device-auth.js';

/** Local account controls. No credentials, support reports or requests leave this browser. */
const clone = value => JSON.parse(JSON.stringify(value));
const clean = (value, limit = 300) => String(value ?? '').trim().slice(0, limit);
const ok = (message, data = {}) => ({ ok: true, message, ...data });
const fail = message => ({ ok: false, message });
const money = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const currentTime = h => typeof h?.now === 'function' ? new Date(h.now()).toISOString() : new Date().toISOString();
let serial = 0;
const id = (prefix, h) => h?.uid ? h.uid(prefix) : `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${++serial}`}`;
const phone = value => clean(value).replace(/\D/g, '').replace(/^233/, '0');
const pin = value => typeof value === 'string' && /^\d{4}$/.test(value);
const choose = (item, keys) => Object.fromEntries(keys.filter(key => item?.[key] !== undefined).map(key => [key, clone(item[key])]));

export function ensureAccountState(s) {
  s.account ||= {};
  const a = s.account;
  a.status = a.status === 'closed' ? 'closed' : 'active';
  a.signedOut = a.signedOut === true;
  a.devices ||= [{ id: 'this-device', name: 'This browser', current: true, status: 'active', lastSeenAt: new Date().toISOString() }];
  a.supportCases ||= [];
  a.privacy = { personalisation: true, marketing: false, ...(a.privacy || {}) };
  a.requests ||= [];
  a.securityEvents ||= [];
  s.settings ||= {};
  if (a.login && typeof a.login === 'object') a.login = {username:normalizeUsername(a.login.username),credential:choose(a.login.credential,['version','algorithm','iterations','salt','verifier'])};
  if (!a.biometrics || typeof a.biometrics !== 'object' || Array.isArray(a.biometrics)) a.biometrics = { credential:null, loginEnabled:false, paymentsEnabled:false };
  a.biometrics.loginEnabled = !!a.biometrics.credential && a.biometrics.loginEnabled === true;
  a.biometrics.paymentsEnabled = !!a.biometrics.credential && a.biometrics.paymentsEnabled === true;
  s.settings.biometric = a.biometrics.paymentsEnabled;
  s.settings.biometricMethod = s.settings.biometricMethod === 'fingerprint' ? 'fingerprint' : 'face';
  return a;
}

export function accountLoginConfigured(s) {
  const login = ensureAccountState(s).login;
  return !!login && validUsername(login.username) && validLoginCredential(login.credential);
}

export function accountAccess(s) {
  const a = ensureAccountState(s);
  return { signedOut: a.signedOut, closed: a.status === 'closed', canTransact: !a.signedOut && a.status !== 'closed', mode: a.signedOut ? 'signed-out' : a.status === 'closed' ? 'read-only' : 'active' };
}

export function closureBlockers(s) {
  const blockers = [];
  if (money(s.wallet)) blockers.push({ code: 'wallet', title: 'Move your Everyday money', detail: 'Your Everyday account still holds money.', route: { section: 'pay', page: 'home' } });
  if ((s.boxes || []).some(b => money(b.balance))) blockers.push({ code: 'savings', title: 'Move your savings back first', detail: 'Money Boxes still hold savings. Partner protection continues to apply.', route: { section: 'boxes', page: 'home' } });
  const cards = s.cards || s.virtualCards || (s.virtualCard ? [s.virtualCard] : []);
  if ((Array.isArray(cards) ? cards : []).some(c => money(c.balance))) blockers.push({ code: 'cards', title: 'Return your card funds', detail: 'A virtual card still has funds.', route: { section: 'pay', page: 'cards' } });
  if ((s.transactions || []).some(t => t.status === 'pending' || t.status === 'processing') || (s.fundingAttempts || []).some(t => ['pending','processing'].includes(t.status))) blockers.push({ code: 'pending', title: 'Wait for pending money', detail: 'A payment or funding attempt is still awaiting a final outcome.', route: { section: 'activity', page: 'home' } });
  if ((s.ious || []).some(i => i.status === 'open' && money(i.amount) > money(i.paid))) blockers.push({ code: 'ious', title: 'Resolve open IOUs', detail: 'Settle or close the outstanding records before closing Lumo.', route: { section: 'life', page: 'ious' } });
  if ((s.groups || []).some(g => g.status !== 'closed' && (g.creatorId === 'me' || (g.members || []).some(m => m.id === 'me' && (!m.status || m.status === 'active')) || (g.contributions || []).some(c => c.memberId === 'me' && c.status === 'success' && money(c.amount) > money(c.refundedAmount))))) blockers.push({ code: 'groups', title: 'Resolve your group responsibilities', detail: 'Leave or close open collections and resolve contribution returns before closing Lumo.', route: { section: 'life', page: 'groups' } });
  if ((s.boxTransfers || []).some(t => t.status === 'pending')) blockers.push({ code: 'box-pending', title: 'Check pending savings moves', detail: 'A Money Box move still needs a final outcome.', route: { section: 'boxes', page: 'home' } });
  return blockers;
}

export function handleAccountAction(s, type, p = {}, h = {}) {
  if (!type.startsWith('account')) return null;
  const a = ensureAccountState(s), now = currentTime(h), event = (kind, detail) => a.securityEvents.unshift({ id: id('security',h), kind, detail, at: now });
  const signIn = (method) => {
    const alreadyIn = !a.signedOut;
    a.signedOut = false; a.signInAttempts = 0; a.signInLockedUntil = ''; s.settings.hideBalance = true;
    if (!alreadyIn) event('sign-in', `Signed in with ${method} on this browser`);
    return ok('Welcome back. Your records are right here.');
  };
  const locked = () => a.signInLockedUntil && new Date(a.signInLockedUntil) > new Date(now);
  if (type === 'accountSignOut') {
    if (!a.signedOut) event('sign-out', 'Signed out on this browser');
    a.signedOut = true; s.settings.hideBalance = true;
    return ok('Signed out. Your saved money and history stay here.');
  }
  if (type === 'accountSignIn') {
    if(s.onboardingDone!==true)return fail('There is no completed saved account in this browser yet. Return to signup.');
    if (!accountLoginConfigured(s)) return fail('Set up your username and password first, or recover this saved demo account.');
    if (locked()) return fail('Too many attempts. Wait a minute, or use demo recovery.');
    if (normalizeUsername(p.username) !== a.login.username || !passwordProofMatches(p.passwordProof, a.login.credential)) {
      a.signInAttempts = (a.signInAttempts || 0) + 1;
      if (a.signInAttempts >= 5) a.signInLockedUntil = new Date(new Date(now).getTime()+60000).toISOString();
      return { ...fail('That username or password does not match.'), persistFailure:true };
    }
    return signIn('username and password');
  }
  if (type === 'accountBiometricSignIn') {
    if (s.onboardingDone !== true || !accountLoginConfigured(s) || !a.biometrics.loginEnabled || !a.biometrics.credential) return fail('Sign in with your username and password.');
    if (locked()) return fail('Too many attempts. Wait a minute, or recover your login.');
    const proof = consumeDeviceProof(p.proof, { purpose:'login', credentialId:a.biometrics.credential.id });
    if (!proof) return fail('Device verification did not complete. Use your username and password.');
    a.biometrics.credential.counter = Math.max(a.biometrics.credential.counter || 0, proof.counter || 0);
    return signIn('device verification');
  }
  if (type === 'accountStartRecovery') {
    if(s.onboardingDone!==true)return fail('This browser has no completed saved account to recover. Return to signup.');
    if (!phone(p.phone) || phone(p.phone) !== phone(s.profile?.phone)) return fail('Use the phone number registered in this saved demo.');
    a.recovery = { id: id('recovery',h), status: 'code-sent', code: '123456', expiresAt: new Date(new Date(now).getTime()+5*60000).toISOString(), attempts: 0 };
    event('recovery-started','A local demo recovery was requested'); return ok('Your demo recovery code is 123456. No SMS was sent.');
  }
  if (type === 'accountCompleteRecovery') {
    const r = a.recovery;
    if (!r || r.status !== 'code-sent') return fail('Start a fresh recovery first.');
    if (new Date(r.expiresAt) <= new Date(now)) { r.status = 'expired'; return { ...fail('That code expired. Request another demo code.'), persistFailure: true }; }
    if (r.attempts >= 5) return fail('Too many tries. Request another demo code.');
    if (p.code !== r.code) { r.attempts += 1; if(r.attempts >= 5)r.status='locked'; return { ...fail('Use the demo recovery code shown on screen.'), persistFailure: true }; }
    if (!validUsername(p.username) || !validLoginCredential(p.credential)) return fail('Choose a username and a new login password.');
    a.login = {username:normalizeUsername(p.username), credential:choose(p.credential,['version','algorithm','iterations','salt','verifier'])};
    a.biometrics = {credential:null, loginEnabled:false, paymentsEnabled:false}; s.settings.biometric=false;
    a.signedOut = false; a.signInAttempts=0; a.signInLockedUntil=''; r.status='complete'; delete r.code;
    event('recovered','Login password reset; transaction PIN and money records retained'); return ok('Your login is restored. Your transaction PIN and money records stay the same.');
  }
  if (a.signedOut) return fail('Sign back in to manage this saved account.');
  if (type === 'accountSetLogin') {
    if (s.onboardingDone !== true) return fail('Complete signup before setting your login.');
    if (accountLoginConfigured(s)) return fail('Your login is already set. Use Change login instead.');
    if (p.currentPin !== (s.settings.pin || '1234')) return fail('Your transaction PIN does not match.');
    if (!validUsername(p.username) || !validLoginCredential(p.credential)) return fail('Choose a username of 3–30 letters, numbers, dots, underscores or dashes, and a login password.');
    a.login={username:normalizeUsername(p.username),credential:choose(p.credential,['version','algorithm','iterations','salt','verifier'])};
    event('login-created','Username and password set separately from the transaction PIN');
    return ok('Your login is ready. Your transaction PIN stays separate.');
  }
  if (type === 'accountChangeLogin') {
    if (!accountLoginConfigured(s) || !passwordProofMatches(p.currentPasswordProof,a.login.credential)) return fail('Your current login password does not match.');
    if (!validUsername(p.username) || !validLoginCredential(p.credential)) return fail('Choose a valid username and a new login password.');
    a.login={username:normalizeUsername(p.username),credential:choose(p.credential,['version','algorithm','iterations','salt','verifier'])};
    a.signInAttempts=0;a.signInLockedUntil='';
    event('login-changed','Login credentials updated; transaction PIN unchanged');
    return ok('Your login is updated. Your transaction PIN stays the same.');
  }
  if (type === 'accountChangePin') {
    if (p.currentPin !== (s.settings.pin || '1234')) return fail('Your current demo PIN does not match.');
    if (!pin(p.newPin) || p.newPin !== p.confirmPin) return fail('Choose matching four-digit demo PINs.');
    if(p.newPin===p.currentPin)return fail('Choose a different demo PIN.');
    s.settings.pin=p.newPin; event('pin-changed','Demo PIN changed'); return ok('Your demo PIN is updated.');
  }
  if (type === 'accountBiometricRegister') {
    if (!accountLoginConfigured(s) || !passwordProofMatches(p.currentPasswordProof,a.login.credential)) return fail('Confirm your login password to enable device verification.');
    const proof = consumeDeviceProof(p.proof,{purpose:'register',credentialId:p.credential?.id});
    const credential = proof?.credential;
    if (!credential?.id || !credential.publicKey || !credential.origin || !credential.rpId) return fail('Device setup did not complete. Try again on this phone.');
    a.biometrics={credential:choose(credential,['id','publicKey','algorithm','rpId','origin','userHandle','counter','createdAt']),loginEnabled:p.loginEnabled === true,paymentsEnabled:p.paymentsEnabled === true};
    s.settings.biometric=a.biometrics.paymentsEnabled;
    event('biometric','Device verification enabled on this browser');
    return ok('Device verification is ready. Your password and transaction PIN remain available.');
  }
  if (type === 'accountBiometricPreferences') {
    if (!a.biometrics.credential) return fail('Set up device verification first.');
    if (typeof p.loginEnabled !== 'boolean' || typeof p.paymentsEnabled !== 'boolean') return fail('Choose how to use device verification.');
    const enabling = p.loginEnabled && !a.biometrics.loginEnabled || p.paymentsEnabled && !a.biometrics.paymentsEnabled;
    if (enabling && !passwordProofMatches(p.passwordProof,a.login?.credential)) return fail('Confirm your login password to enable device verification.');
    a.biometrics.loginEnabled=p.loginEnabled;a.biometrics.paymentsEnabled=p.paymentsEnabled;
    s.settings.biometric=p.paymentsEnabled;event('biometric-preferences','Device verification preferences updated');
    return ok('Your device verification choices are saved.');
  }
  if (type === 'accountBiometricDisable') {
    a.biometrics={credential:null,loginEnabled:false,paymentsEnabled:false};s.settings.biometric=false;
    event('biometric-disabled','Device verification removed from this saved account');
    return ok('Device verification is off. Use your password to sign in and your PIN for payments.');
  }
  if (type === 'accountBiometricVerified') {
    if (!a.biometrics.paymentsEnabled || !a.biometrics.credential || a.status==='closed') return fail('Use your transaction PIN.');
    const proof=consumeDeviceProof(p.proof,{purpose:'transaction',credentialId:a.biometrics.credential.id});
    if (!proof) return fail('Device verification did not complete. Use your transaction PIN.');
    a.biometrics.credential.counter=Math.max(a.biometrics.credential.counter||0,proof.counter||0);
    return ok('Device verification complete.');
  }
  if (type === 'accountBiometric') return fail('Set up device verification in Security & access.');
  if (type === 'accountAddDemoDevice') {
    if(a.devices.some(d=>d.id==='demo-second-device'&&d.status==='active'))return fail('The sample second browser is already listed.');
    a.devices.push({id:'demo-second-device',name:'Sample campus laptop',current:false,status:'active',lastSeenAt:now,simulated:true});return ok('Sample device added for testing.');
  }
  if (type === 'accountRevokeDevice') {
    const d=a.devices.find(d=>d.id===p.deviceId);if(!d||d.current||d.status!=='active')return fail('Choose another active sample device.');
    d.status='revoked';d.revokedAt=now;event('device-revoked',d.name);return ok('That sample device is signed out.');
  }
  if (type === 'accountPrivacy') {
    if(!['personalisation','marketing'].includes(p.preference)||typeof p.enabled!=='boolean')return fail('Choose a valid privacy preference.');
    a.privacy[p.preference]=p.enabled;return ok('Your preference is saved.');
  }
  if (type === 'accountDeletionRequest') {
    if(a.requests.some(r=>r.type==='deletion'&&r.status==='requested'))return fail('Your local deletion request is already recorded.');
    const r={id:id('privacy-request',h),type:'deletion',status:'requested',at:now,note:'Local demonstration only. No request was sent. Financial records retained until reviewed.'};a.requests.unshift(r);return ok('Demo request recorded. Nothing has been deleted.',{request:r});
  }
  if (type === 'accountCancelDeletion') {
    const r=a.requests.find(r=>r.id===p.requestId&&r.type==='deletion'&&r.status==='requested');if(!r)return fail('That request is no longer open.');r.status='cancelled';r.updatedAt=now;return ok('Your local request is cancelled.');
  }
  if (type === 'accountSupportCreate') {
    const title=clean(p.title,100),body=clean(p.body,2000),tx=p.transactionId?(s.transactions||[]).find(t=>t.id===p.transactionId):null, funding=p.fundingId?(s.fundingAttempts||[]).find(f=>f.id===p.fundingId):null;
    if(title.length<3||body.length<8)return fail('Add a short title and a few details so the issue is clear.');
    if(p.transactionId&&!tx)return fail('That payment is not part of this account.');
    if(p.fundingId&&!funding)return fail('That funding attempt is not part of this account.');
    const c={id:id('case',h),reference:`LUM-${String(a.supportCases.length+1).padStart(5,'0')}`,title,body,category:['payment','question','idea','bug','privacy'].includes(p.category)?p.category:'question',transactionId:tx?.id||'',fundingId:funding?.id||'',status:'open',createdAt:now,updatedAt:now,updates:[{id:id('case-note',h),at:now,kind:'system',text:'Saved on this device. No support team has received this demo report.'}]};
    a.supportCases.unshift(c);return ok(`Saved as ${c.reference}.`,{case:c,id:c.id});
  }
  if (type === 'accountSupportUpdate') {
    const c=a.supportCases.find(c=>c.id===p.caseId);if(!c)return fail('That support report could not be found.');
    const body=clean(p.body,2000);if(body.length<3)return fail('Add a little detail.');
    c.updates.push({id:id('case-note',h),kind:'you',text:body,at:now});c.updatedAt=now;if(c.status==='resolved')c.status='open';return ok('Added to your saved report.');
  }
  if (type === 'accountSupportSimulate') {
    const c=a.supportCases.find(c=>c.id===p.caseId);if(!c||!['reviewing','resolved','open'].includes(p.status))return fail('Choose a report and demo outcome.');
    c.status=p.status;c.updatedAt=now;c.updates.push({id:id('case-note',h),kind:'simulation',at:now,text:p.status==='resolved'?'Demo outcome: resolved. Reopen it by adding a note.':p.status==='reviewing'?'Demo update: the report is being reviewed. No live support agent is connected.':'You reopened this demo report.'});return ok('Sample support status updated.');
  }
  if (type === 'accountClose') {
    if(a.status==='closed')return fail('This demo account is already closed.');
    if(p.confirm!=='CLOSE')return fail('Type CLOSE to confirm this demo closure.');
    const blockers=closureBlockers(s);if(blockers.length)return fail('Resolve the items in the checklist before closing.');
    if(p.pin!==(s.settings.pin||'1234'))return fail('Your demo PIN does not match.');
    a.status='closed';a.closedAt=now;event('closed','Demo account closed. Financial records remain available in read-only mode.');return ok('Closed in this prototype. Your records remain available to view and export.');
  }
  return null;
}

export function exportAccountData(s,{connected=false}={}) {
  const a=ensureAccountState(s);
  const txKeys=['id','type','direction','amount','fee','merchant','category','status','at','note','rail','boxId','parentPaymentId','resolvedAt','reversedAt'];
  return { format:'lumo-account-export-v1', generatedAt:new Date().toISOString(), simulation:true,
    profile:choose(s.profile,['name','campus']), account:choose(a,['status','closedAt']),
    balances:{everyday:money(s.wallet),savings:(s.boxes||[]).reduce((n,b)=>n+money(b.balance),0),currency:'GHS',unit:'pesewas'},
    transactions:(s.transactions||[]).map(t=>({...choose(t,txKeys),...(t.type==='iou-manual-repayment'?{manual:true,direction:'out',description:'Paid outside Lumo',balanceEffect:'none'}:{})})),
    moneyBoxes:(s.boxes||[]).map(b=>choose(b,['id','name','target','balance','date','deadline','archived','archivedAt','hack'])),
    budget:clone(s.budget||{}), budgetHistory:clone(s.budgetHistory||[]),
    savingsHistory:(s.savingsHistory||[]).map(r=>choose(r,['id','at','boxId','type','amount','status','reason','trigger','transactionId'])),
    virtualCards:(s.virtualCards||[]).map(c=>({...choose(c,['id','name','last4','status','balance','limit','createdAt','closedAt','replaces']),history:(c.history||[]).map(h=>choose(h,['id','type','at','amount','transactionId','previousCardId']))})),
    fundingAttempts:(s.fundingAttempts||[]).map(f=>({...choose(f,['id','reference','amount','rail','source','status','transactionId','createdAt','retryOf']),history:(f.history||[]).map(h=>choose(h,['id','type','at','transactionId','status']))})),
    moneyRequests:(s.moneyRequests||[]).map(r=>choose(r,['id','direction','name','amount','note','status','createdAt','expiresAt','paymentId','reportedAt'])),
    expenseSplits:(s.expenseSplits||[]).map(x=>({...choose(x,['id','amount','purpose','transactionId','mode','createdAt','status']),members:(x.members||[]).map(m=>choose(m,['id','name','amount','paid','isMe']))})),
    groupCollections:(s.groups||[]).filter(g=>canReadGroup(g)).map(g=>({...choose(g,['id','name','purpose','deadline','target','balance','status','closedAt']),members:(g.members||[]).map(m=>choose(m,['id','name','role','status'])),contributions:(g.contributions||[]).map(c=>choose(c,['id','memberId','memberName','amount','status','at'])),payouts:(g.payouts||[]).map(p=>choose(p,['id','amount','fee','recipient','rail','purpose','note','status','approvals','requiredApprovals','at','paidAt','revision']))})),
    ious:(s.ious||[]).map(i=>choose(i,['id','type','name','amount','paid','due','status','note','budgetItemId'])),
    externalBalances:(s.externalBalances||[]).map(i=>choose(i,['id','type','name','balance','updatedAt'])),externalBalanceHistory:(s.externalBalanceHistory||[]).map(i=>choose(i,['id','externalBalanceId','balanceId','type','name','balance','before','after','action','at'])),
    recovery:s.recovery?choose(s.recovery,['active','nextDate','checkInDate','days','dailyLimit','reduceCategories','startedAt','completedAt']):null,
    privacy:{...a.privacy}, requests:a.requests.map(r=>choose(r,['id','type','status','at','updatedAt'])),
    supportCases:a.supportCases.map(c=>({...choose(c,['reference','title','body','category','transactionId','fundingId','status','createdAt','updatedAt']),updates:c.updates.map(u=>({...choose(u,['at','kind','text']),text:supportRecordText(u,{connected})}))})),
    notice:'Identity captures, Ghana Card details, login credentials, device keys, PINs, access codes, card credentials and private chats are excluded. Group records stay in their authorised group view.' };
}
const csvCell=value=>{let v=String(value??'');if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';};
export function statementCSV(s,{from,to}={}) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||from>to||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||new Date(from).toISOString().slice(0,10)!==from||new Date(to).toISOString().slice(0,10)!==to)throw new Error('Choose a valid start and end date.');
  const rows=[['Reference','Date (UTC)','Type','Direction','Description','Status','Amount (GHS)','Fee (GHS)','Rail','Category','Entry note']];
  for(const t of (s.transactions||[]).filter(t=>t.at?.slice(0,10)>=from&&t.at?.slice(0,10)<=to).sort((x,y)=>x.at.localeCompare(y.at))){rows.push([t.id,t.at,t.type,t.direction,t.merchant,t.status,(money(t.amount)/100).toFixed(2),(money(t.fee)/100).toFixed(2),t.rail,t.category,t.type==='iou-manual-repayment'?'Paid outside Lumo · No Lumo balance change':'']);}
  return rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
}
export function supportRecordText(update,{connected=false}={}) {return connected&&update.kind==='system'&&update.text==='Saved on this device. No support team has received this demo report.'?'Saved with your shared test account. No live support team has been contacted.':update.text;}
export function supportSummary(s,caseId,{connected=false}={}){const c=ensureAccountState(s).supportCases.find(c=>c.id===caseId);if(!c)return '';return [connected?'Lumo shared test-account support report':'Lumo local demo support report',c.reference,c.title,`Status: ${c.status}`,`Payment reference: ${c.transactionId||'None'}`,`Funding reference: ${c.fundingId||'None'}`,`Created: ${c.createdAt}`,'',c.body,'',...c.updates.map(u=>`${u.at} · ${u.kind}\n${supportRecordText(u,{connected})}`),'',connected?'This report is saved with your shared test account. No live support team has been contacted.':'This report is saved on this device. No live support team is connected.'].join('\n');}
