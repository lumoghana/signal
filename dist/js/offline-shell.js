/** Cache public app assets only. The financial ledger remains in the browser's own storage. */
export async function registerOfflineShell({navigator:nav=globalThis.navigator,target=globalThis.window,onChange=()=>{}}={}) {
  if(!nav||!target?.location||!['https:','http:'].includes(target.location.protocol))return {ok:false,reason:'unsupported',cleanup:()=>{}};
  const change=()=>onChange({offline:nav.onLine===false,message:nav.onLine===false?'You’re offline. Demo changes can save on this device. Bank and MoMo confirmations are unavailable.':''});
  target.addEventListener('online',change);target.addEventListener('offline',change);change();
  const cleanup=()=>{target.removeEventListener('online',change);target.removeEventListener('offline',change);};
  if(!nav.serviceWorker)return {ok:false,reason:'unsupported',cleanup};
  try{const registration=await nav.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});return {ok:true,registration,cleanup};}
  catch{return {ok:false,reason:'registration-failed',cleanup};}
}

/** Keep connectivity visible without representing local demo work as a bank confirmation. */
export function updateOfflineBanner(host, { offline = false } = {}) {
  if (!host?.ownerDocument || typeof host.querySelector !== 'function') return null;
  let banner = host.querySelector('[data-offline-banner]');
  if (!banner && offline) {
    banner = host.ownerDocument.createElement('div');
    banner.className = 'offline-banner';
    banner.setAttribute('data-offline-banner', '');
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-atomic', 'true');
    banner.textContent = 'You’re offline. Demo changes can save on this device. Bank and MoMo confirmations are unavailable.';
    host.prepend(banner);
  }
  if (banner) banner.hidden = !offline;
  return banner;
}
