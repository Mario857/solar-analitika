import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, token } = body as { url?: string; token?: string };

    if (!url) {
      return NextResponse.json({ error: "Missing 'url'" }, { status: 400 });
    }

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token || ""}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      body: "",
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
