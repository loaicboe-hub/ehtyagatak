/* Ehtyajatak Platform — Progressive Enhancement Script (Zero External Dependencies) */

function initDrawer(openSelector, closeSelector, panelSelector, backdropSelector) {
  const panel = document.querySelector(panelSelector);
  const backdrop = document.querySelector(backdropSelector);
  const openBtn = document.querySelector(openSelector);
  const closeBtn = document.querySelector(closeSelector);
  if (!panel || !openBtn) return;

  const setOpen = (isOpen) => {
    panel.dataset.open = isOpen ? 'true' : 'false';
    if (isOpen) {
      panel.removeAttribute('hidden');
      backdrop?.removeAttribute('hidden');
    } else {
      backdrop?.setAttribute('hidden', '');
      if (panel.id === 'mobile-nav-drawer') panel.setAttribute('hidden', '');
    }
    openBtn.setAttribute('aria-expanded', String(isOpen));
  };

  openBtn.addEventListener('click', () => setOpen(true));
  closeBtn?.addEventListener('click', () => setOpen(false));
  backdrop?.addEventListener('click', () => setOpen(false));
}

function initLanguageSwitcher() {
  document.querySelectorAll('[data-lang-switcher]').forEach((select) => {
    select.addEventListener('change', () => {
      const targetLang = select.value === 'en' ? 'en' : 'ar';
      document.cookie = `site_lang=${targetLang}; path=/; max-age=31536000; SameSite=Lax`;
      const targetUrl = select.selectedOptions?.[0]?.dataset?.url;
      if (targetUrl) {
        window.location.assign(targetUrl);
      } else {
        window.location.reload();
      }
    });
  });
}

function initInvestmentCalculator() {
  const root = document.querySelector('[data-calculator]');
  if (!root) return;

  const areaPerUnit = Number(root.dataset.areaSqm || 360);
  const pricePerUnit = Number(root.dataset.priceEgp || 220000);
  const minUnits = Number(root.dataset.minUnits || 3);
  const downPercent = Number(root.dataset.downPercent || 35);
  const lang = document.documentElement.lang === 'en' ? 'en' : 'ar';
  const fmt = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US');

  const input = root.querySelector('[data-calc-count]');
  const outArea = root.querySelector('[data-calc-area]');
  const outTotal = root.querySelector('[data-calc-total]');
  const outDown = root.querySelector('[data-calc-down]');
  const outRem = root.querySelector('[data-calc-remaining]');
  const leadCountInput = document.querySelector('[data-lead-greenhouse-count]');

  const recalc = () => {
    let count = Number.parseInt(input.value || String(minUnits), 10);
    if (!Number.isFinite(count) || count < minUnits) count = minUnits;
    const totalArea = count * areaPerUnit;
    const totalPrice = count * pricePerUnit;
    const downPayment = Math.round((totalPrice * downPercent) / 100);
    const remaining = totalPrice - downPayment;

    if (outArea) outArea.textContent = `${fmt.format(totalArea)} ${lang === 'ar' ? 'م²' : 'm²'}`;
    if (outTotal) outTotal.textContent = `${fmt.format(totalPrice)} ${lang === 'ar' ? 'ج.م' : 'EGP'}`;
    if (outDown) outDown.textContent = `${fmt.format(downPayment)} ${lang === 'ar' ? 'ج.م' : 'EGP'}`;
    if (outRem) outRem.textContent = `${fmt.format(remaining)} ${lang === 'ar' ? 'ج.م' : 'EGP'}`;
    if (leadCountInput) leadCountInput.value = String(count);
  };

  input?.addEventListener('input', recalc);
  input?.addEventListener('change', () => {
    if (Number(input.value) < minUnits) input.value = String(minUnits);
    recalc();
  });
  recalc();
}

function initPrintButtons() {
  document.querySelectorAll('[data-print-btn]').forEach((btn) => {
    btn.addEventListener('click', () => window.print());
  });
}

