import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { checkApiKey } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sql = getSql();
    const tasks = await sql`
      SELECT t.*, a.name AS assigned_agent_name
      FROM tasks t
      LEFT JOIN agents a ON a.id = t.assigned_agent_id
      ORDER BY t.created_at DESC
      LIMIT 200
    `;
    return NextResponse.json({ tasks });
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
      title,
      description = null,
      assigned_agent_id = null,
      status = 'pending',
      priority = 'medium',
      created_by = 'system',
    } = body;

    if (!title) {
      return NextResponse.json({ error: 'Missing field: title' }, { status: 400 });
    }

    const sql = getSql();
    const rows = await sql`
      INSERT INTO tasks (title, description, assigned_agent_id, status, priority, created_by)
      VALUES (${title}, ${description}, ${assigned_agent_id}, ${status}, ${priority}, ${created_by})
      RETURNING *
    `;

    return NextResponse.json({ success: true, task: rows[0] });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
