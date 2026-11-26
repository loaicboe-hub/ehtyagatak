import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createAppServer } from '../src/server.mjs';
import { getDb } from '../src/db/client.mjs';
import { seedDatabase } from '../src/db/seed.mjs';
import { ROOT_DIR } from '../src/config/env.mjs';

const routes = [
  { url: '/', out: 'public/index.html' },
  { url: '/ar', out: 'public/ar/index.html' },
  { url: '/en', out: 'public/en/index.html' },
  { url: '/ar/about', out: 'public/about/index.html' },
  { url: '/ar/about', out: 'public/ar/about/index.html' },
  { url: '/en/about', out: 'public/en/about/index.html' },
  { url: '/ar/invest', out: 'public/invest/index.html' },
  { url: '/ar/invest', out: 'public/ar/invest/index.html' },
  { url: '/en/invest', out: 'public/en/invest/index.html' },
  { url: '/ar/how-it-works', out: 'public/how-it-works/index.html' },
  { url: '/ar/how-it-works', out: 'public/ar/how-it-works/index.html' },
  { url: '/en/how-it-works', out: 'public/en/how-it-works/index.html' },
  { url: '/ar/services', out: 'public/services/index.html' },
  { url: '/ar/services', out: 'public/ar/services/index.html' },
  { url: '/en/services', out: 'public/en/services/index.html' },
  { url: '/ar/projects', out: 'public/projects/index.html' },
  { url: '/ar/projects', out: 'public/ar/projects/index.html' },
  { url: '/en/projects', out: 'public/en/projects/index.html' },
  { url: '/ar/news', out: 'public/news/index.html' },
  { url: '/ar/news', out: 'public/ar/news/index.html' },
  { url: '/en/news', out: 'public/en/news/index.html' },
  { url: '/ar/faq', out: 'public/faq/index.html' },
  { url: '/ar/faq', out: 'public/ar/faq/index.html' },
  { url: '/en/faq', out: 'public/en/faq/index.html' },
  { url: '/ar/contact', out: 'public/contact/index.html' },
  { url: '/ar/contact', out: 'public/ar/contact/index.html' },
  { url: '/en/contact', out: 'public/en/contact/index.html' },
  { url: '/ar/policies', out: 'public/policies/index.html' },
  { url: '/ar/policies', out: 'public/ar/policies/index.html' },
  { url: '/en/policies', out: 'public/en/policies/index.html' },
  { url: '/login', out: 'public/login/index.html' },
  { url: '/forgot-password', out: 'public/forgot-password/index.html' }
];

async function generateAll() {
  const db = getDb();
  seedDatabase(db);
  const app = createAppServer({ db });

  const server = app.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    console.log(`Pre-rendering static pages from http://127.0.0.1:${port}...`);

    for (const r of routes) {
      const res = await fetch(`http://127.0.0.1:${port}${r.url}`);
      if (!res.ok) {
        console.error(`Failed to render ${r.url}: HTTP ${res.status}`);
        continue;
      }
      let html = await res.text();
      // Ensure form action falls back gracefully if backend API is not running:
      const targetPath = path.join(ROOT_DIR, r.out);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, html, 'utf8');
      console.log(`Rendered: ${r.url} -> ${r.out} (${html.length} bytes)`);
    }

    server.close();
    console.log('All static pages generated successfully!');
  });
}

generateAll().catch(err => {
  console.error('Static generation error:', err);
  process.exit(1);
});
