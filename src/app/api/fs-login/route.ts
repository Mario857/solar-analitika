import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

interface LoginRequest {
  username?: string;
  password?: string;
  subdomain?: string;
}

interface PubKeyResponse {
  enableEncrypt: boolean;
  pubKey: string;
  timeStamp: string;
  version: string;
}

/**
 * Derive the login subdomain from the portal subdomain.
 * The login/unisso endpoints live on the base regional domain (e.g. "eu5"),
 * while data endpoints use the full subdomain (e.g. "uni004eu5").
 * Extract the regional suffix like "eu5", "la5", "au5" from the subdomain.
 */
function getLoginSubdomain(subdomain: string): string {
  // Match regional suffix pattern: 2-3 letters + digit(s) at the end (eu5, la5, au5, etc.)
  const regionMatch = subdomain.match(/([a-z]{2,3}\d+)$/);
  if (regionMatch) return regionMatch[1];
  return subdomain;
}

/**
 * Encrypt password using RSA-OAEP with SHA-384 (FusionSolar v3 login).
 * Splits into 270-char chunks, encrypts each, joins with "00000001" separator.
 */
function encryptPassword(password: string, pubKeyPem: string, version: string): string {
  const encoded = encodeURIComponent(password);
  const chunkSize = 270;
  const chunks: string[] = [];

  for (let i = 0; i < encoded.length; i += chunkSize) {
    chunks.push(encoded.slice(i, i + chunkSize));
  }

  const encryptedChunks = chunks.map((chunk) => {
    const encrypted = crypto.publicEncrypt(
      {
        key: pubKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha384",
      },
      Buffer.from(chunk, "utf-8")
    );
    return encrypted.toString("base64");
  });

  return encryptedChunks.join("00000001") + version;
}

/**
 * Extract all Set-Cookie values from a fetch Response.
 * Uses getSetCookie() which properly handles multiple Set-Cookie headers.
 */
