import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { title, description, assigned_agent_id, status, priority, created_by } = body;

    const sql = getSql();

    const current = await sql`SELECT * FROM tasks WHERE id = ${id} LIMIT 1`;
    if (!current[0]) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const nextTitle = title !== undefined ? title : current[0].title;
    const nextDescription = description !== undefined ? description : current[0].description;
    const nextAssigned =
      assigned_agent_id !== undefined ? assigned_agent_id || null : current[0].assigned_agent_id;
    const nextStatus = status !== undefined ? status : current[0].status;
    const nextPriority = priority !== undefined ? priority : current[0].priority;
    const nextCreatedBy = created_by !== undefined ? created_by : current[0].created_by;

    const rows = await sql`
      UPDATE tasks
      SET
        title = ${nextTitle},
        description = ${nextDescription},
        assigned_agent_id = ${nextAssigned},
        status = ${nextStatus},
        priority = ${nextPriority},
        created_by = ${nextCreatedBy},
        updated_at = NOW()
      WHERE id = ${id}
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
