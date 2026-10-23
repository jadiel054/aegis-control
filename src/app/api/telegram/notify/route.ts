import { NextResponse } from 'next/server';
import { notifyOperatorTelegram, type FleetEvent } from '@/lib/fleet-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Agents / workers call this to push live updates to Jarvis Comando Telegram.
 * POST { kind, agentName, title, detail, taskId, severity }
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.AEGIS_NOTIFY_SECRET;
    if (secret) {
      const h = request.headers.get('x-aegis-notify-secret');
      if (h !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = (await request.json()) as FleetEvent;
    if (!body.kind) {
      return NextResponse.json({ error: 'kind required' }, { status: 400 });
    }

    const result = await notifyOperatorTelegram(body);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
