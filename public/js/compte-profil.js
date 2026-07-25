/**
 * /compte/profil — profil du compte unique EBOK (table partagée
 * `shared.profiles`, la même que Playbook / Video / Event / site mère).
 */
import { mountCompteShell } from './compte-shell.js';
import { authHeader } from './clerk.js';

/* Listes fermées, identiques dans toutes les apps de la galaxie. */
const ROLES = ['Joueur', 'Coach', 'Club', 'Organisation', 'Spectateur', 'Autre'];
const LEVELS = ['Loisir', 'Département', 'Région', 'National', 'Pro', 'International', 'Autre'];
const GENDERS = ['Homme', 'Femme'];
const TOOLS = [
  'Basketball',
  'Event',
  'Mercato',
  'Playbook',
  'Workout',
  'Vidéo',
  'Stats',
  'Notebook',
  'Académie',
  'Scouting',
  'Blog',
  'Forum',
  'Médias',
];

const clerk = await mountCompteShell('profil');
if (clerk) {
  const form = document.getElementById('form');
  const toast = document.getElementById('toast');
  const errorEl = document.getElementById('error');
  const submitBtn = document.getElementById('submit');

  // Options des listes (une seule source, partagée avec l'API).
  const fill = (id, values) => {
    document.getElementById(id).insertAdjacentHTML(
      'beforeend',
      values.map((v) => `<option value="${v}">${v}</option>`).join('')
    );
  };
  fill('f-role', ROLES);
  fill('f-level', LEVELS);
  fill('f-gender', GENDERS);
  document.getElementById('f-tools').innerHTML = TOOLS.map(
    (t) => `<label class="dash-chip"><input type="checkbox" name="tools" value="${t}" />${t}</label>`
  ).join('');

  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  };

  // 1) Pré-remplissage depuis le profil déjà enregistré.
  try {
    const res = await fetch('/api/profile', { headers: await authHeader() });
    if (res.ok) {
      const { profile = {} } = await res.json();
      for (const name of ['role', 'roleOther', 'level', 'club', 'gender', 'age', 'location']) {
        if (typeof profile[name] === 'string') form.elements[name].value = profile[name];
      }
      const tools = Array.isArray(profile.tools) ? profile.tools : [];
      form
        .querySelectorAll('input[name="tools"]')
        .forEach((box) => (box.checked = tools.includes(box.value)));
    } else if (res.status !== 401) {
      showError('Impossible de charger ton profil pour le moment.');
    }
  } catch {
    showError('Impossible de charger ton profil pour le moment.');
  }

  // 2) Enregistrement.
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    toast.hidden = true;
    errorEl.hidden = true;
    submitBtn.disabled = true;
    const original = submitBtn.textContent;
    submitBtn.textContent = 'Enregistrement…';

    const data = new FormData(form);
    const payload = {
      role: data.get('role'),
      roleOther: data.get('roleOther'),
      level: data.get('level'),
      club: data.get('club'),
      gender: data.get('gender'),
      age: data.get('age'),
      location: data.get('location'),
      tools: data.getAll('tools'),
    };

    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.hidden = false;
        toast.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        showError("L'enregistrement a échoué. Réessaie dans un instant.");
      }
    } catch {
      showError("L'enregistrement a échoué. Vérifie ta connexion et réessaie.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = original;
    }
  });
}
