import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { notifyOperatorTelegram } from '@/lib/fleet-notify';
import { checkApiKey } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') || 100), 500);
    const sql = getSql();

    const messages = await sql`
      SELECT m.*,
             fa.name AS from_agent_name,
             ta.name AS to_agent_name
      FROM agent_dispatch_messages m
      LEFT JOIN agents fa ON fa.id = m.from_agent_id
      LEFT JOIN agents ta ON ta.id = m.to_agent_id
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `;

    return NextResponse.json({ messages });
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
    let {
      from_agent_id,
      from_agent_name,
      to_agent_id,
      to_agent_name,
      task_id,
      content,
      type,
      notify,
    } = body;

    if (!content || !type) {
      return NextResponse.json({ error: 'Missing content or type' }, { status: 400 });
    }

    const sql = getSql();

    if (!from_agent_id && from_agent_name) {
      const rows = await sql`SELECT id FROM agents WHERE LOWER(name) = LOWER(${from_agent_name}) LIMIT 1`;
      if (rows[0]) from_agent_id = rows[0].id;
    }

    if (!to_agent_id && to_agent_name) {
      const rows = await sql`SELECT id FROM agents WHERE LOWER(name) = LOWER(${to_agent_name}) LIMIT 1`;
      if (rows[0]) to_agent_id = rows[0].id;
    }

    if (!from_agent_id) {
      return NextResponse.json({ error: 'Could not resolve from_agent_id' }, { status: 400 });
    }

    const inserted = await sql`
      INSERT INTO agent_dispatch_messages (from_agent_id, to_agent_id, task_id, content, type)
      VALUES (${from_agent_id}, ${to_agent_id || null}, ${task_id || null}, ${content}, ${type})
      RETURNING *
    `;

    // Push to Jarvis Comando when agents report progress / errors / need confirm
    const shouldNotify =
      notify === true
      || type === 'error'
      || (typeof content === 'string' && /need_confirm|awaiting_approval|FAILED|COMPLETED/i.test(content));

    if (shouldNotify) {
      const nameRows = await sql`SELECT name FROM agents WHERE id = ${from_agent_id} LIMIT 1`;
      await notifyOperatorTelegram({
        kind: type === 'error' ? 'failed' : 'log',
        agentName: nameRows[0]?.name || from_agent_name,
        title: type === 'error' ? 'Erro no agente' : 'Update do fleet',
        detail: String(content).slice(0, 1500),
        taskId: task_id,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, message: inserted[0] });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
