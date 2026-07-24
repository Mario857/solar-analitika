import { NextRequest, NextResponse } from "next/server";
import { validateProxyTarget } from "@/lib/proxyGuard";

/**
 * Proxy HEP data requests. The `token` field is the Cookie header string
 * returned from /api/hep-login (HEP v4 switched from Bearer auth to
 * cookie-based session auth). If the cookie string contains an XSRF-TOKEN,
 * we also echo it as X-XSRF-TOKEN, which Angular-style CSRF middleware expects.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, token } = body as { url?: string; token?: string };

    if (!url) {
      return NextResponse.json({ error: "Missing 'url'" }, { status: 400 });
    }

    const target = validateProxyTarget(url);
    if (!target.url) {
      return NextResponse.json({ error: target.error }, { status: 400 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    };

    if (token) {
      headers.Cookie = token;
      const xsrfMatch = token.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
      if (xsrfMatch) {
        headers["X-XSRF-TOKEN"] = decodeURIComponent(xsrfMatch[1]);
      }
    }

    const resp = await fetch(target.url, {
      method: "POST",
      headers,
      body: "",
      /* Never let a redirect carry the session cookie off the allowed host */
      redirect: "manual",
    });

    const data = await resp.text();

    return new NextResponse(data, {
      status: resp.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
