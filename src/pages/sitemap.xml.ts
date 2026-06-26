import type { APIRoute } from 'astro';
import { SITE } from '../config/site';
import { loadCategories } from '../lib/resources';

export const GET: APIRoute = async () => {
  const categories = await loadCategories();

  const urls: string[] = [
    SITE.url,
    ...categories.map(c => `${SITE.url}/${c.id}`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${url}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
