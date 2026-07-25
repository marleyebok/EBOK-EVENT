/**
 * Coquille de l'espace compte (/compte) — sidebar repliable listant toute la
 * galaxie EBOK + portail de connexion.
 *
 * Même structure que les autres apps (cf. Playbook) : un compte unique, la
 * même page de réglages partout. La sidebar est construite ici (et pas dans
 * chaque page HTML) pour rester identique d'une section à l'autre.
 */
import { loadClerk } from './clerk.js';

// Ordre alphabétique ; Event = app courante (url null → non cliquable).
// Les apps qui ont leur propre /compte/profil pointent directement dessus.
const APPS = [
  { name: 'Basketball', color: '#1F6FE5', url: 'https://ebok.fr/compte/profil' },
  { name: 'Académie', color: '#8A4CE0', url: 'https://academie.ebok.fr/' },
  { name: 'Blog', color: '#C8317E', url: 'https://blog.ebok.fr/' },
  { name: 'Event', color: '#E1352E', url: null },
  { name: 'Forum', color: '#18A0C4', url: 'https://forum.ebok.fr/' },
  { name: 'Médias', color: '#C9A227', url: 'https://medias.ebok.fr/' },
  { name: 'Mercato', color: '#4CA62E', url: 'https://mercato.ebok.fr/compte/profil' },
  { name: 'Notebook', color: '#7A86A0', url: 'https://notebook.ebok.fr/' },
  { name: 'Playbook', color: '#E08A2B', url: 'https://playbook.ebok.fr/compte/profil' },
  { name: 'Scouting', color: '#EA5A3C', url: 'https://scouting.ebok.fr/' },
  { name: 'Stats', color: '#2E6FD6', url: 'https://stats.ebok.fr/' },
  { name: 'Vidéo', color: '#1FA98C', url: 'https://video.ebok.fr/compte/profil' },
  { name: 'Workout', color: '#A3BD18', url: 'https://workout.ebok.fr/' },
];

// Event est une page unique dont la navigation est purement côté client (pas
// d'URL par section) : on n'affiche donc pas de sous-liens, qui retomberaient
// tous sur l'accueil. Le logo ci-dessus ramène au site.
const SUB = [];

const COLLAPSE_KEY = 'eboke-dash-collapsed';

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function sidebarHtml(current) {
  const item = (app) =>
    app.url === null
      ? `<div class="dash-group">
           <div class="dash-item dash-current">
             <span class="dash-sq" style="background:${app.color}">${esc(app.name.charAt(0))}</span>
             <span class="dash-label">${esc(app.name)}</span>
           </div>
           ${
             SUB.length
               ? `<div class="dash-sub">${SUB.map(
                   (s) => `<a class="dash-subitem" href="${s.href}">
                             <span class="dash-ic">${s.icon}</span>
                             <span class="dash-label">${esc(s.label)}</span>
                           </a>`
                 ).join('')}</div>`
               : ''
           }
         </div>`
      : `<a class="dash-item" href="${app.url}">
           <span class="dash-sq" style="background:${app.color}">${esc(app.name.charAt(0))}</span>
           <span class="dash-label">${esc(app.name)}</span>
           <span class="dash-ext dash-label">↗</span>
         </a>`;

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
        <span class="dash-ic">👤</span><span class="dash-label">Mon profil</span>
      </a>
      <div class="dash-section-label dash-label">Applications</div>
      ${APPS.map(item).join('')}
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
          ? 'Connecte-toi ou crée ton compte EBOK (le compte unique de toute la galaxie) pour accéder à ton profil.'
          : 'Ton compte EBOK est momentanément injoignable. Réessaie dans un instant.'
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
