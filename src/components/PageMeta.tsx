import { Helmet } from "react-helmet-async";

interface PageMetaProps {
  title: string;
  description: string;
  path: string;
  /** Optional JSON-LD object(s) to inject in addition to the sitewide ones. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

const SITE_ORIGIN = "https://www.minigiantgames.com";

/**
 * Per-route SEO head. Sets a unique <title>, meta description, canonical,
 * and Open Graph URL for each page. Keeps descriptions in the 50–160 char
 * sweet spot that search engines surface.
 */
export default function PageMeta({ title, description, path, jsonLd }: PageMetaProps) {
  const url = `${SITE_ORIGIN}${path}`;
  const schemas = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {schemas.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}
