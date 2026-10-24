import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { checkApiKey } from '@/lib/api-auth';

export async function GET() {
  try {
    const sql = getSql();
    const incidents = await sql`
      SELECT i.*, a.name AS agent_name
      FROM security_incidents i
      LEFT JOIN agents a ON a.id = i.agent_id
      ORDER BY i.created_at DESC
      LIMIT 200
    `;
    return NextResponse.json({ incidents });
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
      agent_id = null,
      severity,
      title,
      description = null,
      status = 'open',
      detected_by = 'manual',
      resolution_notes = null,
    } = body;

    if (!title || !severity) {
      return NextResponse.json(
        { error: 'Missing field: title or severity' },
        { status: 400 }
      );
    }

    const sql = getSql();
    const resolvedAt = status === 'resolved' ? new Date().toISOString() : null;

    const rows = await sql`
      INSERT INTO security_incidents
        (agent_id, severity, title, description, status, detected_by, resolution_notes, resolved_at)
      VALUES
        (${agent_id}, ${severity}, ${title}, ${description}, ${status}, ${detected_by}, ${resolution_notes}, ${resolvedAt})
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
