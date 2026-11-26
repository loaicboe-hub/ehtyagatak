import { escapeHtml, sanitizeSafeUrl } from '../../foundation/security/input-sanitizer.mjs';
import { formatNumber, t } from '../i18n/index.mjs';
import { getLocalizedField } from '../services/settings.mjs';

export function renderCalculatorWidget({ lang, settings, projects = [], csrfToken, showRequestForm = false }) {
  const c = settings.calculator;
  const minUnits = Number(c.min_greenhouses || 3);
  const area = Number(c.greenhouse_area_sqm || 360);
  const price = Number(c.greenhouse_price_egp || 220000);
  const downPct = Number(c.down_payment_percent || 35);
  const disclaimer = lang === 'ar' ? c.disclaimer_ar : c.disclaimer_en;

  const projectOptions = projects
    .map((p) => `<option value="${p.id}">${escapeHtml(p.title)} — ${escapeHtml(lang === 'ar' ? p.location_ar : p.location_en)}</option>`)
    .join('');

  const requestFormHtml = showRequestForm
    ? `
    <div class="card stack" style="margin-block-start: var(--space-6);">
      <h3 class="card__title">${escapeHtml(t(lang, 'forms.investmentRequestTitle'))}</h3>
      <form class="form-grid" method="post" action="/api/public/leads">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="lead_type" value="investment_request">
        <input type="hidden" name="lang" value="${escapeHtml(lang)}">
        <input type="hidden" name="redirect_to" value="/${escapeHtml(lang)}/invest">
        <div class="grid grid--cols-2">
          <div class="form-field">
            <label class="form-label" for="inv-name">${escapeHtml(t(lang, 'forms.fullName'))}</label>
            <input class="form-control" id="inv-name" name="full_name" type="text" required maxlength="160">
          </div>
          <div class="form-field">
            <label class="form-label" for="inv-phone">${escapeHtml(t(lang, 'forms.phone'))}</label>
            <input class="form-control" id="inv-phone" name="phone" type="tel" required maxlength="40">
          </div>
          <div class="form-field">
            <label class="form-label" for="inv-email">${escapeHtml(t(lang, 'forms.email'))}</label>
            <input class="form-control" id="inv-email" name="email" type="email" maxlength="190">
          </div>
          <div class="form-field">
            <label class="form-label" for="inv-count">${escapeHtml(t(lang, 'forms.greenhouseCount'))}</label>
            <input class="form-control" id="inv-count" name="greenhouse_count" type="number" min="${minUnits}" value="${minUnits}" data-lead-greenhouse-count required>
          </div>
        </div>
        ${projectOptions ? `
        <div class="form-field">
          <label class="form-label" for="inv-project">${escapeHtml(t(lang, 'forms.project'))}</label>
          <select class="form-control" id="inv-project" name="project_id">
            <option value="">—</option>
            ${projectOptions}
          </select>
        </div>` : ''}
        <div class="form-field">
          <label class="form-label" for="inv-notes">${escapeHtml(t(lang, 'forms.notes'))}</label>
          <textarea class="form-control" id="inv-notes" name="notes" maxlength="1500"></textarea>
        </div>
        <div class="cluster">
          <button class="btn btn--primary" type="submit">${escapeHtml(t(lang, 'common.submit'))}</button>
          ${settings.whatsappUrl ? `<a class="btn btn--secondary" href="${escapeHtml(settings.whatsappUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t(lang, 'common.whatsappCta'))}</a>` : ''}
        </div>
      </form>
    </div>`
    : `<div class="cluster"><a class="btn btn--primary" href="/${escapeHtml(lang)}/invest">${escapeHtml(t(lang, 'calc.requestThisPlan'))}</a></div>`;

  return `
  <div class="calc-box" data-calculator data-area-sqm="${area}" data-price-egp="${price}" data-min-units="${minUnits}" data-down-percent="${downPct}">
    <div class="stack">
      <div>
        <h2 style="margin-block-end: var(--space-1);">${escapeHtml(t(lang, 'calc.title'))}</h2>
        <p class="card__subtitle">${escapeHtml(t(lang, 'calc.subtitle'))}</p>
      </div>
      <div class="grid grid--cols-3" style="align-items: end;">
        <div class="form-field">
          <label class="form-label" for="calc-units-input">${escapeHtml(t(lang, 'calc.countLabel'))}</label>
          <input class="form-control" id="calc-units-input" type="number" min="${minUnits}" max="200" value="${minUnits}" data-calc-count>
          <span class="form-hint">${escapeHtml(t(lang, 'calc.minHint', { min: minUnits }))}</span>
        </div>
        <div class="calc-stat">
          <div class="calc-stat__label">${escapeHtml(t(lang, 'calc.areaPerUnit'))}</div>
          <div class="calc-stat__value">${escapeHtml(formatNumber(lang, area))} ${escapeHtml(t(lang, 'common.sqm'))}</div>
        </div>
        <div class="calc-stat">
          <div class="calc-stat__label">${escapeHtml(t(lang, 'calc.pricePerUnit'))}</div>
          <div class="calc-stat__value">${escapeHtml(formatNumber(lang, price))} ${escapeHtml(t(lang, 'common.egp'))}</div>
        </div>
      </div>

      <div class="calc-result-grid">
        <div class="calc-stat">
          <div class="calc-stat__label">${escapeHtml(t(lang, 'calc.totalArea'))}</div>
          <div class="calc-stat__value" data-calc-area>—</div>
        </div>
        <div class="calc-stat">
          <div class="calc-stat__label">${escapeHtml(t(lang, 'calc.totalInvestment'))}</div>
          <div class="calc-stat__value" data-calc-total>—</div>
        </div>
        <div class="calc-stat calc-stat--highlight">
          <div class="calc-stat__label">${escapeHtml(t(lang, 'calc.downPayment', { percent: downPct }))}</div>
          <div class="calc-stat__value" data-calc-down>—</div>
        </div>
        <div class="calc-stat">
          <div class="calc-stat__label">${escapeHtml(t(lang, 'calc.remainingAmount'))}</div>
          <div class="calc-stat__value" data-calc-remaining>—</div>
        </div>
      </div>

      ${disclaimer ? `<p class="form-hint" style="margin: 0;">${escapeHtml(disclaimer)}</p>` : ''}
      ${requestFormHtml}
    </div>
  </div>`;
}

export function renderHomePage({ lang, settings, sections, projects, news, faqs }) {
  const hero = sections.hero || {};
  const heroSlidesSec = sections.hero_slides || {};
  const pillars = sections.value_pillars || {};
  const calc = settings.calculator;
  const lp = (p) => `/${lang}${p}`;

  const defaultSlides = [
    {
      image: '/assets/hero/slide-1.jpg',
      alt: lang === 'ar' ? 'صوب زراعية حديثة وحقول مستدامة' : 'Modern agricultural greenhouses and sustainable fields',
      badge: hero.body?.badge || t(lang, 'brand.shortName'),
      heading: hero.heading || t(lang, 'brand.name'),
      subheading: hero.subheading || t(lang, 'brand.tagline'),
      ctaLabel: hero.cta_label || t(lang, 'nav.invest'),
      ctaUrl: hero.cta_url || '/invest',
      secondaryCtaLabel: hero.body?.secondaryCtaLabel || t(lang, 'nav.projects'),
      secondaryCtaUrl: hero.body?.secondaryCtaUrl || '/projects'
    }
  ];
  const slides = Array.isArray(heroSlidesSec.body?.slides) && heroSlidesSec.body.slides.length > 0
    ? heroSlidesSec.body.slides
    : defaultSlides;

  const resolveCtaHref = (url) => (url === '/login' ? '/login' : lp(url || '/invest'));

  const slidesHtml = slides
    .map((s, idx) => {
      const activeClass = idx === 0 ? ' is-active' : '';
      const headingTag = idx === 0 ? 'h1' : 'h2';
      const ariaHidden = idx === 0 ? 'false' : 'true';
      return `
      <div class="hero-slide${activeClass}" data-carousel-slide="${idx}" aria-hidden="${ariaHidden}">
        <img
          class="hero-slide__img"
          src="${escapeHtml(sanitizeSafeUrl(s.image || '/assets/hero/slide-1.jpg'))}"
          alt="${escapeHtml(s.alt || s.heading || '')}"
          loading="${idx === 0 ? 'eager' : 'lazy'}"
          decoding="async"${idx === 0 ? ' fetchpriority="high"' : ''}
        >
        <div class="hero-slide__scrim" aria-hidden="true"></div>
        <div class="container hero-slide__inner">
          <div class="hero-slide__content stack">
            ${s.badge ? `<span class="hero-badge">${escapeHtml(s.badge)}</span>` : ''}
            <${headingTag} class="hero-slide__title">${escapeHtml(s.heading || '')}</${headingTag}>
            <p class="hero-banner__sub">${escapeHtml(s.subheading || '')}</p>
            <div class="cluster">
              ${s.ctaLabel ? `<a class="btn btn--accent" href="${escapeHtml(resolveCtaHref(s.ctaUrl))}">${escapeHtml(s.ctaLabel)}</a>` : ''}
              ${s.secondaryCtaLabel ? `<a class="btn btn--hero-outline" href="${escapeHtml(resolveCtaHref(s.secondaryCtaUrl))}">${escapeHtml(s.secondaryCtaLabel)}</a>` : ''}
            </div>
          </div>
        </div>
      </div>`;
    })
    .join('');

  const dotsHtml = slides
    .map((_, idx) => `
      <button
        type="button"
        class="hero-carousel__dot${idx === 0 ? ' is-active' : ''}"
        data-carousel-dot="${idx}"
        aria-label="${escapeHtml(lang === 'ar' ? `الانتقال إلى الشريحة ${idx + 1}` : `Go to slide ${idx + 1}`)}"
        aria-current="${idx === 0 ? 'true' : 'false'}"
      ></button>`)
    .join('');

  const pillarItems = Array.isArray(pillars.body?.items) ? pillars.body.items : [];

  return `
  <section
    class="hero-carousel"
    role="region"
    aria-roledescription="carousel"
    aria-label="${escapeHtml(lang === 'ar' ? 'عرض الاستثمار في الصوب الزراعية' : 'Greenhouse Investment Showcase')}"
    data-hero-carousel
    data-interval="5000"
  >
    <div class="hero-carousel__stage">
      ${slidesHtml}

      <button
        type="button"
        class="hero-carousel__arrow hero-carousel__arrow--prev"
        data-carousel-prev
        aria-label="${escapeHtml(lang === 'ar' ? 'الشريحة السابقة' : 'Previous slide')}"
      >
        <span aria-hidden="true">&#10094;</span>
      </button>
      <button
        type="button"
        class="hero-carousel__arrow hero-carousel__arrow--next"
        data-carousel-next
        aria-label="${escapeHtml(lang === 'ar' ? 'الشريحة التالية' : 'Next slide')}"
      >
        <span aria-hidden="true">&#10095;</span>
      </button>

      <div class="hero-carousel__dots" role="tablist" aria-label="${escapeHtml(lang === 'ar' ? 'اختيار الشريحة' : 'Slide pagination')}">
        ${dotsHtml}
      </div>
    </div>

    <div class="hero-kpi-bar">
      <div class="container hero-kpi-bar__grid">
        <div class="hero-stat-card">
          <div class="hero-stat-card__value">${escapeHtml(formatNumber(lang, calc.greenhouse_area_sqm))} ${escapeHtml(t(lang, 'common.sqm'))}</div>
          <div>${escapeHtml(t(lang, 'calc.areaPerUnit'))}</div>
        </div>
        <div class="hero-stat-card">
          <div class="hero-stat-card__value">${escapeHtml(formatNumber(lang, calc.greenhouse_price_egp))} ${escapeHtml(t(lang, 'common.egp'))}</div>
          <div>${escapeHtml(t(lang, 'calc.pricePerUnit'))}</div>
        </div>
        <div class="hero-stat-card">
          <div class="hero-stat-card__value">${escapeHtml(formatNumber(lang, calc.min_greenhouses))} ${escapeHtml(t(lang, 'common.greenhousesUnit'))}</div>
          <div>${escapeHtml(lang === 'ar' ? 'الحد الأدنى للاستثمار' : 'Minimum Investment')}</div>
        </div>
        <div class="hero-stat-card">
          <div class="hero-stat-card__value">${escapeHtml(formatNumber(lang, calc.down_payment_percent))}%</div>
          <div>${escapeHtml(lang === 'ar' ? 'دفعة مقدمة مرجعية' : 'Reference Down Payment')}</div>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      ${renderCalculatorWidget({ lang, settings, projects, csrfToken: '', showRequestForm: false })}
    </div>
  </section>

  <section class="section" style="background: var(--color-surface-alt);">
    <div class="container stack">
      <div>
        <h2>${escapeHtml(pillars.heading || '')}</h2>
        <p class="card__subtitle">${escapeHtml(pillars.subheading || '')}</p>
      </div>
      <div class="grid grid--cols-3">
        ${pillarItems.map((it) => `
          <article class="card kpi-card stack">
            <h3 class="card__title">${escapeHtml(it.title)}</h3>
            <p style="margin: 0; color: var(--color-text-secondary);">${escapeHtml(it.desc)}</p>
          </article>
        `).join('')}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container stack">
      <div class="cluster" style="justify-content: space-between;">
        <h2>${escapeHtml(t(lang, 'nav.projects'))}</h2>
        <a class="btn btn--secondary btn--sm" href="${escapeHtml(lp('/projects'))}">${escapeHtml(t(lang, 'common.learnMore'))}</a>
      </div>
      <div class="grid grid--cols-2">
        ${projects.map((p) => `
          <article class="card stack">
            <div class="cluster" style="justify-content: space-between;">
              <span class="badge badge--success">${escapeHtml(t(lang, `status.${p.status}`))}</span>
              <span class="badge">${escapeHtml(formatNumber(lang, p.available_greenhouses))} / ${escapeHtml(formatNumber(lang, p.total_greenhouses))} ${escapeHtml(t(lang, 'common.greenhousesUnit'))}</span>
            </div>
            <h3 class="card__title">${escapeHtml(p.title)}</h3>
            <p class="card__subtitle">${escapeHtml(lang === 'ar' ? p.location_ar : p.location_en)}</p>
            <p style="margin: 0;">${escapeHtml(p.summary)}</p>
            <div class="cluster">
              <a class="btn btn--primary btn--sm" href="${escapeHtml(lp(`/projects/${p.slug}`))}">${escapeHtml(t(lang, 'common.learnMore'))}</a>
            </div>
          </article>
        `).join('')}
      </div>
    </div>
  </section>

  <section class="section" style="background: var(--color-surface-alt);">
    <div class="container grid grid--cols-2">
      <div class="stack">
        <h2>${escapeHtml(t(lang, 'nav.news'))}</h2>
        ${news.map((n) => `
          <article class="card stack">
            <h3 class="card__title">${escapeHtml(n.title)}</h3>
            <p style="margin: 0; color: var(--color-text-secondary);">${escapeHtml(n.excerpt)}</p>
            <a href="${escapeHtml(lp(`/news/${n.slug}`))}">${escapeHtml(t(lang, 'common.learnMore'))}</a>
          </article>
        `).join('')}
      </div>
      <div class="stack">
        <h2>${escapeHtml(t(lang, 'nav.faq'))}</h2>
        ${faqs.map((f) => `
          <details class="card">
            <summary style="font-weight: 700; cursor: pointer;">${escapeHtml(f.question)}</summary>
            <p style="margin-block: var(--space-3) 0; color: var(--color-text-secondary);">${escapeHtml(f.answer)}</p>
          </details>
        `).join('')}
      </div>
    </div>
  </section>`;
}

export const SECTION_BANNERS = {
  about: '/assets/banners/banner-about.jpg',
  projects: '/assets/hero/slide-4.jpg',
  invest: '/assets/hero/slide-2.jpg',
  'how-it-works': '/assets/banners/banner-how-it-works.jpg',
  services: '/assets/hero/slide-3.jpg',
  news: '/assets/banners/banner-news.jpg',
  faq: '/assets/banners/banner-faq.jpg',
  contact: '/assets/banners/banner-contact.jpg',
  policies: '/assets/hero/slide-1.jpg'
};

export function renderPageHero({ lang, image, badge, title, subtitle = '', headingTag = 'h1' }) {
  return `
  <section class="page-hero">
    <img class="page-hero__img" src="${escapeHtml(sanitizeSafeUrl(image))}" alt="${escapeHtml(title)}" loading="eager" decoding="async" fetchpriority="high">
    <div class="page-hero__scrim" aria-hidden="true"></div>
    <div class="container page-hero__inner stack">
      ${badge ? `<span class="hero-badge">${escapeHtml(badge)}</span>` : ''}
      <${headingTag} class="page-hero__title">${escapeHtml(title)}</${headingTag}>
      ${subtitle ? `<p class="page-hero__subtitle">${escapeHtml(subtitle)}</p>` : ''}
    </div>
  </section>`;
}

export function renderStandardPage({ lang, page, pageKey = 'about' }) {
  const banner = SECTION_BANNERS[pageKey] || SECTION_BANNERS.about;
  return `
  ${renderPageHero({
    lang,
    image: banner,
    badge: t(lang, 'brand.shortName'),
    title: page.title,
    subtitle: page.content?.summary || ''
  })}
  <section class="section">
    <div class="container--narrow stack">
      <div class="card stack">
        <p style="white-space: pre-line; margin: 0;">${escapeHtml(page.content?.body || '')}</p>
      </div>
    </div>
  </section>`;
}

export function renderInvestPage({ lang, settings, projects, csrfToken }) {
  return `
  ${renderPageHero({
    lang,
    image: SECTION_BANNERS.invest,
    badge: lang === 'ar' ? 'خطتك الاستثمارية' : 'Your Investment Plan',
    title: t(lang, 'nav.invest'),
    subtitle: t(lang, 'calc.subtitle')
  })}
  <section class="section">
    <div class="container stack">
      ${renderCalculatorWidget({ lang, settings, projects, csrfToken, showRequestForm: true })}
    </div>
  </section>`;
}

export function renderProjectsPage({ lang, projects }) {
  return `
  ${renderPageHero({
    lang,
    image: SECTION_BANNERS.projects,
    badge: lang === 'ar' ? 'مجمعات الصوب الزراعية' : 'Greenhouse Complexes',
    title: t(lang, 'nav.projects'),
    subtitle: lang === 'ar' ? 'استعرض المواقع التشغيلية والمساحات المتاحة للاستثمار الزراعي.' : 'Explore active locations, unit availability, and sustainable farm infrastructure.'
  })}
  <section class="section">
    <div class="container stack">
      <div class="grid grid--cols-2">
        ${projects.length === 0 ? `<p>${escapeHtml(t(lang, 'common.noRecords'))}</p>` : projects.map((p) => `
          <article class="card stack">
            <div class="cluster" style="justify-content: space-between;">
              <span class="badge badge--success">${escapeHtml(t(lang, `status.${p.status}`))}</span>
              <span class="badge">${escapeHtml(formatNumber(lang, p.area_per_greenhouse_sqm))} ${escapeHtml(t(lang, 'common.sqm'))}</span>
            </div>
            <h2 class="card__title">${escapeHtml(p.title)}</h2>
            <p class="card__subtitle">${escapeHtml(lang === 'ar' ? p.location_ar : p.location_en)}</p>
            <p style="margin: 0;">${escapeHtml(p.summary)}</p>
            <div class="cluster" style="justify-content: space-between; font-size: var(--text-sm);">
              <span>${escapeHtml(lang === 'ar' ? 'المتاح:' : 'Available:')} <strong>${escapeHtml(formatNumber(lang, p.available_greenhouses))}</strong> / ${escapeHtml(formatNumber(lang, p.total_greenhouses))}</span>
              <span>${escapeHtml(formatNumber(lang, p.unit_price_egp))} ${escapeHtml(t(lang, 'common.egp'))}</span>
            </div>
            <div class="cluster">
              <a class="btn btn--primary btn--sm" href="/${escapeHtml(lang)}/projects/${escapeHtml(p.slug)}">${escapeHtml(t(lang, 'common.learnMore'))}</a>
              <a class="btn btn--secondary btn--sm" href="/${escapeHtml(lang)}/invest">${escapeHtml(t(lang, 'nav.invest'))}</a>
            </div>
          </article>
        `).join('')}
      </div>
    </div>
  </section>`;
}

export function renderProjectDetailPage({ lang, project }) {
  return `
  ${renderPageHero({
    lang,
    image: SECTION_BANNERS.projects,
    badge: lang === 'ar' ? project.location_ar : project.location_en,
    title: project.title,
    subtitle: project.summary
  })}
  <section class="section">
    <div class="container--narrow stack">
      <div class="cluster">
        <a href="/${escapeHtml(lang)}/projects">&larr; ${escapeHtml(t(lang, 'nav.projects'))}</a>
        <span class="badge badge--success">${escapeHtml(t(lang, `status.${project.status}`))}</span>
      </div>
      <div class="grid grid--cols-3">
        <div class="card">
          <div class="card__subtitle">${escapeHtml(t(lang, 'calc.areaPerUnit'))}</div>
          <div class="metric-value">${escapeHtml(formatNumber(lang, project.area_per_greenhouse_sqm))} ${escapeHtml(t(lang, 'common.sqm'))}</div>
        </div>
        <div class="card">
          <div class="card__subtitle">${escapeHtml(t(lang, 'calc.pricePerUnit'))}</div>
          <div class="metric-value">${escapeHtml(formatNumber(lang, project.unit_price_egp))} ${escapeHtml(t(lang, 'common.egp'))}</div>
        </div>
        <div class="card">
          <div class="card__subtitle">${escapeHtml(lang === 'ar' ? 'الصوب المتاحة' : 'Available Units')}</div>
          <div class="metric-value">${escapeHtml(formatNumber(lang, project.available_greenhouses))}</div>
        </div>
      </div>
      <div class="card stack">
        <p style="margin: 0; white-space: pre-line;">${escapeHtml(project.description)}</p>
        ${project.crop_types ? `<p style="margin: 0;"><strong>${escapeHtml(lang === 'ar' ? 'المحاصيل المستهدفة:' : 'Target Crops:')}</strong> ${escapeHtml(project.crop_types)}</p>` : ''}
      </div>
      <div class="cluster">
        <a class="btn btn--primary" href="/${escapeHtml(lang)}/invest">${escapeHtml(t(lang, 'calc.requestThisPlan'))}</a>
      </div>
    </div>
  </section>`;
}

export function renderHowItWorksPage({ lang }) {
  const steps = lang === 'ar'
    ? [
        ['1', 'حساب الخطة وحجز الموعد', 'استخدم حاسبة الاستثمار لتحديد عدد الصوب والدفعة المقدمة ثم احجز جلسة استشارية أو معاينة ميدانية.'],
        ['2', 'التعاقد القانوني وتخصيص الصوب', 'يتم توقيع العقد الرسمي وتحديد أرقام الصوب ومواقعها وجدول الأقساط المعتمدة.'],
        ['3', 'التشغيل الزراعي والمتابعة عبر البوابة', 'يُنشئ فريقنا حسابك في بوابة المستثمر الخاصة لمتابعة المحاصيل والأقساط والأرباح المعتمدة إدارياً.'],
        ['4', 'الحصاد وتوزيع العوائد', 'بعد كل موسم زراعي تُراجع تقارير الإنتاج والأرباح إدارياً وتُتاح في كشف حسابك القابل للتصدير.']
      ]
    : [
        ['1', 'Plan Calculation & Consultation', 'Use the Investment Calculator to estimate units and down payment, then book a consultation or site tour.'],
        ['2', 'Legal Contracting & Allocation', 'Execute the formal contract specifying greenhouse numbers, exact site sectors, and installment schedules.'],
        ['3', 'Turnkey Agronomy & Portal Access', 'Receive private Investor Portal credentials to monitor approved crop cycles, installments, and documents.'],
        ['4', 'Harvest & Verified Distributions', 'Seasonal yields and profit distributions undergo administrative verification before release to your account statement.']
      ];

  return `
  ${renderPageHero({
    lang,
    image: SECTION_BANNERS['how-it-works'],
    badge: lang === 'ar' ? 'رحلة المستثمر' : 'Investor Journey',
    title: t(lang, 'nav.howItWorks'),
    subtitle: lang === 'ar' ? 'خطوات واضحة وموثقة من المعاينة الأولية حتى تشغيل الصوب ومتابعة العوائد.' : 'A transparent, documented path from initial consultation to greenhouse operations and reporting.'
  })}
  <section class="section">
    <div class="container stack">
      <div class="grid grid--cols-2">
        ${steps.map(([num, title, desc]) => `
          <article class="card stack">
            <div class="cluster">
              <span class="step-number">${num}</span>
              <h2 class="card__title">${escapeHtml(title)}</h2>
            </div>
            <p style="margin: 0; color: var(--color-text-secondary);">${escapeHtml(desc)}</p>
          </article>
        `).join('')}
      </div>
      <div><a class="btn btn--primary" href="/${escapeHtml(lang)}/invest">${escapeHtml(t(lang, 'nav.invest'))}</a></div>
    </div>
  </section>`;
}

export function renderServicesPage({ lang }) {
  const services = lang === 'ar'
    ? [
        ['تصميم وإنشاء الصوب الزراعية', 'إنشاء صوب حديثة بمساحة 360 م² مجهزة بالري بالتنقيط وأنظمة التبريد والتهوية.'],
        ['الإدارة الزراعية الكاملة', 'إشراف مهندسين زراعيين على التقاوي والتسميد والمكافحة الحيوية وجودة الإنتاج.'],
        ['التسويق وسلاسل الإمداد', 'تصريف المحاصيل في الأسواق المركزية وقنوات التصدير وفق عقود توريد منظمة.'],
        ['الحوكمة الرقمية وبوابة المستثمر', 'تقارير موثقة ومراجعة إدارية مسبقة لكل تحديث زراعي أو مالي قبل ظهوره للمستثمر.']
      ]
    : [
        ['Greenhouse Design & Construction', 'Turnkey 360 m² protected agriculture structures equipped with precision drip irrigation and ventilation.'],
        ['Full Agronomy Management', 'Dedicated agricultural engineers overseeing planting, fertigation, pest control, and yield quality.'],
        ['Wholesale Marketing & Off-take', 'Structured crop grading and distribution across wholesale and export channels.'],
        ['Digital Governance & Investor Portal', 'Strict administrative verification before any operational or financial update appears in your private portal.']
      ];
  return `
  ${renderPageHero({
    lang,
    image: SECTION_BANNERS.services,
    badge: lang === 'ar' ? 'حلول متكاملة' : 'Turnkey Solutions',
    title: t(lang, 'nav.services'),
    subtitle: lang === 'ar' ? 'من إنشاء البنية التحتية والزراعة الدقيقة حتى التسويق والمتابعة الرقمية.' : 'From infrastructure construction and precision agronomy to wholesale marketing and portal governance.'
  })}
  <section class="section">
    <div class="container stack">
      <div class="grid grid--cols-2">
        ${services.map(([title, desc]) => `
          <article class="card kpi-card kpi-card--gold stack">
            <h2 class="card__title">${escapeHtml(title)}</h2>
            <p style="margin: 0; color: var(--color-text-secondary);">${escapeHtml(desc)}</p>
          </article>
        `).join('')}
      </div>
    </div>
  </section>`;
}

export function renderNewsPage({ lang, posts }) {
  return `
  ${renderPageHero({
    lang,
    image: SECTION_BANNERS.news,
    badge: lang === 'ar' ? 'تقارير ومستجدات' : 'Field Updates',
    title: t(lang, 'nav.news'),
    subtitle: lang === 'ar' ? 'أحدث أخبار المواسم الزراعية والإنجازات الميدانية والتوسعات.' : 'Latest harvest milestones, field operations updates, and project expansions.'
  })}
  <section class="section">
    <div class="container stack">
      <div class="grid grid--cols-2">
        ${posts.map((n) => `
          <article class="card stack">
            <span class="badge">${escapeHtml(String(n.published_at || '').slice(0, 10))}</span>
            <h2 class="card__title">${escapeHtml(n.title)}</h2>
            <p style="margin: 0; color: var(--color-text-secondary);">${escapeHtml(n.excerpt)}</p>
            <a class="btn btn--secondary btn--sm" href="/${escapeHtml(lang)}/news/${escapeHtml(n.slug)}">${escapeHtml(t(lang, 'common.learnMore'))}</a>
          </article>
        `).join('')}
      </div>
    </div>
  </section>`;
}

export function renderNewsDetailPage({ lang, post }) {
  return `
  ${renderPageHero({
    lang,
    image: SECTION_BANNERS.news,
    badge: String(post.published_at || '').slice(0, 10),
    title: post.title,
    subtitle: post.excerpt
  })}
  <section class="section">
    <div class="container--narrow stack">
      <a href="/${escapeHtml(lang)}/news">&larr; ${escapeHtml(t(lang, 'nav.news'))}</a>
      <div class="card"><p style="margin: 0; white-space: pre-line;">${escapeHtml(post.body)}</p></div>
    </div>
  </section>`;
}

export function renderFaqPage({ lang, faqs }) {
  return `
  ${renderPageHero({
    lang,
    image: SECTION_BANNERS.faq,
    badge: lang === 'ar' ? 'دليل المستثمر' : 'Investor Guide',
    title: t(lang, 'nav.faq'),
    subtitle: lang === 'ar' ? 'إجابات وافية حول التعاقد، الإدارة، الأقساط، وآلية اعتماد الأرباح.' : 'Clear answers on contracting, agronomy operations, installments, and profit approvals.'
  })}
  <section class="section">
    <div class="container--narrow stack">
      ${faqs.map((f) => `
        <details class="card" open>
          <summary style="font-weight: 700; cursor: pointer;">${escapeHtml(f.question)}</summary>
          <p style="margin-block: var(--space-3) 0; color: var(--color-text-secondary);">${escapeHtml(f.answer)}</p>
        </details>
      `).join('')}
    </div>
  </section>`;
}

export function renderContactPage({ lang, settings, projects, csrfToken }) {
  const c = settings.contact;
  const address = getLocalizedField(c.physical_address, lang, '');
  const hours = getLocalizedField(c.working_hours, lang, '');
  return `
  ${renderPageHero({
    lang,
    image: SECTION_BANNERS.contact,
    badge: lang === 'ar' ? 'خدمة المستثمرين' : 'Investor Relations',
    title: t(lang, 'nav.contact'),
    subtitle: lang === 'ar' ? 'احجز موعداً استشارياً أو أرسل استفسارك وتواصل معنا مباشرة.' : 'Schedule a consultation, send an inquiry, or connect with our team directly.'
  })}
  <section class="section">
    <div class="container stack">
      <div class="grid grid--cols-3">
        <div class="card kpi-card stack">
          <h2 class="card__title">${escapeHtml(lang === 'ar' ? 'قنوات التواصل المباشرة' : 'Direct Contact Channels')}</h2>
          <ul class="stack" style="list-style: none; padding: 0; font-size: var(--text-sm);">
            ${c.mobile_number ? `<li><strong>${escapeHtml(lang === 'ar' ? 'الهاتف:' : 'Phone:')}</strong> <a href="tel:${escapeHtml(c.mobile_number)}" dir="ltr" style="unicode-bidi: isolate;">${escapeHtml(c.mobile_number)}</a></li>` : ''}
            ${c.email_address ? `<li><strong>${escapeHtml(lang === 'ar' ? 'البريد:' : 'Email:')}</strong> <a href="mailto:${escapeHtml(c.email_address)}">${escapeHtml(c.email_address)}</a></li>` : ''}
            ${address ? `<li><strong>${escapeHtml(lang === 'ar' ? 'العنوان:' : 'Address:')}</strong> ${escapeHtml(address)}</li>` : ''}
            ${hours ? `<li><strong>${escapeHtml(lang === 'ar' ? 'ساعات العمل:' : 'Hours:')}</strong> ${escapeHtml(hours)}</li>` : ''}
          </ul>
          ${settings.whatsappUrl ? `<a class="btn btn--primary" href="${escapeHtml(settings.whatsappUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t(lang, 'common.whatsappCta'))}</a>` : ''}
        </div>

        <div class="card stack">
          <h2 class="card__title">${escapeHtml(t(lang, 'forms.appointmentTitle'))}</h2>
          <form class="form-grid" method="post" action="/api/public/leads">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <input type="hidden" name="lead_type" value="appointment_booking">
            <input type="hidden" name="lang" value="${escapeHtml(lang)}">
            <input type="hidden" name="redirect_to" value="/${escapeHtml(lang)}/contact">
            <div class="form-field">
              <label class="form-label" for="apt-name">${escapeHtml(t(lang, 'forms.fullName'))}</label>
              <input class="form-control" id="apt-name" name="full_name" type="text" required>
            </div>
            <div class="form-field">
              <label class="form-label" for="apt-phone">${escapeHtml(t(lang, 'forms.phone'))}</label>
              <input class="form-control" id="apt-phone" name="phone" type="tel" required>
            </div>
            <div class="grid grid--cols-2">
              <div class="form-field">
                <label class="form-label" for="apt-date">${escapeHtml(t(lang, 'forms.preferredDate'))}</label>
                <input class="form-control" id="apt-date" name="preferred_date" type="date" required>
              </div>
              <div class="form-field">
                <label class="form-label" for="apt-time">${escapeHtml(t(lang, 'forms.preferredTime'))}</label>
                <input class="form-control" id="apt-time" name="preferred_time" type="text" placeholder="11:00 AM">
              </div>
            </div>
            <div class="form-field">
              <label class="form-label" for="apt-notes">${escapeHtml(t(lang, 'forms.notes'))}</label>
              <textarea class="form-control" id="apt-notes" name="notes"></textarea>
            </div>
            <button class="btn btn--primary" type="submit">${escapeHtml(t(lang, 'common.submit'))}</button>
          </form>
        </div>

        <div class="card stack">
          <h2 class="card__title">${escapeHtml(t(lang, 'forms.inquiryTitle'))}</h2>
          <form class="form-grid" method="post" action="/api/public/leads">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <input type="hidden" name="lead_type" value="general_inquiry">
            <input type="hidden" name="lang" value="${escapeHtml(lang)}">
            <input type="hidden" name="redirect_to" value="/${escapeHtml(lang)}/contact">
            <div class="form-field">
              <label class="form-label" for="inq-name">${escapeHtml(t(lang, 'forms.fullName'))}</label>
              <input class="form-control" id="inq-name" name="full_name" type="text" required>
            </div>
            <div class="form-field">
              <label class="form-label" for="inq-phone">${escapeHtml(t(lang, 'forms.phone'))}</label>
              <input class="form-control" id="inq-phone" name="phone" type="tel" required>
            </div>
            <div class="form-field">
              <label class="form-label" for="inq-email">${escapeHtml(t(lang, 'forms.email'))}</label>
              <input class="form-control" id="inq-email" name="email" type="email" required>
            </div>
            <div class="form-field">
              <label class="form-label" for="inq-msg">${escapeHtml(t(lang, 'forms.message'))}</label>
              <textarea class="form-control" id="inq-msg" name="notes" required></textarea>
            </div>
            <button class="btn btn--secondary" type="submit">${escapeHtml(t(lang, 'common.submit'))}</button>
          </form>
        </div>
      </div>
    </div>
  </section>`;
}
