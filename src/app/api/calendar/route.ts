import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

type GoogleEvent = {
  id: string;
  summary?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

const GOOGLE_CALENDAR_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const DEFAULT_RANGE_MONTHS = 2;
const FETCH_PAGE_SIZE = "250";

function widenRange(timeMin: string, timeMax: string) {
  const start = new Date(timeMin);
  const end = new Date(timeMax);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { timeMin, timeMax };
  }
  const dayMs = 24 * 60 * 60 * 1000;
  return {
    timeMin: new Date(start.getTime() - dayMs).toISOString(),
    timeMax: new Date(end.getTime() + dayMs).toISOString(),
  };
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawMin = searchParams.get("timeMin") ?? new Date().toISOString();
  let rawMax = searchParams.get("timeMax");
  if (!rawMax) {
    const fallback = new Date(rawMin);
    fallback.setUTCMonth(fallback.getUTCMonth() + DEFAULT_RANGE_MONTHS);
    rawMax = fallback.toISOString();
  }

  const { timeMin, timeMax } = widenRange(rawMin, rawMax);
  const timeZone = searchParams.get("timeZone");

  const allItems: GoogleEvent[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(GOOGLE_CALENDAR_EVENTS_URL);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", FETCH_PAGE_SIZE);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    if (timeZone) {
      url.searchParams.set("timeZone", timeZone);
    }
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch events" },
        { status: response.status },
      );
    }

    const data = (await response.json()) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
    };

    if (data.items?.length) {
      allItems.push(...data.items);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  const events = allItems
    .map((event) => {
      const allDay = Boolean(event.start?.date && !event.start?.dateTime);
      const start = event.start?.dateTime ?? event.start?.date ?? "";
      const end = event.end?.dateTime ?? event.end?.date ?? "";

      if (!start) {
        return null;
      }

      return {
        id: event.id,
        title: event.summary ?? "(No title)",
        link: event.htmlLink,
        start,
        end: end || start,
        allDay,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e != null);

  return NextResponse.json({ events });
}
