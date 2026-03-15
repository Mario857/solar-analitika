import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, cookie } = body as { url?: string; cookie?: string };

    if (!url) {
      return NextResponse.json({ error: "Missing 'url'" }, { status: 400 });
    }

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Cookie: cookie || "",
        Accept: "application/json, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://uni004eu5.fusionsolar.huawei.com/",
      },
      redirect: "manual",
    });

    // 302 means session expired
    if (resp.status === 302) {
      const location = resp.headers.get("location") || "";
      return NextResponse.json(
        {
          error:
            "FusionSolar session expired (302 redirect to login). Refresh your cookie.",
          location,
          failCode: 302,
        },
        { status: 401 }
      );
    }

    const data = await resp.text();
    const ct = resp.headers.get("content-type") || "application/json";

    return new NextResponse(data, {
      status: resp.status,
      headers: { "Content-Type": ct },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
