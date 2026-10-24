import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const sql = getSql();
    const steps = await sql`
      SELECT * FROM task_steps 
      WHERE task_id = ${params.id}
      ORDER BY step_index
    `;
    return NextResponse.json({ steps });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
