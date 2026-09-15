/**
 * Coquille de l'espace compte (/compte) — sidebar repliable + portail de
 * connexion.
 *
 * La sidebar est construite ici (et pas dans chaque page HTML) pour rester
 * identique d'une section à l'autre.
 */
import { loadClerk } from './clerk.js';

const COLLAPSE_KEY = 'eboke-dash-collapsed';

function sidebarHtml(current) {
  return `
    <div class="dash-top">
      <a class="dash-logo" href="/" title="Retour au site">
        <span class="dash-logo-ball">🏀</span>
        <span class="dash-label dash-logo-txt">EBOK <b>EVENT</b></span>
      </a>
      <button class="dash-collapse" type="button" id="dashCollapse" title="Réduire">‹</button>
    </div>
    <nav class="dash-nav">
      <a class="dash-item${current === 'profil' ? ' active' : ''}" href="/compte/profil">
        <span class="dash-ic">👤</span><span class="dash-label">Profil diffuseur</span>
      </a>
    </nav>
    <div class="dash-bottom">
      <a class="dash-item${current === 'general' ? ' active' : ''}" href="/compte/general">
        <span class="dash-ic">⚙️</span><span class="dash-label">Général</span>
      </a>
      <div class="dash-user dash-label" id="dashUser"></div>
    </div>`;
}

/**
 * Portail de connexion. Event n'a pas de pages /connexion dédiées : on ouvre
 * les modales Clerk. Si Clerk est injoignable (`clerk` null), on n'affiche pas
 * de boutons morts — juste le retour au site.
 */
function showGate(clerk) {
  const gate = document.createElement('div');
  gate.className = 'dash-gate';
  gate.innerHTML = `
    <div class="dash-gate-card">
      <div class="dash-logo" style="justify-content:center;margin-bottom:10px">
        <span class="dash-logo-ball">🏀</span>
        <span class="dash-logo-txt">EBOK <b>EVENT</b></span>
      </div>
      <h1>Ton espace</h1>
      <p>${
        clerk
          ? 'Connecte-toi ou crée ton compte pour accéder à ton espace diffuseur.'
          : 'Ton compte est momentanément injoignable. Réessaie dans un instant.'
      }</p>
      ${
        clerk
          ? `<div class="dash-gate-actions">
               <button class="dash-btn ghost" type="button" id="gateSignin">Connexion</button>
               <button class="dash-btn" type="button" id="gateSignup">Créer un compte</button>
             </div>`
          : ''
      }
      <a class="dash-gate-back" href="/">← Retour au site</a>
    </div>`;
  document.body.appendChild(gate);

  if (clerk) {
    document
      .getElementById('gateSignin')
      .addEventListener('click', () => clerk.openSignIn({ oauthFlow: 'popup' }));
    document
      .getElementById('gateSignup')
      .addEventListener('click', () => clerk.openSignUp({ oauthFlow: 'popup' }));
  }
}

/**
 * Monte la coquille et résout l'état connecté.
 * @param {'profil'|'general'} current section courante (état actif de la sidebar)
 * @returns {Promise<object|null>} l'instance Clerk si connecté, sinon null
 */
export async function mountCompteShell(current) {
  const dash = document.getElementById('dash');
  const side = document.getElementById('dashSide');
  side.innerHTML = sidebarHtml(current);

  // Sidebar repliable, mémorisée d'une visite à l'autre.
  const btn = document.getElementById('dashCollapse');
  const apply = (on) => {
    dash.classList.toggle('collapsed', on);
    btn.textContent = on ? '›' : '‹';
    btn.title = on ? 'Déplier' : 'Réduire';
  };
  apply(localStorage.getItem(COLLAPSE_KEY) === '1');
  btn.addEventListener('click', () => {
    const on = !dash.classList.contains('collapsed');
    localStorage.setItem(COLLAPSE_KEY, on ? '1' : '0');
    apply(on);
  });

  let clerk;
  try {
    clerk = await loadClerk();
  } catch (err) {
    // Clerk injoignable : on montre le portail plutôt qu'une page vide.
    console.error('[EBOK] Échec du chargement de Clerk :', err);
    showGate(null);
    return null;
  }

  if (!clerk.user) {
    showGate(clerk);
    return null;
  }

  const u = clerk.user;
  document.getElementById('dashUser').textContent =
    u.firstName || u.username || u.primaryEmailAddress?.emailAddress || 'Mon compte';
  dash.hidden = false;
  return clerk;
}
