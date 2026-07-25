/**
 * /compte/profil — profil du compte unique EBOK, en LECTURE SEULE.
 *
 * Un seul formulaire de profilage dans la galaxie : le questionnaire
 * d'inscription du site mère. Cette page ne fait que l'afficher et renvoie
 * vers le questionnaire pour le modifier.
 */
import { mountCompteShell } from './compte-shell.js';
import { authHeader } from './clerk.js';

const ONBOARDING_URL = 'https://ebok.fr/onboarding';

const clerk = await mountCompteShell('profil');
if (clerk) {
  const loading = document.getElementById('loading');
  const filled = document.getElementById('filled');
  const empty = document.getElementById('empty');
  const editNote = document.getElementById('editNote');
  const rowsEl = document.getElementById('rows');
  const errorEl = document.getElementById('error');

  for (const el of document.querySelectorAll('[data-onboarding]')) el.href = ONBOARDING_URL;

  try {
    const res = await fetch('/api/profile', { headers: await authHeader() });
    if (!res.ok) throw new Error(String(res.status));
    const { filled: isFilled, rows = [] } = await res.json();

    loading.hidden = true;
    if (!isFilled || rows.length === 0) {
      empty.hidden = false;
    } else {
      // `textContent` plutôt que du HTML : ces valeurs viennent du membre.
      for (const row of rows) {
        const line = document.createElement('div');
        line.className = 'dash-dl-row';
        const dt = document.createElement('dt');
        dt.textContent = row.label;
        const dd = document.createElement('dd');
        dd.textContent = row.value;
        line.append(dt, dd);
        rowsEl.append(line);
      }
      filled.hidden = false;
      editNote.hidden = false;
    }
  } catch {
    loading.hidden = true;
    errorEl.textContent = 'Impossible de charger ton profil pour le moment.';
    errorEl.hidden = false;
  }
}
