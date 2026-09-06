/**
 * URL safety gates: staff/operator-supplied links (campaign deep links, promo
 * images, courier tracking URLs) render in apps and push payloads. Unchecked
 * they become javascript:/data: navigation or phishing. Every check is
 * allowlist-based — unknown schemes/hosts are rejected, never sanitized.
 */

const APP_DEEP_LINK = /^burgonomics:\/\/(menu|offers|stores|orders|profile)([/?#][\w\-/?=&%#]*)?$/;
const WEB_DEEP_LINK =
  /^https:\/\/(burgonomics\.com|partner\.burgonomics\.com|burgonomics\.netlify\.app)(\/[\w\-/?=&%#]*)?$/;

/** Marketing deep links: app scheme or owned https hosts only. */
export function isSafeDeepLink(url: string): boolean {
  const v = url.trim();
  return APP_DEEP_LINK.test(v) || WEB_DEEP_LINK.test(v);
}

/** Promo/campaign images: https only (no data:/javascript:/file:). */
export function isSafeImageUrl(url: string): boolean {
  const v = url.trim();
  return /^https:\/\/[^\s"'<>]+$/.test(v);
}

/** Courier tracking links: https porter.in (or configured Porter base) only. */
export function isSafeTrackingUrl(url: string, porterBaseHost?: string): boolean {
  const v = url.trim();
  if (!/^https:\/\/[^\s"'<>]+$/.test(v)) return false;
  try {
    const host = new URL(v).hostname.toLowerCase();
    if (host === "porter.in" || host.endsWith(".porter.in")) return true;
    if (porterBaseHost && host === porterBaseHost.toLowerCase()) return true;
    return false;
  } catch {
    return false;
  }
}

/** tel: links: digits/spaces/dashes only, sane length. */
export function isSafeTelNumber(phone: string): boolean {
  return /^[+0-9][0-9\s-]{6,15}$/.test(phone.trim());
}
