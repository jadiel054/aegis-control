import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { severity, title, description, status, resolution_notes } = body;

    const sql = getSql();

    // Read current row then apply partial update via COALESCE pattern
    const current = await sql`SELECT * FROM security_incidents WHERE id = ${id} LIMIT 1`;
    if (!current[0]) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    const nextSeverity = severity !== undefined ? severity : current[0].severity;
    const nextTitle = title !== undefined ? title : current[0].title;
    const nextDescription = description !== undefined ? description : current[0].description;
    const nextStatus = status !== undefined ? status : current[0].status;
    const nextNotes =
      resolution_notes !== undefined ? resolution_notes : current[0].resolution_notes;
    const resolvedAt =
      nextStatus === 'resolved'
        ? new Date().toISOString()
        : status !== undefined
          ? null
          : current[0].resolved_at;

    const rows = await sql`
      UPDATE security_incidents
      SET
        severity = ${nextSeverity},
        title = ${nextTitle},
        description = ${nextDescription},
        status = ${nextStatus},
        resolution_notes = ${nextNotes},
        resolved_at = ${resolvedAt}
      WHERE id = ${id}
      RETURNING *
    `;

    return NextResponse.json({ success: true, incident: rows[0] });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
