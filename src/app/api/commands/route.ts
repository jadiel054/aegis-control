import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent_id');
    const status = searchParams.get('status');
    const sql = getSql();

    let rows;
    if (agentId && status) {
      rows = await sql`
        SELECT * FROM commands
        WHERE agent_id = ${agentId} AND status = ${status}
        ORDER BY created_at DESC LIMIT 50
      `;
    } else if (agentId) {
      rows = await sql`
        SELECT * FROM commands WHERE agent_id = ${agentId}
        ORDER BY created_at DESC LIMIT 50
      `;
    } else {
      rows = await sql`SELECT * FROM commands ORDER BY created_at DESC LIMIT 50`;
    }

    return NextResponse.json({ commands: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agent_id, command_type, payload = {}, issued_by = 'system' } = body;

    if (!agent_id || !command_type) {
      return NextResponse.json(
        { error: 'Missing required fields: agent_id and command_type' },
        { status: 400 }
      );
    }

    const sql = getSql();

    const agents = await sql`SELECT id, name, webhook_url FROM agents WHERE id = ${agent_id} LIMIT 1`;
    const agent = agents[0];
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const inserted = await sql`
      INSERT INTO commands (agent_id, command_type, payload, status, issued_by)
      VALUES (${agent_id}, ${command_type}, ${JSON.stringify(payload)}::jsonb, 'pending', ${issued_by})
      RETURNING *
    `;
    const command = inserted[0];

    if (!agent.webhook_url) {
      const failed = await sql`
        UPDATE commands SET status = 'failed', executed_at = NOW()
        WHERE id = ${command.id} RETURNING *
      `;
      return NextResponse.json(
        { error: 'Agent has no webhook_url configured', command: failed[0] },
        { status: 400 }
      );
    }

    let finalStatus: 'sent' | 'acknowledged' | 'failed' = 'sent';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(agent.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command_id: command.id,
          command_type,
          payload,
          issued_by,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      finalStatus = response.ok ? 'acknowledged' : 'failed';
    } catch (fetchErr: any) {
      console.warn(`Webhook failed for agent ${agent.name}:`, fetchErr.message);
      finalStatus = 'failed';
    }

    const updated = await sql`
      UPDATE commands
      SET status = ${finalStatus}, executed_at = NOW()
      WHERE id = ${command.id}
      RETURNING *
    `;

    await sql`
      INSERT INTO agent_dispatch_messages (from_agent_id, content, type)
      VALUES (
        ${agent_id},
        ${`Received command: ${String(command_type).toUpperCase()} (issued by ${issued_by}). Status: ${finalStatus.toUpperCase()}`},
        ${finalStatus === 'failed' ? 'error' : 'log'}
      )
    `;

    return NextResponse.json({ success: true, command: updated[0] });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
