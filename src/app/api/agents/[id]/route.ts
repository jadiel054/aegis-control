import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { checkApiKey } from '@/lib/api-auth';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, name, role, status, agent_type, webhook_url,
             telegram_chat_ids, capabilities, metadata,
             last_heartbeat, created_at,
             CASE WHEN telegram_bot_token IS NOT NULL AND telegram_bot_token <> '' THEN true ELSE false END AS has_telegram_token
      FROM agents WHERE id = ${params.id} LIMIT 1
    `;
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ agent: rows[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (!checkApiKey(request)) {
      return NextResponse.json({ error: 'Unauthorized: AEGIS_API_KEY mismatch' }, { status: 401 });
    }
    const body = await request.json();
    const sql = getSql();

    const current = await sql`SELECT * FROM agents WHERE id = ${params.id} LIMIT 1`;
    if (!current[0]) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }
    const c = current[0];

    const nextRole = body.role !== undefined ? body.role : c.role;
    const nextType = body.agent_type !== undefined ? body.agent_type : c.agent_type;
    const nextWebhook =
      body.webhook_url !== undefined ? body.webhook_url || null : c.webhook_url;
    // Empty string means "clear token"; undefined means keep current
    let nextToken = c.telegram_bot_token;
    if (body.telegram_bot_token !== undefined) {
      nextToken = body.telegram_bot_token === '' ? null : body.telegram_bot_token;
    }
    const nextChatIds =
      body.telegram_chat_ids !== undefined
        ? body.telegram_chat_ids
        : c.telegram_chat_ids;
    const nextCaps =
      body.capabilities !== undefined ? body.capabilities : c.capabilities;
    const nextMeta = body.metadata !== undefined ? body.metadata : c.metadata;
    const nextStatus = body.status !== undefined ? body.status : c.status;

    const rows = await sql`
      UPDATE agents SET
        role = ${nextRole},
        agent_type = ${nextType},
        webhook_url = ${nextWebhook},
        telegram_bot_token = ${nextToken},
        telegram_chat_ids = ${JSON.stringify(nextChatIds)}::jsonb,
        capabilities = ${JSON.stringify(nextCaps)}::jsonb,
        metadata = ${JSON.stringify(nextMeta)}::jsonb,
        status = ${nextStatus}
      WHERE id = ${params.id}
      RETURNING id, name, role, status, agent_type, webhook_url,
                telegram_chat_ids, capabilities, metadata, last_heartbeat, created_at,
                CASE WHEN telegram_bot_token IS NOT NULL AND telegram_bot_token <> '' THEN true ELSE false END AS has_telegram_token
    `;

    return NextResponse.json({ success: true, agent: rows[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
