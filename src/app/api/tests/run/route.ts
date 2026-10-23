import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agent_id, test_name = 'healthcheck' } = body;

    if (!agent_id) {
      return NextResponse.json({ error: 'agent_id required' }, { status: 400 });
    }

    const sql = getSql();
    const rows = await sql`
      INSERT INTO test_runs (agent_id, test_name, status, result)
      VALUES (${agent_id}, ${test_name}, 'running', '{}'::jsonb)
      RETURNING *
    `;

    // Mark passed immediately for now (real diagnostics come from agent webhooks)
    const done = await sql`
      UPDATE test_runs
      SET status = 'passed',
          result = ${JSON.stringify({ note: 'stub — agent should report real result' })}::jsonb
      WHERE id = ${rows[0].id}
      RETURNING *
    `;

    return NextResponse.json({ success: true, test_run: done[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
