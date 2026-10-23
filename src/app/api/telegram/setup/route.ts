import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getTelegramWebhookInfo, setTelegramWebhook } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function publicBaseUrl() {
  if (process.env.AEGIS_PUBLIC_URL) return process.env.AEGIS_PUBLIC_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://aegis-control-sand.vercel.app';
}

/**
 * Registers Telegram webhook for an agent that already has telegram_bot_token in Neon.
 * POST { "agent": "Jarvis Comando" }
 */
export async function POST(request: Request) {
  try {
    const setupSecret = process.env.TELEGRAM_SETUP_SECRET;
    if (setupSecret) {
      const header = request.headers.get('x-aegis-setup-secret');
      if (header !== setupSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json().catch(() => ({}));
    const agentName = body.agent || 'Jarvis Comando';

    const sql = getSql();
    const rows = await sql`
      SELECT id, name, telegram_bot_token FROM agents
      WHERE LOWER(name) = LOWER(${agentName}) LIMIT 1
    `;
    const agent = rows[0];
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }
    if (!agent.telegram_bot_token) {
      return NextResponse.json(
        {
          error:
            'Token ainda não configurado. Salve o token em Config. Agentes e tente de novo.',
        },
        { status: 400 }
      );
    }

    const webhookUrl = `${publicBaseUrl()}/api/telegram/webhook?agent=${encodeURIComponent(agent.name)}`;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

    await setTelegramWebhook(agent.telegram_bot_token, webhookUrl, secret);
    const info = await getTelegramWebhookInfo(agent.telegram_bot_token);

    await sql`
      UPDATE agents SET
        webhook_url = ${webhookUrl},
        status = 'online',
        last_heartbeat = NOW()
      WHERE id = ${agent.id}
    `;

    return NextResponse.json({
      success: true,
      agent: agent.name,
      webhookUrl,
      telegram: info,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentName = searchParams.get('agent') || 'Jarvis Comando';
    const sql = getSql();
    const rows = await sql`
      SELECT name, webhook_url,
        CASE WHEN telegram_bot_token IS NOT NULL AND telegram_bot_token <> '' THEN true ELSE false END AS has_token
      FROM agents WHERE LOWER(name) = LOWER(${agentName}) LIMIT 1
    `;
    if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });

    let info = null;
    if (rows[0].has_token) {
      const full = await sql`SELECT telegram_bot_token FROM agents WHERE LOWER(name) = LOWER(${agentName}) LIMIT 1`;
      if (full[0]?.telegram_bot_token) {
        info = await getTelegramWebhookInfo(full[0].telegram_bot_token);
      }
    }

    return NextResponse.json({ agent: rows[0], telegram: info });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
