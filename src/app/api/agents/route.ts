import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { checkApiKey } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sql = getSql();
    const agents = await sql`
      SELECT id, name, role, status, agent_type, webhook_url,
             telegram_chat_ids, capabilities, metadata,
             last_heartbeat, created_at,
             CASE WHEN telegram_bot_token IS NOT NULL AND telegram_bot_token <> '' THEN true ELSE false END AS has_telegram_token
      FROM agents
      ORDER BY name
    `;
    return NextResponse.json({ agents });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!checkApiKey(request)) {
      return NextResponse.json({ error: 'Unauthorized: AEGIS_API_KEY mismatch' }, { status: 401 });
    }
    const body = await request.json();
    const {
      name,
      role = 'agent',
      agent_type = 'llm_agent',
      webhook_url = null,
      telegram_bot_token = null,
      telegram_chat_ids = [],
      capabilities = [],
      metadata = {},
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const sql = getSql();
    const rows = await sql`
      INSERT INTO agents (name, role, agent_type, status, webhook_url, telegram_bot_token, telegram_chat_ids, capabilities, metadata, last_heartbeat)
      VALUES (
        ${name},
        ${role},
        ${agent_type},
        'offline',
        ${webhook_url},
        ${telegram_bot_token},
        ${JSON.stringify(telegram_chat_ids)}::jsonb,
        ${JSON.stringify(capabilities)}::jsonb,
        ${JSON.stringify(metadata)}::jsonb,
        NOW()
      )
      RETURNING id, name, role, status, agent_type, webhook_url, last_heartbeat, created_at
    `;

    return NextResponse.json({ success: true, agent: rows[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
