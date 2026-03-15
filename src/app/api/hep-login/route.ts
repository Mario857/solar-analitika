import { NextRequest, NextResponse } from "next/server";

interface LoginRequest {
  username?: string;
  password?: string;
}

/**
 * Proxy login to HEP mjerenje portal.
 * HEP uses a simple POST with {Username, Password} and returns a user object
 * containing a Token field used as Bearer token for API requests.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LoginRequest;
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: "Missing username or password" }, { status: 400 });
    }

    const response = await fetch("https://mjerenje.hep.hr/mjerenja/v1/api/user/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      body: JSON.stringify({ Username: username, Password: password }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: errorText || `Login failed: ${response.status}` },
        { status: response.status }
      );
    }

    const userData = await response.json();

    if (!userData.Token) {
      return NextResponse.json(
        { error: "Login succeeded but no token returned" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      token: userData.Token,
      username: userData.Username,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
