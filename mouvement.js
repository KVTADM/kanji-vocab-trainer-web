// ============================================================
// Animation « à la descente » : les blocs situés sous la ligne de flottaison
// glissent doucement (22 px) et apparaissent quand on arrive dessus.
//
// Règles de sécurité :
//  - Jamais masqué ce qui est déjà visible à l'écran au chargement.
//  - Rien ne reste masqué : une fois révélé, on retire les classes (le survol
//    et les transitions propres à chaque bloc reprennent la main).
//  - Rien ne bouge avec « réduire les animations » ou sans IntersectionObserver.
//  - Sur les pages de texte (.editorial-main), fine barre de progression en haut.
// ============================================================
(function () {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (typeof IntersectionObserver === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const SEL = [
    '.editorial-main > h1', '.editorial-main > h2', '.editorial-main > h3', '.editorial-main > p',
    '.editorial-main > ul', '.editorial-main > ol', '.editorial-main > div', '.editorial-main > details',
    '.editorial-main > section', '.editorial-main > table',
    '.view .card', '.view .section-repliable', '.site-footer'
  ].join(',');

  const vus = new WeakSet();
  const io = new IntersectionObserver((entrees) => {
    entrees.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      io.unobserve(el);
      el.classList.add('mv-vu');
      // Fin de l'effet : on rend l'élément à son style normal.
      setTimeout(() => { el.classList.remove('mv', 'mv-vu'); el.style.removeProperty('--mv-i'); }, 1100);
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -4% 0px' });

  function preparer() {
    const h = window.innerHeight || 800;
    let i = 0;
    document.querySelectorAll(SEL).forEach((el) => {
      if (vus.has(el)) return;
      const r = el.getBoundingClientRect();
      if (r.height === 0) return;           // vue cachée : on la regardera plus tard
      vus.add(el);
      if (r.top < h * 0.98) return;         // déjà à l'écran (ou au-dessus) : jamais masqué
      el.classList.add('mv');
      el.style.setProperty('--mv-i', String(i++ % 4));
      io.observe(el);
    });
  }

  let minuteur = null;
  function planifier() { clearTimeout(minuteur); minuteur = setTimeout(preparer, 120); }

  function demarrer() {
    preparer();
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(planifier).observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener('resize', planifier, { passive: true });
    // Barre de progression, pages de texte seulement.
    if (document.querySelector('.editorial-main')) {
      const b = document.createElement('div');
      b.className = 'mv-barre'; b.setAttribute('aria-hidden', 'true');
      document.body.appendChild(b);
      const maj = () => {
        const d = document.documentElement;
        const max = d.scrollHeight - window.innerHeight;
        b.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, d.scrollTop / max) : 0) + ')';
      };
      window.addEventListener('scroll', maj, { passive: true });
      maj();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
