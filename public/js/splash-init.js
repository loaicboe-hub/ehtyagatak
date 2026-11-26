/* Pre-paint Splash Screen Check (CSP 'self' compliant, zero flash on returning navigation) */
try {
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced && !sessionStorage.getItem('ehtyajatak_splash_shown')) {
    document.documentElement.classList.add('splash-pending');
  }
} catch (e) {
  // Ignore sessionStorage restrictions
}
