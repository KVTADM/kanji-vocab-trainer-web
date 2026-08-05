// ============================================================
// Comptage d'audience maison.
//
// Objectif : savoir si une publication Instagram ou TikTok amène des gens
// qui ouvrent réellement l'application, et pas seulement des gens qui
// cliquent. Sans ça, la seule chose mesurable est le nombre de clics — et
// le clic le moins cher est presque toujours le moins intéressé.
//
// Ce qui part vers la base : la page, la provenance, le nom de l'événement.
// Rien d'autre. Pas d'adresse IP, pas d'identifiant de compte, pas
// d'empreinte de navigateur, pas de cookie. Sans donnée personnelle, il n'y
// a pas de consentement à demander : c'est ce qui permet de mesurer sans
// alourdir le bandeau existant.
//
// Conséquence assumée : on compte des ÉVÉNEMENTS, pas des PERSONNES. Deux
// visites de la même personne comptent deux fois. Un outil capable de les
// distinguer devrait la reconnaître, donc la suivre — ce n'est pas le
// marché qu'on passe ici.
//
// Rien de ce fichier n'est visible à l'écran. Un échec réseau, un blocage
// par une extension, une base indisponible : dans tous les cas la page
// continue exactement comme si de rien n'était. Une mesure ne doit jamais
// pouvoir casser ce qu'elle mesure.
// ============================================================

(function () {
  'use strict';

  const CLE_SOURCE = 'kvt-source';

  // La provenance, dans l'ordre de fiabilité :
  //   1. `?ref=` que l'on met soi-même dans le lien d'une publication —
  //      c'est le seul moyen de distinguer deux vidéos du même compte ;
  //   2. `utm_source`, si le lien vient d'un outil qui l'ajoute ;
  //   3. le domaine du site référent, quand il y en a un.
  // Seul le DOMAINE du référent est retenu : une adresse complète peut
  // contenir des informations qu'on n'a aucune raison de stocker.
  function sourceActuelle() {
    let source = null;
    try {
      const p = new URLSearchParams(location.search);
      source = p.get('ref') || p.get('utm_source') || null;

      if (!source && document.referrer) {
        const h = new URL(document.referrer).hostname.replace(/^www\./, '');
        // Un référent du site lui-même n'est pas une provenance : c'est une
        // navigation interne, et la compter écraserait la vraie origine.
        if (h && h !== location.hostname) source = h;
      }

      // Conservée le temps de la visite pour que « compte créé », dix
      // minutes plus tard, sache encore d'où venait la personne.
      // `sessionStorage` disparaît à la fermeture de l'onglet et ne suit
      // personne d'un site à l'autre.
      if (source) sessionStorage.setItem(CLE_SOURCE, source);
      else source = sessionStorage.getItem(CLE_SOURCE);
    } catch (e) {
      // Navigation privée stricte, stockage refusé : on continue sans.
    }
    return source;
  }

  function noter(evenement, chemin) {
    try {
      if (!window.sb || typeof window.sb.rpc !== 'function') return;
      window.sb.rpc('kvt_noter_visite', {
        p_chemin: chemin || location.pathname,
        p_source: sourceActuelle(),
        p_evenement: evenement
      }).then(function () {}, function () {});
    } catch (e) {
      // Volontairement muet : une mesure qui remonte une erreur à l'écran
      // fait plus de dégâts que l'absence de mesure.
    }
  }

  function demarrer() {
    noter('page');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }

  window.kvtMesure = {
    noter,
    source: sourceActuelle
  };
})();
