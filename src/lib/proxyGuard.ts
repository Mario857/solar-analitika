/**
 * Guard for the HEP and FusionSolar proxy routes.
 *
 * Those routes exist only to dodge CORS, but they take a URL from the request
 * body and fetch it server-side with the caller's session cookie attached. Left
 * open, a public deployment is a server-side request forgery relay: anyone can
 * point it at internal addresses, cloud metadata endpoints, or any third-party
 * host and read the response. Only the two upstreams the app actually talks to
 * are allowed through.
 */

/** Hosts the proxies may reach, matched exactly or as a subdomain suffix */
const ALLOWED_HOSTS = ["mjerenje.hep.hr", "fusionsolar.huawei.com"];

export interface UrlValidationResult {
  url: URL | null;
  error: string | null;
}

export function validateProxyTarget(rawUrl: string): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { url: null, error: "Invalid URL" };
  }

  /* Block file:, data:, gopher: and friends before anything else */
  if (parsed.protocol !== "https:") {
    return { url: null, error: "Only https targets are allowed" };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isAllowed = ALLOWED_HOSTS.some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
  );
  if (!isAllowed) {
    return { url: null, error: `Host not allowed: ${hostname}` };
  }

  /* Credentials in the URL would be forwarded verbatim — strip the request */
  if (parsed.username || parsed.password) {
    return { url: null, error: "Credentials in URL are not allowed" };
  }

  return { url: parsed, error: null };
}
