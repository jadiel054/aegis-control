import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { checkApiKey } from '@/lib/api-auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agent_id?: string }> }
) {
  try {
    if (!checkApiKey(request)) {
      return NextResponse.json({ error: 'Unauthorized: AEGIS_API_KEY mismatch' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent_id');
    
    if (!agentId) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
    }

    const sql = getSql();
    
    const steps = await sql`
      SELECT ts.*, t.title as task_title, t.description as task_description
      FROM task_steps ts
      JOIN tasks t ON t.id = ts.task_id
      WHERE ts.agent_id = ${agentId}
      AND ts.status IN ('ready', 'approved')
      AND (t.status = 'in_progress' OR t.status = 'pending')
      ORDER BY ts.created_at
    `;

    const readySteps = steps.map((step: any) => ({
      taskId: step.task_id,
      step: {
        id: step.id,
        step_index: step.step_index,
        role: step.role,
        status: step.status,
        input: step.input,
        execution_mode: step.execution_mode,
      },
      taskTitle: step.task_title,
      taskDescription: step.task_description,
    }));

    return NextResponse.json({ readySteps });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
