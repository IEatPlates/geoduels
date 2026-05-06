import type { GetServerSideProps } from 'next';
import { getSiteURL } from '../lib/site';

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const siteURL = getSiteURL();
  const now = new Date().toISOString();
  const urls = [
    { loc: `${siteURL}/`, priority: '1.0' },
    { loc: `${siteURL}/privacy`, priority: '0.3' },
    { loc: `${siteURL}/terms`, priority: '0.3' }
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${url.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.write(xml);
  res.end();

  return {
    props: {}
  };
};

export default function SitemapXML() {
  return null;
}