function initHeroCarousel() {
  const root = document.querySelector('[data-hero-carousel]');
  if (!root) return;

  const slides = Array.from(root.querySelectorAll('[data-carousel-slide]'));
  const dots = Array.from(root.querySelectorAll('[data-carousel-dot]'));
  const prevBtn = root.querySelector('[data-carousel-prev]');
  const nextBtn = root.querySelector('[data-carousel-next]');
  if (slides.length <= 1) return;

  const intervalMs = Math.max(2000, Number(root.dataset.interval || 5000));
  let current = 0;
  let timerId = null;
  let isPaused = false;
  let touchStartX = 0;
  let touchStartY = 0;

  const showSlide = (nextIdx) => {
    const target = ((nextIdx % slides.length) + slides.length) % slides.length;
    if (target === current) return;

    const prevSlide = slides[current];
    const nextSlide = slides[target];
    prevSlide.classList.remove('is-active');
    prevSlide.setAttribute('aria-hidden', 'true');

    // Restart subtle Ken Burns animation cleanly on the newly active slide
    const nextImg = nextSlide.querySelector('.hero-slide__img');
    if (nextImg) {
      nextImg.style.animation = 'none';
      void nextImg.offsetWidth;
      nextImg.style.animation = '';
    }

    nextSlide.classList.add('is-active');
    nextSlide.setAttribute('aria-hidden', 'false');

    dots.forEach((dot, idx) => {
      const active = idx === target;
      dot.classList.toggle('is-active', active);
      dot.setAttribute('aria-current', active ? 'true' : 'false');
    });

    current = target;
  };

  const stopTimer = () => {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    if (isPaused) return;
    timerId = setInterval(() => {
      showSlide(current + 1);
    }, intervalMs);
  };

  const goTo = (idx) => {
    showSlide(idx);
    startTimer();
  };

  prevBtn?.addEventListener('click', () => goTo(current - 1));
  nextBtn?.addEventListener('click', () => goTo(current + 1));

  dots.forEach((dot, idx) => {
    dot.addEventListener('click', () => goTo(idx));
  });

  root.addEventListener('mouseenter', () => {
    isPaused = true;
    stopTimer();
  });
  root.addEventListener('mouseleave', () => {
    isPaused = false;
    startTimer();
  });
  root.addEventListener('focusin', () => {
    isPaused = true;
    stopTimer();
  });
  root.addEventListener('focusout', (e) => {
    if (!root.contains(e.relatedTarget)) {
      isPaused = false;
      startTimer();
    }
  });

  root.addEventListener('keydown', (e) => {
    const isRtl = document.documentElement.dir === 'rtl';
    if (e.key === 'ArrowRight') goTo(current + (isRtl ? -1 : 1));
    if (e.key === 'ArrowLeft') goTo(current + (isRtl ? 1 : -1));
  });

  root.addEventListener('touchstart', (e) => {
    const t = e.changedTouches?.[0];
    if (!t) return;
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  }, { passive: true });

  root.addEventListener('touchend', (e) => {
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      const isRtl = document.documentElement.dir === 'rtl';
      const swipeNext = isRtl ? dx > 0 : dx < 0;
      goTo(current + (swipeNext ? 1 : -1));
    }
  }, { passive: true });

  startTimer();
}

function initSplashScreen() {
  const splash = document.querySelector('[data-splash]');
  if (!splash) return;
  if (!document.documentElement.classList.contains('splash-pending')) return;

  const skipBtn = splash.querySelector('[data-splash-skip]');
  let closed = false;
  let exitTimer = null;

  const finishSplash = () => {
    if (closed) return;
    closed = true;
    if (exitTimer) clearTimeout(exitTimer);
    try {
      sessionStorage.setItem('ehtyajatak_splash_shown', '1');
    } catch {
      // Ignore storage restrictions
    }
    splash.classList.add('is-exiting');
    setTimeout(() => {
      document.documentElement.classList.remove('splash-pending');
      splash.classList.remove('is-exiting');
    }, 500);
  };

  skipBtn?.addEventListener('click', finishSplash);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !closed) finishSplash();
  }, { once: true });

  exitTimer = setTimeout(finishSplash, 2400);
}

document.addEventListener('DOMContentLoaded', () => {
  initSplashScreen();
  initDrawer('[data-mobile-menu-open]', '[data-mobile-menu-close]', '#mobile-nav-drawer', '[data-drawer-backdrop]');
  initDrawer('[data-admin-sidebar-open]', '[data-admin-sidebar-close]', '#admin-sidebar', '[data-admin-backdrop]');
  initLanguageSwitcher();
  initInvestmentCalculator();
  initPrintButtons();
  initHeroCarousel();
});
