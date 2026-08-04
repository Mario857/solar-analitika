import { NextRequest, NextResponse } from "next/server";

interface LoginRequest {
  username?: string;
  password?: string;
}

/**
 * HEP errors come back as {"Status":400,"Message":"Neispravni podaci prijave",...},
 * but infrastructure failures (wrong API version, maintenance) return a full IIS
 * HTML page. Forwarding either verbatim buries the cause in an unreadable blob.
 */
function extractHepErrorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { Message?: string };
    if (parsed.Message) {
      return parsed.Message;
    }
  } catch {
    /* Not JSON — an HTML error page, handled below */
  }

  const isHtml = body.trimStart().startsWith("<");
  if (isHtml || !body.trim()) {
    return `HEP je odgovorio greškom ${status} (poslužitelj nije vratio poruku)`;
  }

  return body;
}

/**
 * Proxy login to HEP mjerenje portal (v4.x).
 * HEP no longer returns a Bearer token — auth is via Set-Cookie session cookies.
 * We extract those cookies and return them as a single Cookie header string that
 * the client passes back on subsequent /api/hep calls (treated as the "token").
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LoginRequest;
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: "Missing username or password" }, { status: 400 });
    }

    const response = await fetch("https://mjerenje.hep.hr/mjerenja/v1.1/api/user/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      /* v4 requires the empty Token field in the request payload */
      body: JSON.stringify({ Username: username, Password: password, Token: "" }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: extractHepErrorMessage(errorText, response.status) },
        { status: response.status }
      );
    }

    /* Strip attributes (Path, HttpOnly, Secure, ...) and keep only name=value
       pairs, joined with "; " to form a Cookie request header. */
    const cookieHeader = response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");

    if (!cookieHeader) {
      return NextResponse.json(
        { error: "Login succeeded but no session cookie returned" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      token: cookieHeader,
      username,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
