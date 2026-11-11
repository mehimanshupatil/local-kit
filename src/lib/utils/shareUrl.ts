/**
 * The address to share for a page. Keeps the query (tools like the Epoch
 * Converter put what you're looking at there) but drops the fragment, which
 * can hold a one-time secret such as a Send pairing link.
 */
export function shareableUrl(href: string): string {
  const url = new URL(href);
  url.hash = '';
  return url.toString();
}
