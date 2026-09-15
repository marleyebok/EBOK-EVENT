/**
 * /compte/profil — profil DIFFUSEUR, propre à EBOK Event.
 *
 * Ces champs pré-remplissent le bloc « organisateur » du formulaire de
 * publication (voir `org` dans initCreatePage, js/app.js) et s'affichent sur
 * les fiches événement. Ils sont stockés dans `event.profiles` via
 * /api/account (action `saveProfile`), qui fusionne le profil existant : les
 * autres clés du profil membre (pseudo, rôle, centres d'intérêt, édités depuis
 * « Mon profil » sur le site) ne sont pas écrasées.
 *
 * L'e-mail et le nom réel du compte restent gérés par Clerk (/compte/general) :
 * on ne les duplique pas ici.
 */
import { mountCompteShell } from './compte-shell.js';
import { authHeader } from './clerk.js';

/* Champs de la page ↔ clés du profil. */
const FIELDS = {
  orgname: 'orgname',
  orgcity: 'orgcity',
  orginsta: 'orginsta',
  orgsite: 'orgsite',
  orglinkedin: 'orglinkedin',
  orgemail: 'orgemail',
  orgtel: 'orgtel',
};

const clerk = await mountCompteShell('profil');
if (clerk) {
  const loading = document.getElementById('loading');
  const form = document.getElementById('form');
  const errorEl = document.getElementById('error');
  const statusEl = document.getElementById('status');
  const saveBtn = document.getElementById('save');

  /** Appel JSON authentifié vers /api/account. */
  async function account(options = {}) {
    const res = await fetch('/api/account', {
      ...options,
      headers: {
        ...(await authHeader()),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  try {
    const { profile = {} } = await account();
    for (const [id, key] of Object.entries(FIELDS)) {
      document.getElementById(id).value = profile[key] || '';
    }
    loading.hidden = true;
    form.hidden = false;
  } catch {
    loading.hidden = true;
    errorEl.textContent = 'Impossible de charger ton profil pour le moment.';
    errorEl.hidden = false;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    statusEl.textContent = 'Enregistrement…';

    const profile = {};
    for (const [id, key] of Object.entries(FIELDS)) {
      profile[key] = document.getElementById(id).value.trim();
    }
    // L'arobase est ajoutée à l'affichage : on ne la stocke pas.
    profile.orginsta = profile.orginsta.replace(/^@/, '');

    try {
      await account({ method: 'POST', body: JSON.stringify({ action: 'saveProfile', profile }) });
      statusEl.textContent = 'Enregistré ✓';
      errorEl.hidden = true;
    } catch {
      statusEl.textContent = '';
      errorEl.textContent = 'Enregistrement impossible. Réessaie dans un instant.';
      errorEl.hidden = false;
    } finally {
      saveBtn.disabled = false;
    }
  });
}
