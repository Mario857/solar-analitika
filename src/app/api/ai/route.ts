import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

interface AiProxyRequestBody {
  apiKey?: string;
  model?: string;
  messages?: { role: string; content: string }[];
}

/**
 * Proxy chat requests to OpenRouter so the API key never appears in
 * browser network requests to a third-party origin. The upstream SSE
 * stream is passed through unchanged — the client parses it.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AiProxyRequestBody;
    const { apiKey, model, messages } = body;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing 'apiKey'" }, { status: 400 });
    }
    if (!model || !messages || messages.length === 0) {
      return NextResponse.json({ error: "Missing 'model' or 'messages'" }, { status: 400 });
    }

    const upstreamResponse = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        /* OpenRouter attribution headers — used for rankings, optional */
        "HTTP-Referer": "https://solar-analitika.vercel.app",
        "X-Title": "Solar Analitika",
      },
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      return new NextResponse(errorText, {
        status: upstreamResponse.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new NextResponse(upstreamResponse.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