function extractCookies(response: Response): string {
  const rawCookies = response.headers.getSetCookie?.() || [];
  return rawCookies
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

/**
 * Merge new cookies into an existing cookie string, replacing duplicates by name.
 */
function mergeCookies(existing: string, newCookies: string): string {
  const cookieMap = new Map<string, string>();

  for (const cookie of existing.split("; ").filter(Boolean)) {
    const name = cookie.split("=")[0];
    cookieMap.set(name, cookie);
  }
  for (const cookie of newCookies.split("; ").filter(Boolean)) {
    const name = cookie.split("=")[0];
    cookieMap.set(name, cookie);
  }

  return Array.from(cookieMap.values()).join("; ");
}

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LoginRequest;
    const { username, password, subdomain } = body;

    if (!username || !password) {
      return NextResponse.json({ error: "Missing username or password" }, { status: 400 });
    }

    const portalSubdomain = subdomain || "uni004eu5";
    const loginSubdomain = getLoginSubdomain(portalSubdomain);
    const loginBase = `https://${loginSubdomain}.fusionsolar.huawei.com`;
    const portalBase = `https://${portalSubdomain}.fusionsolar.huawei.com`;

    let sessionCookies = "";

    // Step 1: Fetch public key for password encryption
    let pubKeyData: PubKeyResponse;
    try {
      const pubKeyResponse = await fetch(`${loginBase}/unisso/pubkey`, {
        headers: { "User-Agent": BROWSER_USER_AGENT },
      });

      if (!pubKeyResponse.ok) {
        return NextResponse.json(
          { error: `Korak 1: pubkey fetch failed (${pubKeyResponse.status})` },
          { status: 502 }
        );
      }

      sessionCookies = mergeCookies(sessionCookies, extractCookies(pubKeyResponse));
      pubKeyData = (await pubKeyResponse.json()) as PubKeyResponse;
    } catch (e) {
      return NextResponse.json(
        { error: `Korak 1: ${(e as Error).message}` },
        { status: 502 }
      );
    }

    // Step 2: Encrypt password and login
    let loginUrl: string;
    let loginBody: Record<string, string>;

    try {
      if (pubKeyData.enableEncrypt) {
        const nonce = crypto.randomBytes(16).toString("hex");
        const encryptedPassword = encryptPassword(password, pubKeyData.pubKey, pubKeyData.version);

        loginUrl = `${loginBase}/unisso/v3/validateUser.action?timeStamp=${pubKeyData.timeStamp}&nonce=${nonce}`;
        loginBody = {
          organizationName: "",
          username,
          password: encryptedPassword,
        };
      } else {
        const serviceUrl = encodeURIComponent(
          `${portalBase}/unisess/v1/auth?service=/netecowebext/home/index.html#/LOGIN`
        );
        loginUrl = `${loginBase}/unisso/v2/validateUser.action?decision=1&service=${serviceUrl}`;
        loginBody = {
          organizationName: "",
          username,
          password,
        };
      }
    } catch (e) {
      return NextResponse.json(
        { error: `Korak 2 (enkripcija): ${(e as Error).message}` },
        { status: 502 }
      );
    }

    // Step 3: Submit login
    let loginData: Record<string, unknown>;
    try {
      const loginResponse = await fetch(loginUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": BROWSER_USER_AGENT,
          Cookie: sessionCookies,
        },
        body: JSON.stringify(loginBody),
        redirect: "manual",
      });

      sessionCookies = mergeCookies(sessionCookies, extractCookies(loginResponse));
      const loginText = await loginResponse.text();

      try {
        loginData = JSON.parse(loginText);
      } catch {
        return NextResponse.json(
          { error: `Korak 3: odgovor nije JSON — moguć CAPTCHA. Status: ${loginResponse.status}` },
          { status: 502 }
        );
      }
    } catch (e) {
      return NextResponse.json(
        { error: `Korak 3 (login POST): ${(e as Error).message}` },
        { status: 502 }
      );
    }

    if (loginData.errorMsg) {
      return NextResponse.json(
        { error: `Prijava neuspješna: ${loginData.errorMsg}` },
        { status: 401 }
      );
    }

    // Step 4: Handle errorCode 470 redirect (current Huawei login flow)
    const respMultiRegionName = loginData.respMultiRegionName as string[] | undefined;
    if (String(loginData.errorCode) === "470" && respMultiRegionName?.[1]) {
      try {
        const redirectUrl = `${loginBase}${respMultiRegionName[1]}`;
        const redirectResponse = await fetch(redirectUrl, {
          headers: {
            "User-Agent": BROWSER_USER_AGENT,
            Cookie: sessionCookies,
          },
          redirect: "manual",
        });
        sessionCookies = mergeCookies(sessionCookies, extractCookies(redirectResponse));

        const redirectLocation = redirectResponse.headers.get("location");
        if (redirectLocation) {
          const followResponse = await fetch(redirectLocation, {
            headers: {
              "User-Agent": BROWSER_USER_AGENT,
              Cookie: sessionCookies,
            },
            redirect: "manual",
          });
          sessionCookies = mergeCookies(sessionCookies, extractCookies(followResponse));
        }
      } catch (e) {
        return NextResponse.json(
          { error: `Korak 4 (redirect): ${(e as Error).message}` },
          { status: 502 }
        );
      }
    }

    // Step 5: Keep-alive to establish portal session
    try {
      const keepAliveResponse = await fetch(`${portalBase}/rest/dpcloud/auth/v1/keep-alive`, {
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Cookie: sessionCookies,
        },
      });
      sessionCookies = mergeCookies(sessionCookies, extractCookies(keepAliveResponse));
    } catch (e) {
      return NextResponse.json(
        { error: `Korak 5 (keep-alive): ${(e as Error).message}` },
        { status: 502 }
      );
    }

    // Step 6: Get CSRF token
    let csrfToken = "";
    try {
      const sessionResponse = await fetch(`${portalBase}/unisess/v1/auth/session`, {
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Cookie: sessionCookies,
        },
      });
      sessionCookies = mergeCookies(sessionCookies, extractCookies(sessionResponse));

      const sessionData = await sessionResponse.json();
      csrfToken = sessionData.csrfToken || "";
    } catch {
      // CSRF token is optional for GET requests used by the data endpoint
    }

    // Step 7: Verify session
    try {
      const verifyResponse = await fetch(`${portalBase}/rest/dpcloud/auth/v1/is-session-alive`, {
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Cookie: sessionCookies,
        },
      });

      const verifyData = await verifyResponse.json();
      if (verifyData.code !== 0) {
        return NextResponse.json(
          { error: "Sesija nije aktivna nakon prijave. Pokušajte ručni cookie." },
          { status: 401 }
        );
      }
    } catch (e) {
      return NextResponse.json(
        { error: `Korak 7 (verifikacija): ${(e as Error).message}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      cookie: sessionCookies,
      csrfToken,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Neočekivana greška: ${msg}` }, { status: 502 });
  }
}
