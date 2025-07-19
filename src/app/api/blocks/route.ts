import { type NextRequest, NextResponse } from "next/server"

/**
 * Simple proxy for blockstream's /blocks endpoint.
 * Avoids CORS problems and lets us add caching in one place.
 */
export async function GET(_req: NextRequest) {
  try {
    const res = await fetch("https://blockstream.info/api/blocks", {
      // Always fetch fresh data
      cache: "no-store",
    })

    if (!res.ok) {
      return NextResponse.json({ error: "Upstream error", status: res.status }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch upstream data" }, { status: 500 })
  }
}
