const frame=document.getElementById('mobile-app');
// Keep invitations and customer QR links inside the same mobile experience.
frame.src='./app.html'+location.search+location.hash;
// A focused embedded app owns its own Back/Forward route stack.

function fitViewport(){document.documentElement.style.setProperty('--visual-height',(window.visualViewport?.height||window.innerHeight)+'px')}
fitViewport();window.visualViewport?.addEventListener('resize',fitViewport);window.addEventListener('resize',fitViewport);
if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
