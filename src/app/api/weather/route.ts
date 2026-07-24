import { NextRequest, NextResponse } from "next/server";

/**
 * Open-Meteo serves recent and future days from the forecast endpoint and older
 * days from the archive endpoint. The forecast endpoint silently returns nulls
 * for dates past its ~80-day window rather than erroring, which previously left
 * whole weeks of a month with zero irradiance and quietly shrank the Performance
 * Ratio sample. Requests are routed by date and merged.
 */
const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";

/** Days back beyond which the forecast endpoint stops returning real data */
const FORECAST_PAST_WINDOW_DAYS = 60;
/** HEP meter timestamps are Croatian local time — irradiance must bucket the same way */
const TIME_ZONE = "Europe/Zagreb";

interface HourlyRadiation {
  time: string[];
  shortwave_radiation: (number | null)[];
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchRadiation(
  baseUrl: string,
  latitude: string,
  longitude: string,
  startDate: string,
  endDate: string
): Promise<HourlyRadiation | null> {
  const url = new URL(baseUrl);
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set("hourly", "shortwave_radiation");
  url.searchParams.set("timezone", TIME_ZONE);
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);

  const response = await fetch(url.toString());
  if (!response.ok) return null;

  const data = await response.json();
  if (!data?.hourly?.time) return null;
  return data.hourly as HourlyRadiation;
}

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
    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Missing start_date/end_date" }, { status: 400 });
    }

    /* Split the range at the point where the forecast endpoint stops having data */
    const forecastFloor = new Date();
    forecastFloor.setDate(forecastFloor.getDate() - FORECAST_PAST_WINDOW_DAYS);
    const forecastFloorKey = toDateKey(forecastFloor);

    const archiveEnd = endDate < forecastFloorKey ? endDate : forecastFloorKey;
    const forecastStart = startDate > forecastFloorKey ? startDate : forecastFloorKey;

    const requests: Promise<HourlyRadiation | null>[] = [];
    if (startDate < forecastFloorKey) {
      requests.push(fetchRadiation(OPEN_METEO_ARCHIVE, latitude, longitude, startDate, archiveEnd));
    }
    if (endDate >= forecastFloorKey) {
      requests.push(fetchRadiation(OPEN_METEO_FORECAST, latitude, longitude, forecastStart, endDate));
    }

    const results = await Promise.all(requests);
    const merged = new Map<string, number>();
    for (const hourly of results) {
      if (!hourly) continue;
      for (let i = 0; i < hourly.time.length; i++) {
        const radiation = hourly.shortwave_radiation[i];
        /* Archive and forecast overlap by a day or two — the archive value wins
           because it is the measured reanalysis rather than a model run. */
        if (radiation === null || merged.has(hourly.time[i])) continue;
        merged.set(hourly.time[i], radiation);
      }
    }

    if (merged.size === 0) {
      return NextResponse.json({ error: "No radiation data available" }, { status: 502 });
    }

    const times = [...merged.keys()].sort();
    return NextResponse.json({
      hourly: {
        time: times,
        shortwave_radiation: times.map((time) => merged.get(time) ?? 0),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
