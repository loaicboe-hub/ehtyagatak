import fs from 'node:fs';
import path from 'node:path';
import { getDb, applyMigrations, withTransaction, queryOne, runSql } from './client.mjs';
import { ROOT_DIR } from '../config/env.mjs';

import { RBAC_CONFIG } from '../../config/rbac-raw.mjs';

export function seedDatabase(db = getDb()) {
  applyMigrations(db);

  let rbac = RBAC_CONFIG;
  try {
    const rbacPath = path.join(ROOT_DIR, 'config/rbac.json');
    if (fs.existsSync(rbacPath)) {
      rbac = JSON.parse(fs.readFileSync(rbacPath, 'utf8'));
    }
  } catch {
    rbac = RBAC_CONFIG;
  }

  withTransaction(db, () => {
    // 1. Seed Roles & Role Permissions (idempotent)
    const insertRole = db.prepare(`
      INSERT INTO roles (slug, name, description, is_system)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(slug) DO UPDATE SET name = excluded.name, description = excluded.description
    `);
    const getRoleId = db.prepare('SELECT id FROM roles WHERE slug = ?');
    const insertPerm = db.prepare(`
      INSERT OR IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)
    `);

    for (const [slug, roleDef] of Object.entries(rbac.roles)) {
      insertRole.run(slug, roleDef.label, roleDef.description);
      const roleRow = getRoleId.get(slug);
      for (const perm of roleDef.permissions) {
        insertPerm.run(roleRow.id, perm);
      }
    }

    // 2. Centralized Website Settings (seed only if missing so admin edits persist)
    const insertSetting = db.prepare(`
      INSERT OR IGNORE INTO website_settings (setting_key, setting_group, value_json, is_public)
      VALUES (?, ?, ?, ?)
    `);

    insertSetting.run(
      'site_identity',
      'identity',
      JSON.stringify({
        site_name: {
          ar: 'شركة احتياجاتك للتنمية المستدامة',
          en: 'Ehtyajatak for Sustainable Development'
        },
        tagline: {
          ar: 'استثمار زراعي مستدام في الصوب الزراعية الحديثة',
          en: 'Sustainable Agricultural Investment in Modern Greenhouses'
        },
        logo_url: '/assets/logo.png',
        favicon_url: '/assets/favicon.png',
        copyright_text: {
          ar: '© 2026 شركة احتياجاتك للتنمية المستدامة. جميع الحقوق محفوظة.',
          en: '© 2026 Ehtyajatak for Sustainable Development. All rights reserved.'
        }
      }),
      1
    );

    insertSetting.run(
      'contact_info',
      'contact',
      JSON.stringify({
        whatsapp_number: '201000000000',
        mobile_number: '+20 100 000 0000',
        email_address: 'info@ehtyajatak.com',
        physical_address: {
          ar: 'القاهرة الجديدة — التجمع الخامس، مصر',
          en: 'New Cairo — Fifth Settlement, Egypt'
        },
        working_hours: {
          ar: 'الأحد إلى الخميس: 9:00 صباحاً – 5:00 مساءً',
          en: 'Sunday – Thursday: 9:00 AM – 5:00 PM'
        },
        show_whatsapp_floating_cta: true,
        visible_channels: ['whatsapp', 'phone', 'email', 'address', 'hours']
      }),
      1
    );

    insertSetting.run(
      'navigation_layout',
      'navigation',
      JSON.stringify({
        social_links: {
          facebook: 'https://facebook.com',
          linkedin: 'https://linkedin.com',
          youtube: 'https://youtube.com',
          instagram: 'https://instagram.com'
        }
      }),
      1
    );

    insertSetting.run(
      'languages_config',
      'localization',
      JSON.stringify({
        default_language: 'ar',
        enabled_languages: ['ar', 'en']
      }),
      1
    );

    insertSetting.run(
      'seo_global',
      'seo',
      JSON.stringify({
        default_title: {
          ar: 'شركة احتياجاتك للتنمية المستدامة | الاستثمار في الصوب الزراعية',
          en: 'Ehtyajatak for Sustainable Development | Greenhouse Investment'
        },
        default_description: {
          ar: 'فرص استثمارية حقيقية في الصوب الزراعية الحديثة بإدارة زراعية محترفة وعقود موثقة وبوابة متابعة إلكترونية للمستثمرين.',
          en: 'Real agricultural greenhouse investment opportunities with professional farm management, documented contracts, and a dedicated investor portal.'
        },
        canonical_origin: 'http://localhost:3000',
        sitemap_enabled: true,
        robots_allow_indexing: true,
        robots_custom_rules: ''
      }),
      1
    );

    insertSetting.run(
      'investment_calculator',
      'calculator',
      JSON.stringify({
        greenhouse_area_sqm: 360,
        greenhouse_price_egp: 220000,
        min_greenhouses: 3,
        down_payment_percent: 35,
        annual_cycles: 2,
        disclaimer_ar: 'الأرقام المعروضة تقديرية استرشادية وفق المواصفات القياسية للصوبة (360 م²) وتخضع لبنود العقد الفعلي والموسم الزراعي.',
        disclaimer_en: 'Displayed figures are indicative estimates based on standard greenhouse specifications (360 m²) and are subject to final contract terms and agricultural seasons.'
      }),
      1
    );

    // 3. Core Public Pages & Translations (is_verified = 0 until human review)
    const pagesSeed = [
      {
        key: 'home', template: 'home', order: 1,
        ar: { slug: 'home', title: 'الرئيسية', summary: 'الاستثمار الزراعي المستدام في الصوب الزراعية الحديثة', seoTitle: 'الرئيسية | شركة احتياجاتك للتنمية المستدامة' },
        en: { slug: 'home', title: 'Home', summary: 'Sustainable agricultural investment in modern greenhouses', seoTitle: 'Home | Ehtyajatak for Sustainable Development' }
      },
      {
        key: 'about', template: 'about', order: 2,
        ar: {
          slug: 'about', title: 'من نحن',
          summary: 'رؤيتنا ورسالتنا في تطوير الزراعة المحمية المستدامة وإدارة الأصول الزراعية بكفاءة.',
          body: 'شركة احتياجاتك للتنمية المستدامة هي شركة متخصصة في إنشاء وإدارة وتشغيل مشروعات الصوب الزراعية الحديثة بنظام الشراكة والاستثمار الزراعي المدار. نجمع بين الخبرة الهندسية والزراعية وأنظمة المتابعة الرقمية الشفافة لتعظيم العائد المستدام وحماية أصول المستثمرين.'
        },
        en: {
          slug: 'about', title: 'About Us',
          summary: 'Our mission and vision in modern protected agriculture and sustainable farm asset management.',
          body: 'Ehtyajatak for Sustainable Development specializes in building, managing, and operating modern agricultural greenhouse complexes. We combine agronomy expertise, water-efficient infrastructure, and transparent digital reporting to protect investor assets and deliver sustainable harvests.'
        }
      },
      {
        key: 'projects', template: 'projects', order: 3,
        ar: { slug: 'projects', title: 'المشروعات الزراعية', summary: 'استعرض مواقع الصوب الزراعية المتاحة والحالة التشغيلية لكل مشروع.' },
        en: { slug: 'projects', title: 'Projects', summary: 'Explore active greenhouse complexes, locations, and available units.' }
      },
      {
        key: 'invest', template: 'invest', order: 4,
        ar: { slug: 'invest', title: 'الاستثمار في الصوب الزراعية', summary: 'احسب خطتك الاستثمارية وقدّم طلب الاستثمار أو حجز موعد استشاري.' },
        en: { slug: 'invest', title: 'Greenhouse Investment', summary: 'Calculate your greenhouse investment plan and submit a direct investment request.' }
      },
      {
        key: 'how-it-works', template: 'how-it-works', order: 5,
        ar: { slug: 'how-it-works', title: 'خطوات التعاقد', summary: 'من المعاينة والتعاقد القانوني حتى التشغيل والمتابعة عبر بوابة المستثمر.' },
        en: { slug: 'how-it-works', title: 'Contracting Steps', summary: 'From site visit and legal contracting to operations and investor portal tracking.' }
      },
      {
        key: 'services', template: 'services', order: 6,
        ar: { slug: 'services', title: 'خدماتنا', summary: 'إنشاء الصوب، الإدارة الزراعية الكاملة، التسويق الزراعي، والمتابعة الرقمية.' },
        en: { slug: 'services', title: 'Services', summary: 'Turnkey greenhouse construction, full farm management, crop marketing, and digital reporting.' }
      },
      {
        key: 'news', template: 'news', order: 7,
        ar: { slug: 'news', title: 'الأخبار والتطورات', summary: 'أحدث تقارير المواسم الزراعية والتوسعات الميدانية للشركة.' },
        en: { slug: 'news', title: 'News & Updates', summary: 'Latest harvest milestones, expansion updates, and company news.' }
      },
      {
        key: 'faq', template: 'faq', order: 8,
        ar: { slug: 'faq', title: 'الأسئلة الشائعة', summary: 'إجابات واضحة حول التعاقد، الإدارة، الأرباح، والأقساط.' },
        en: { slug: 'faq', title: 'FAQ', summary: 'Clear answers on contracting, management, profit distributions, and installments.' }
      },
      {
        key: 'contact', template: 'contact', order: 9,
        ar: { slug: 'contact', title: 'تواصل معنا', summary: 'احجز موعداً في مقر الشركة أو أرسل استفسارك وتواصل عبر واتساب.' },
        en: { slug: 'contact', title: 'Contact Us', summary: 'Book a consultation appointment, send an inquiry, or message us on WhatsApp.' }
      },
      {
        key: 'policies', template: 'policies', order: 10,
        ar: {
          slug: 'policies', title: 'السياسات وإخلاء المسؤولية الاستثمارية',
          summary: 'السياسات التنظيمية وضوابط الشفافية وإخلاء المسؤولية الاستثمارية.',
          body: 'تخضع جميع المعاملات الاستثمارية لعقود رسمية موثقة تحدد حقوق والتزامات الأطراف بدقة. لا تمثل حاسبة الاستثمار على الموقع التزاماً تعاقدياً ملزماً أو ضماناً لعائد ثابت، حيث ترتبط العوائد الفعلية بالإنتاجية الموسمية وظروف السوق والتكاليف التشغيلية المعتمدة. تخضع جميع البيانات المالية والتشغيلية المنشورة في بوابة المستثمر للمراجعة والاعتماد الإداري المسبق.'
        },
        en: {
          slug: 'policies', title: 'Policies & Investment Disclaimers',
          summary: 'Governance policies, privacy standards, and investment risk disclosures.',
          body: 'All investments are governed exclusively by executed legal contracts defining rights, installments, and management terms. Figures shown in the online calculator are indicative estimates and do not constitute a guaranteed fixed return. Operational, installment, and profit distribution records appear in the Private Investor Portal only after mandatory administrative verification and approval.'
        }
      }
    ];

    const insertPage = db.prepare(`
      INSERT OR IGNORE INTO pages (page_key, template_type, is_visible, is_system, sort_order)
      VALUES (?, ?, 1, 1, ?)
    `);
    const getPage = db.prepare('SELECT id FROM pages WHERE page_key = ?');
    const insertPageTrans = db.prepare(`
      INSERT OR IGNORE INTO page_translations (page_id, language_code, slug, title, content_json, seo_title, seo_description, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);

    for (const p of pagesSeed) {
      insertPage.run(p.key, p.template, p.order);
      const row = getPage.get(p.key);
      for (const lang of ['ar', 'en']) {
        const t = p[lang];
        insertPageTrans.run(
          row.id,
          lang,
          t.slug,
          t.title,
          JSON.stringify({ summary: t.summary || '', body: t.body || t.summary || '' }),
          t.seoTitle || `${t.title} | ${lang === 'ar' ? 'شركة احتياجاتك للتنمية المستدامة' : 'Ehtyajatak'}`,
          t.summary || '',
        );
      }
    }

    // 4. Homepage Sections
    const sectionsSeed = [
      {
        key: 'hero', type: 'hero', order: 1,
        ar: {
          heading: 'استثمر في الصوب الزراعية الحديثة بعقود موثقة وإدارة متكاملة',
          subheading: 'شركة احتياجاتك للتنمية المستدامة تمكّنك من امتلاك وتشغيل صوب زراعية منتجة بمساحة 360 م² للصوبة، مع متابعة رقمية دقيقة للمحاصيل والأقساط والأرباح.',
          ctaLabel: 'احسب استثمارك الآن', ctaUrl: '/invest',
          body: { badge: 'الاستثمار الزراعي المستدام', secondaryCtaLabel: 'استكشف المشروعات', secondaryCtaUrl: '/projects' }
        },
        en: {
          heading: 'Invest in Modern Agricultural Greenhouses with Full Turnkey Management',
          subheading: 'Ehtyajatak for Sustainable Development empowers you to own and operate productive 360 m² greenhouses with documented contracts and transparent digital tracking of crops, installments, and profits.',
          ctaLabel: 'Calculate Your Investment', ctaUrl: '/invest',
          body: { badge: 'Sustainable Agribusiness Investment', secondaryCtaLabel: 'Explore Projects', secondaryCtaUrl: '/projects' }
        }
      },
      {
        key: 'value_pillars', type: 'features', order: 2,
        ar: {
          heading: 'لماذا الاستثمار مع احتياجاتك للتنمية المستدامة؟',
          subheading: 'منظومة زراعية وإدارية متكاملة تجمع بين الخبرة الميدانية والشفافية المالية.',
          body: {
            items: [
              { title: 'ملكية وتشغيل موثق', desc: 'عقود رسمية تحدد أرقام الصوب ومساحتها ومواقعها وجدول السداد والتوزيعات.' },
              { title: 'إدارة زراعية متخصصة', desc: 'فريق مهندسين زراعيين يتولى الزراعة والري والتغذية ومكافحة الآفات والتسويق.' },
              { title: 'بوابة مستثمر خاصة ومعزولة', desc: 'متابعة لحظية للصوب والمحاصيل والأرباح والأقساط وكشوف الحساب المعتمدة إدارياً.' }
            ]
          }
        },
        en: {
          heading: 'Why Invest with Ehtyajatak?',
          subheading: 'An integrated agronomy and asset-management platform built on field excellence and financial transparency.',
          body: {
            items: [
              { title: 'Documented Ownership & Contracts', desc: 'Formal contracts specifying greenhouse numbers, exact areas, site locations, and payment schedules.' },
              { title: 'Professional Agronomy Management', desc: 'Dedicated agricultural engineers managing planting, drip irrigation, crop protection, and wholesale off-take.' },
              { title: 'Isolated Investor Portal', desc: 'Dedicated private dashboard to track approved greenhouse status, crop yields, installments, and profit distributions.' }
            ]
          }
        }
      },
      {
        key: 'hero_slides', type: 'hero_carousel', order: 0,
        ar: {
          heading: 'شرائح البانر الرئيسي',
          subheading: 'أربع شرائح تفاعلية للواجهة الرئيسية',
          body: {
            slides: [
              {
                image: '/assets/hero/slide-1.jpg',
                alt: 'صوب زراعية حديثة وحقول خضراء مستدامة عند شروق الشمس',
                badge: 'الاستثمار الزراعي المستدام',
                heading: 'استثمر في الصوب الزراعية الحديثة بعقود موثقة وإدارة متكاملة',
                subheading: 'شركة احتياجاتك للتنمية المستدامة تمكّنك من امتلاك وتشغيل صوب زراعية منتجة بمساحة 360 م² للصوبة في مجمعات زراعية متكاملة.',
                ctaLabel: 'احسب استثمارك الآن',
                ctaUrl: '/invest',
                secondaryCtaLabel: 'استكشف المشروعات',
                secondaryCtaUrl: '/projects'
              },
              {
                image: '/assets/hero/slide-2.jpg',
                alt: 'تقنيات الصوب الزراعية الحديثة وأنظمة الري والتحكم المناخي',
                badge: 'تقنيات الزراعة المحمية المتطورة',
                heading: 'بنية تحتية زراعية حديثة ترفع كفاءة الإنتاج وجودة المحصول',
                subheading: 'أنظمة ري بالتنقيط وتسميد آلي وتحكم مناخي متطور تحت إشراف مهندسين زراعيين متخصصين وبوابة متابعة رقمية.',
                ctaLabel: 'تعرف على خدماتنا',
                ctaUrl: '/services',
                secondaryCtaLabel: 'خطوات التعاقد',
                secondaryCtaUrl: '/how-it-works'
              },
              {
                image: '/assets/hero/slide-3.jpg',
                alt: 'محاصيل طازجة عالية الجودة مع نظام الري بالتنقيط داخل الصوبة',
                badge: 'إنتاجية زراعية عالية الجودة',
                heading: 'محاصيل تصديرية طازجة ودورات إنتاجية متعددة على مدار العام',
                subheading: 'زراعة الفلفل الألوان والطماطم الشيري والخيار وفق معايير الفرز والتعبئة المعتمدة وتوزيع الأرباح بعد اعتماد الإدارة.',
                ctaLabel: 'استعرض المشروعات',
                ctaUrl: '/projects',
                secondaryCtaLabel: 'دخول المستثمرين',
                secondaryCtaUrl: '/login'
              },
              {
                image: '/assets/hero/slide-4.jpg',
                alt: 'مشهد بانورامي واسع للحقول الخضراء والمستقبل الزراعي المستدام',
                badge: 'نحو مستقبل زراعي مستدام',
                heading: 'تنمية مستدامة وحوكمة رقمية تحفظ أصول المستثمر وتنمي عوائده',
                subheading: 'طاقة شمسية، ترشيد ذكي للمياه، ومراجعة إدارية مسبقة لكل تحديث مالي أو تشغيلي قبل ظهوره في كشف حسابك.',
                ctaLabel: 'احجز موعد استشارة',
                ctaUrl: '/contact',
                secondaryCtaLabel: 'السياسات والشفافية',
                secondaryCtaUrl: '/policies'
              }
            ]
          }
        },
        en: {
          heading: 'Homepage Hero Carousel Slides',
          subheading: 'Four interactive photographic hero slides',
          body: {
            slides: [
              {
                image: '/assets/hero/slide-1.jpg',
                alt: 'Modern glass greenhouses stretching across lush emerald sustainable farming fields at sunrise',
                badge: 'Sustainable Agribusiness Investment',
                heading: 'Invest in Modern Agricultural Greenhouses with Turnkey Management',
                subheading: 'Ehtyajatak empowers you to own and operate productive 360 m² greenhouses backed by documented contracts and integrated farm operations.',
                ctaLabel: 'Calculate Your Investment',
                ctaUrl: '/invest',
                secondaryCtaLabel: 'Explore Projects',
                secondaryCtaUrl: '/projects'
              },
              {
                image: '/assets/hero/slide-2.jpg',
                alt: 'Interior of a high-tech commercial greenhouse with precision irrigation and climate control',
                badge: 'Advanced Protected-Farming Tech',
                heading: 'Modern Greenhouse Infrastructure Built for High Efficiency',
                subheading: 'Precision drip fertigation, automated climate ventilation, and expert agronomy backed by our private Investor Portal.',
                ctaLabel: 'Explore Services',
                ctaUrl: '/services',
                secondaryCtaLabel: 'How It Works',
                secondaryCtaUrl: '/how-it-works'
              },
              {
                image: '/assets/hero/slide-3.jpg',
                alt: 'Close-up of fresh heirloom tomatoes and bell peppers with precision drip irrigation emitters',
                badge: 'High-Yield Fresh Produce',
                heading: 'Export-Grade Harvests Across Multi-Cycle Greenhouse Seasons',
                subheading: 'Cultivating high-demand bell peppers, cherry tomatoes, and cucumbers with transparent verified yield and profit reporting.',
                ctaLabel: 'View Active Projects',
                ctaUrl: '/projects',
                secondaryCtaLabel: 'Investor Portal',
                secondaryCtaUrl: '/login'
              },
              {
                image: '/assets/hero/slide-4.jpg',
                alt: 'Panoramic aerial landscape of emerald cultivated fields, greenhouses, and solar farm infrastructure',
                badge: 'A Sustainable Agricultural Future',
                heading: 'Sustainable Growth & Digital Governance Protecting Your Assets',
                subheading: 'Solar-assisted farming, water-efficient infrastructure, and mandatory administrative approval before financial updates release.',
                ctaLabel: 'Book a Consultation',
                ctaUrl: '/contact',
                secondaryCtaLabel: 'Policies & Governance',
                secondaryCtaUrl: '/policies'
              }
            ]
          }
        }
      }
    ];

    const insertSection = db.prepare(`
      INSERT OR IGNORE INTO homepage_sections (section_key, section_type, sort_order, is_visible)
      VALUES (?, ?, ?, 1)
    `);
    const getSection = db.prepare('SELECT id FROM homepage_sections WHERE section_key = ?');
    const insertSectionTrans = db.prepare(`
      INSERT OR IGNORE INTO homepage_section_translations (section_id, language_code, heading, subheading, body_json, cta_label, cta_url, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);

    for (const s of sectionsSeed) {
      insertSection.run(s.key, s.type, s.order);
      const row = getSection.get(s.key);
      for (const lang of ['ar', 'en']) {
        const t = s[lang];
        insertSectionTrans.run(
          row.id, lang, t.heading, t.subheading, JSON.stringify(t.body), t.ctaLabel || null, t.ctaUrl || null
        );
      }
    }

    // 5. Starter Projects (only if projects table empty)
    const projectCount = queryOne(db, 'SELECT COUNT(*) AS cnt FROM projects').cnt;
    if (projectCount === 0) {
      const p1 = runSql(
        db,
        `INSERT INTO projects (slug, location_ar, location_en, total_greenhouses, available_greenhouses, area_per_greenhouse_sqm, unit_price_egp, status, is_featured, is_published, sort_order)
         VALUES ('oasis-greenhouses-phase-1', 'طريق مصر إسماعيلية الصحراوي — قطاع الواحة', 'Cairo–Ismailia Desert Road — Al-Waha Sector', 60, 18, 360, 220000, 'active', 1, 1, 1)`
      ).lastInsertRowid;
      runSql(db, `INSERT INTO project_translations (project_id, language_code, title, summary, description, crop_types, is_verified) VALUES (?, 'ar', ?, ?, ?, ?, 0)`,
        p1,
        'مجمع الواحة للصوب الزراعية — المرحلة الأولى',
        'مجمع زراعي متكامل يضم 60 صوبة مجهزة بأنظمة ري بالتنقيط وتحكم مناخي لإنتاج المحاصيل التصديرية.',
        'يقع مجمع الواحة في منطقة استراتيجية قريبة من مراكز التوزيع والتصدير، ويضم آبار مياه جوفية مرخصة ومحطات تسميد آلية بإشراف هندسي كامل على مدار العام.',
        'فلفل ألوان، خيار صوب، طماطم شيري'
      );
      runSql(db, `INSERT INTO project_translations (project_id, language_code, title, summary, description, crop_types, is_verified) VALUES (?, 'en', ?, ?, ?, ?, 0)`,
        p1,
        'Al-Waha Greenhouse Complex — Phase I',
        'Integrated 60-greenhouse agricultural complex equipped with automated drip irrigation and climate management for high-value crops.',
        'Strategically positioned near major logistics corridors, Al-Waha features licensed groundwater wells, fertigation stations, and year-round agronomy supervision.',
        'Colored Bell Peppers, Greenhouse Cucumbers, Cherry Tomatoes'
      );

      const p2 = runSql(
        db,
        `INSERT INTO projects (slug, location_ar, location_en, total_greenhouses, available_greenhouses, area_per_greenhouse_sqm, unit_price_egp, status, is_featured, is_published, sort_order)
         VALUES ('delta-south-sustainable-park', 'امتداد غرب المنيا — المجمع المستدام', 'West Minya Extension — Sustainable Agri-Park', 80, 34, 360, 220000, 'active', 1, 1, 2)`
      ).lastInsertRowid;
      runSql(db, `INSERT INTO project_translations (project_id, language_code, title, summary, description, crop_types, is_verified) VALUES (?, 'ar', ?, ?, ?, ?, 0)`,
        p2,
        'المجمع الزراعي المستدام — امتداد الصعيد',
        'توسعة حديثة بقدرة 80 صوبة زراعية تعتمد على الطاقة الشمسية وأنظمة ترشيد المياه الحديثة.',
        'مشروع مصمم خصيصاً لدورات زراعية مزدوجة في العام مع ربط مباشر بأسواق الجملة وشبكات التصدير المعتمدة.',
        'طماطم، فاصوليا خضراء، فراولة معلقة'
      );
      runSql(db, `INSERT INTO project_translations (project_id, language_code, title, summary, description, crop_types, is_verified) VALUES (?, 'en', ?, ?, ?, ?, 0)`,
        p2,
        'Sustainable Agri-Park — West Minya Extension',
        'Modern 80-unit expansion powered by solar pumping and precision water-saving fertigation systems.',
        'Engineered for dual annual cropping cycles with direct wholesale off-take agreements and quality grading.',
        'Tomatoes, Green Beans, Vertical Strawberries'
      );
    }

    // 6. Starter News & FAQs (only if empty)
    const newsCount = queryOne(db, 'SELECT COUNT(*) AS cnt FROM news_posts').cnt;
    if (newsCount === 0) {
      const n1 = runSql(db, `INSERT INTO news_posts (slug, is_published, published_at) VALUES ('spring-harvest-milestone-2026', 1, '2026-10-15T10:00:00Z')`).lastInsertRowid;
      runSql(db, `INSERT INTO news_post_translations (post_id, language_code, title, excerpt, body, is_verified) VALUES (?, 'ar', ?, ?, ?, 0)`,
        n1,
        'إتمام موسم الحصاد الخريفي في قطاع الواحة بنسبة جودة تصديرية مرتفعة',
        'نجح الفريق الزراعي في تحقيق إنتاجية متميزة لمحاصيل الفلفل الألوان والخيار مع تسليم تقارير الإنتاج للمستثمرين.',
        'أتمت شركة احتياجاتك للتنمية المستدامة موسم الحصاد في قطاع الواحة مع تطبيق معايير الفرز والتعبئة المعتمدة، وتم إدراج تقارير الإنتاج والأرباح للمراجعة الإدارية تمهيداً لإتاحتها عبر بوابة المستثمر.'
      );
      runSql(db, `INSERT INTO news_post_translations (post_id, language_code, title, excerpt, body, is_verified) VALUES (?, 'en', ?, ?, ?, 0)`,
        n1,
        'Autumn Harvest Milestone Completed at Al-Waha Sector',
        'Our agronomy team completed harvest grading for bell peppers and cucumbers with production reports submitted for verification.',
        'Ehtyajatak for Sustainable Development completed the harvest cycle at Al-Waha Sector under strict quality grading protocols. Production and distribution summaries have been queued for administrative review prior to investor portal release.'
      );
    }

    const faqCount = queryOne(db, 'SELECT COUNT(*) AS cnt FROM faqs').cnt;
    if (faqCount === 0) {
      const faqList = [
        {
          cat: 'investment', order: 1,
          ar: ['ما الحد الأدنى للاستثمار في الصوب الزراعية؟', 'الحد الأدنى المعتمد حالياً هو 3 صوب زراعية بمساحة 360 م² لكل صوبة، بدفعة مقدمة 35% وفقاً للأسعار المرجعية القابلة للتحديث من الإدارة.'],
          en: ['What is the minimum investment requirement?', 'The current standard minimum is 3 greenhouses (360 m² each) with a 35% down payment, governed by admin-configured reference terms.']
        },
        {
          cat: 'operations', order: 2,
          ar: ['كيف أتابع إنتاجية الصوب والأرباح والأقساط؟', 'بعد التعاقد وإنشاء حسابك من قبل إدارة الشركة، تحصل على دخول خاص لبوابة المستثمر لمتابعة الصوب والمحاصيل والأقساط والأرباح المعتمدة وكشوف الحساب.'],
          en: ['How do I track greenhouse crops, installments, and profits?', 'Once contracted and provisioned by our team, you receive private access to the Investor Portal showing your approved greenhouses, crop cycles, installments, profits, and downloadable statements.']
        },
        {
          cat: 'governance', order: 3,
          ar: ['لماذا تمر التحديثات المالية والزراعية بمرحلة اعتماد إداري؟', 'لضمان دقة البيانات وعدم ظهور أي قيود أو تحديثات من النظام المحاسبي أو التشغيل الميداني قبل مراجعتها واعتمادها رسمياً.'],
          en: ['Why do operational and financial updates undergo administrative approval?', 'Mandatory verification ensures complete accuracy before ERP-synced or field-recorded installments, crop updates, and profit distributions become visible to investors.']
        }
      ];
      for (const f of faqList) {
        const fid = runSql(db, 'INSERT INTO faqs (category, sort_order, is_visible) VALUES (?, ?, 1)', f.cat, f.order).lastInsertRowid;
        runSql(db, `INSERT INTO faq_translations (faq_id, language_code, question, answer, is_verified) VALUES (?, 'ar', ?, ?, 0)`, fid, f.ar[0], f.ar[1]);
        runSql(db, `INSERT INTO faq_translations (faq_id, language_code, question, answer, is_verified) VALUES (?, 'en', ?, ?, 0)`, fid, f.en[0], f.en[1]);
      }
    }
  });
}
