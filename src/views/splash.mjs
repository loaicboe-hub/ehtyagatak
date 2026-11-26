import { escapeHtml } from '../../foundation/security/input-sanitizer.mjs';

export function renderSplashScreen({ lang = 'ar' } = {}) {
  const skipLabel = lang === 'en' ? 'Skip' : 'تخطي';
  return `
  <div id="ehtyajatak-splash" class="splash-overlay" role="dialog" aria-modal="true" aria-label="شركة احتياجاتك للتنمية المستدامة" dir="rtl" data-splash>
    <button type="button" class="splash-skip" data-splash-skip aria-label="${escapeHtml(skipLabel)}">
      <span>تخطي</span>
      <span aria-hidden="true">/</span>
      <span>Skip</span>
    </button>

    <div class="splash-stage">
      <div class="splash-emblem" aria-hidden="true">
        <svg class="splash-svg" viewBox="0 0 220 190" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="splashGoldGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <linearGradient id="splashLeafGrad" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stop-color="#2E8B57"/>
              <stop offset="100%" stop-color="#3CB371"/>
            </linearGradient>
          </defs>

          <!-- Stage 2a: Outer Golden Greenhouse Arch -->
          <path
            class="splash-arch splash-arch--gold"
            d="M36 154 V84 C36 44 68 18 110 18 C152 18 184 44 184 84 V154 H36"
            stroke="#D4AF37"
            stroke-width="6.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          <!-- Stage 2b: Inner Emerald Greenhouse Arch -->
          <path
            class="splash-arch splash-arch--emerald"
            d="M54 150 V88 C54 55 78 34 110 34 C142 34 166 55 166 88 V150"
            stroke="#3CB371"
            stroke-width="5.5"
            stroke-linecap="round"
          />

          <!-- Stage 2c: Sprouting Emerald Leaves -->
          <g class="splash-leaves">
            <!-- Stem & Right Leaf -->
            <path
              d="M110 132 C110 105 113 84 128 68 C142 54 162 50 172 52 C171 67 164 86 149 97 C137 106 121 107 112 103"
              fill="url(#splashLeafGrad)"
              stroke="#86EFAC"
              stroke-width="2"
              stroke-linejoin="round"
            />
            <path
              d="M114 112 C125 94 142 78 160 64"
              stroke="#D4AF37"
              stroke-width="2"
              stroke-linecap="round"
              opacity="0.85"
            />
            <!-- Left Leaf -->
            <path
              d="M107 132 C107 108 100 91 86 81 C74 73 60 72 52 75 C54 88 60 102 72 110 C82 116 95 117 104 113"
              fill="url(#splashLeafGrad)"
              stroke="#86EFAC"
              stroke-width="2"
              stroke-linejoin="round"
            />
          </g>

          <!-- Stage 1: Ascending Golden Zigzag Growth Line & Arrowhead -->
          <path
            class="splash-growth-line"
            d="M36 154 L76 122 L106 142 L138 114 L154 126 L184 96"
            stroke="#D4AF37"
            stroke-width="7"
            stroke-linecap="round"
            stroke-linejoin="round"
            filter="url(#splashGoldGlow)"
          />
          <path
            class="splash-growth-head"
            d="M167 95 L186 94 L185 113"
            stroke="#D4AF37"
            stroke-width="6.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            filter="url(#splashGoldGlow)"
          />
        </svg>
      </div>

      <!-- Stage 3: Brand Typography -->
      <div class="splash-brand">
        <div class="splash-title">شركة احتياجاتك</div>
        <div class="splash-subtitle">للتنمية المستدامة</div>
      </div>

      <!-- Stage 4: Subtle Golden Pulse & Tagline -->
      <div class="splash-footer">
        <span class="splash-pulse" aria-hidden="true"></span>
        <span class="splash-tagline">الاستثمار الزراعي المستدام</span>
      </div>
    </div>
  </div>`;
}
