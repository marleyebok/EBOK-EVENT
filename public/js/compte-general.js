/**
 * /compte/general — identité et sécurité du compte.
 * Tout est délégué au composant UserProfile de Clerk (nom, e-mail, mot de
 * passe, appareils, suppression du compte) : rien de maison ici.
 */
import { mountCompteShell } from './compte-shell.js';
import { clerkAppearance } from './clerk.js';

const clerk = await mountCompteShell('general');
if (clerk) {
  clerk.mountUserProfile(document.getElementById('userProfile'), {
    routing: 'hash',
    appearance: clerkAppearance(),
  });

  document
    .getElementById('signout')
    .addEventListener('click', () => clerk.signOut({ redirectUrl: '/' }));
}
