// A store's public storefront address (FR-CUS-01): the brand page at
// /s/<slug>, on the site's own domain. Isomorphic: no data access.

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Null when the site address isn't configured or the slug isn't one of ours.
export function storefrontUrl(slug: string, siteUrl = process.env.NEXT_PUBLIC_SITE_URL): string | null {
  if (!siteUrl || !SLUG_PATTERN.test(slug)) return null;
  try {
    return new URL(`/s/${slug}`, siteUrl).toString();
  } catch {
    return null;
  }
}
