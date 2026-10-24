import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { checkApiKey } from '@/lib/api-auth';

export async function POST(request: Request) {
  try {
    if (!checkApiKey(request)) {
      return NextResponse.json({ error: 'Unauthorized: AEGIS_API_KEY mismatch' }, { status: 401 });
    }
    const body = await request.json();
    const { agent_id, name, status = 'online', metadata } = body;

    if (!agent_id && !name) {
      return NextResponse.json(
        { error: 'Missing agent_id or name' },
        { status: 400 }
      );
    }

    const sql = getSql();
    let agent: any = null;

    if (agent_id) {
      const rows = await sql`SELECT * FROM agents WHERE id = ${agent_id} LIMIT 1`;
      agent = rows[0] || null;
      if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }
    } else {
      const rows = await sql`SELECT * FROM agents WHERE LOWER(name) = LOWER(${name}) LIMIT 1`;
      agent = rows[0] || null;

      if (!agent) {
        // Auto-register unknown agent
        const created = await sql`
          INSERT INTO agents (name, role, status, agent_type, last_heartbeat)
          VALUES (${name}, 'agent', ${status}, 'llm_agent', NOW())
          RETURNING *
        `;
        agent = created[0];
      }
    }

    const metaUpdate =
      metadata && typeof metadata === 'object'
        ? JSON.stringify(metadata)
        : null;

    const updated = metaUpdate
      ? await sql`
          UPDATE agents
          SET status = ${status},
              last_heartbeat = NOW(),
              metadata = COALESCE(metadata, '{}'::jsonb) || ${metaUpdate}::jsonb
          WHERE id = ${agent.id}
          RETURNING id, name, role, status, agent_type, last_heartbeat
        `
      : await sql`
          UPDATE agents
          SET status = ${status},
              last_heartbeat = NOW()
          WHERE id = ${agent.id}
          RETURNING id, name, role, status, agent_type, last_heartbeat
        `;

    return NextResponse.json({ success: true, agent: updated[0] });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
