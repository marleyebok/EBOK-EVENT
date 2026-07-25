/**
 * /compte/general — identité et sécurité du compte unique EBOK.
 * Tout est délégué au composant UserProfile de Clerk (nom, e-mail, mot de
 * passe, appareils, suppression du compte) : rien de maison ici.
 */
import { mountCompteShell } from './compte-shell.js';

const clerk = await mountCompteShell('general');
if (clerk) {
  clerk.mountUserProfile(document.getElementById('userProfile'), { routing: 'hash' });

  document
    .getElementById('signout')
    .addEventListener('click', () => clerk.signOut({ redirectUrl: '/' }));
}
