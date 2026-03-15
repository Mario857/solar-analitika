import { NextRequest, NextResponse } from "next/server";

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const latitude = params.get("latitude");
    const longitude = params.get("longitude");
    const startDate = params.get("start_date");
    const endDate = params.get("end_date");

    if (!latitude || !longitude) {
      return NextResponse.json({ error: "Missing latitude/longitude" }, { status: 400 });
    }

    const url = new URL(OPEN_METEO_BASE);
    url.searchParams.set("latitude", latitude);
    url.searchParams.set("longitude", longitude);
    url.searchParams.set("hourly", "shortwave_radiation");
    if (startDate) url.searchParams.set("start_date", startDate);
    if (endDate) url.searchParams.set("end_date", endDate);

    const response = await fetch(url.toString());
    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: errorText }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
