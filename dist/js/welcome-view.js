import { icon } from './ui.js';
import { renderExplore } from './explore-view.js';

export function renderWelcome({ preview = false, resume = false, touring = false, showSignIn = true, page = 'home' } = {}) {
  // A signup preview can never offer to replace the existing account with a demo.
  if (!preview && ['explore', 'impact', 'impact-extra'].includes(page)) return renderExplore();
  const primary = touring ? 'Continue the tour' : resume ? 'Continue signup' : 'Let’s get started';
  return `<section class="welcome welcome--photo" data-first-meet="${!preview && !resume && !touring}" aria-labelledby="entry-welcome-title">
    <img class="entry-photo" src="/assets/student-warm-welcome.png" width="1024" height="1536" alt="A student with a backpack smiles warmly as she looks at her phone" fetchpriority="high" decoding="async">
    <div class="entry-photo-fade" aria-hidden="true"></div>
    <header class="entry-photo-header"><span class="entry-photo-brand" aria-label="Lumo">lumo</span>${preview ? '<button type="button" class="entry-photo-signin" data-action="signup-preview-exit">Back to my Lumo</button>' : showSignIn ? '<button type="button" class="entry-photo-signin" data-action="welcome-signin">Sign in</button>' : ''}</header>
    <div class="entry-photo-copy">${!preview ? '<img class="entry-hello-lux" src="/assets/lux-pause-2d.webp" width="80" height="80" alt="Lux waves hello"><div class="entry-first-confetti" aria-hidden="true">'+Array.from({length:16},(_,i)=>`<i style="--piece:${i}"></i>`).join('')+'</div>' : ''}<h1 id="entry-welcome-title"><span>Your money.</span> <span><em>Made clear.</em></span></h1><p>See how today’s choices could affect your money tomorrow.</p>
    <footer class="entry-photo-actions"><button type="button" class="entry-primary" data-action="start">${primary} ${icon('arrow', 21)}</button>${preview ? '' : '<button type="button" class="entry-text-button" data-action="welcome-explore">Explore Lumo</button>'}<p class="entry-banking-provider" aria-label="Banking services powered by GCB Bank">Powered by <strong>GCB Bank</strong></p><p class="entry-prototype-note">${preview ? 'Live camera · Demo verification · Your account stays safe.' : 'Interactive prototype · No real money.'}</p></footer></div>
  </section>`;
}
