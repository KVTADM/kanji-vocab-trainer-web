// ============================================================
// Comportements d'interface partagés par toutes les pages.
//
// Deux choses seulement, et elles sont volontairement petites :
//   1. la barre de navigation qui se densifie au défilement ;
//   2. les apparitions progressives des blocs qui entrent à l'écran.
//
// Aucune dépendance. Ce fichier est chargé par l'app comme par les
// pages éditoriales, avant tout autre script d'interface, et ne
// suppose l'existence d'aucun élément : chaque section sort d'elle-même
// si son point d'accroche est absent.
//
// Règle qui a guidé l'écriture : rien de ce qui est visible ne doit
// dépendre de ce fichier. La classe `js-anim` posée sur <html> est ce
// qui active l'état initial « caché » des animations. Si le script
// échoue, ne se charge pas, ou si le navigateur ne sait pas observer
// l'écran, la classe n'est jamais posée et tout le contenu reste
// simplement visible. Un texte ne doit jamais attendre une animation
// pour exister.
// ============================================================

(function () {
  'use strict';

  const moinsDAnimation = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  // ----------------------------------------------------------
  // 1. Barre de navigation
  // ----------------------------------------------------------
  // Le piège : dans l'app, `.app` fait 100vh et c'est `.content` qui
  // défile — la fenêtre, elle, ne bouge jamais. Un écouteur posé sur
  // `window` ne se déclencherait donc pas une seule fois. Sur les pages
  // éditoriales et la page d'accueil, c'est l'inverse. On choisit le
  // bon élément plutôt que d'espérer.
  function barre() {
    const barreEl = document.querySelector('.kvt-topbar');
    if (!barreEl) return;

    const defilant = document.querySelector('.app .content');
    const cible = defilant || window;
    const position = () => (defilant ? defilant.scrollTop : window.scrollY || 0);

    let enAttente = false;
    function auDefilement() {
      if (enAttente) return;
      enAttente = true;
      // Une classe posée à chaque pixel de défilement ferait recalculer
      // le style en continu. On se cale sur le rythme d'affichage.
      window.requestAnimationFrame(() => {
        barreEl.classList.toggle('is-scrolled', position() > 8);
        enAttente = false;
      });
    }
    cible.addEventListener('scroll', auDefilement, { passive: true });
    auDefilement();

    // Repli mobile. `aria-expanded` n'est pas décoratif : sans lui, un
    // lecteur d'écran annonce un bouton sans dire ce qu'il fait.
    const bouton = barreEl.querySelector('.kvt-topbar__toggle');
    const nav = barreEl.querySelector('.kvt-topbar__nav');
    if (bouton && nav) {
      const fermer = () => {
        nav.classList.remove('is-open');
        bouton.setAttribute('aria-expanded', 'false');
      };
      bouton.addEventListener('click', () => {
        const ouvert = nav.classList.toggle('is-open');
        bouton.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
      });
      // Choisir une destination referme le menu : sinon il reste ouvert
      // par-dessus la page qu'on vient de demander.
      nav.addEventListener('click', (e) => {
        if (e.target.closest('.nav-btn, a')) fermer();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') fermer();
      });
    }
  }

  // ----------------------------------------------------------
  // 2. Apparitions au défilement
  // ----------------------------------------------------------
  function apparitions() {
    if (!('IntersectionObserver' in window)) return;
    if (moinsDAnimation.matches) return;

    // À partir d'ici seulement on cache l'état initial : la classe n'est
    // posée que si on est certain de savoir le révéler ensuite.
    document.documentElement.classList.add('js-anim');

    const observateur = new IntersectionObserver((entrees) => {
      for (const entree of entrees) {
        if (!entree.isIntersecting) continue;
        entree.target.classList.add('is-shown');
        // Une fois montré, un élément n'a plus rien à dire : on arrête de
        // l'observer plutôt que de le faire clignoter au défilement inverse.
        observateur.unobserve(entree.target);
      }
    }, {
      // Déclenche un peu avant le bord bas : l'élément finit son
      // apparition au moment où le regard l'atteint, au lieu de commencer
      // à ce moment-là.
      rootMargin: '0px 0px -12% 0px',
      threshold: 0.05
    });

    function enregistrer(racine) {
      const noeuds = (racine || document).querySelectorAll('.kvt-fade:not(.is-shown)');
      noeuds.forEach((n) => observateur.observe(n));

      // Décalage en cascade. Borné à 6 : au-delà, le dernier élément
      // attend si longtemps que l'effet devient une lenteur.
      (racine || document).querySelectorAll('.kvt-stagger').forEach((liste) => {
        Array.from(liste.children).forEach((enfant, i) => {
          enfant.style.setProperty('--kvt-rang', String(Math.min(i, 6)));
        });
      });
    }

    enregistrer(document);

    // L'app réécrit ses vues entièrement en JavaScript : les éléments
    // marqués après coup ne seraient jamais observés. On surveille donc
    // les ajouts, sans forcer les autres scripts à nous prévenir.
    if ('MutationObserver' in window) {
      const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const noeud of m.addedNodes) {
            if (noeud.nodeType !== 1) continue;
            if (noeud.classList && noeud.classList.contains('kvt-fade')) {
              observateur.observe(noeud);
            }
            enregistrer(noeud);
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  function demarrer() {
    barre();
    apparitions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }
})();
