import { NextResponse } from 'next/server';
import {
  approveStep,
  completeStep,
  getMission,
  rejectStep,
} from '@/lib/dispatcher';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const mission = await getMission(params.id);
    if (!mission) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(mission);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Agent completes current step / handoff */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const action = body.action || 'complete';

    if (action === 'complete') {
      const result = await completeStep({
        taskId: params.id,
        stepIndex: body.step_index,
        output: body.output || '',
        agentName: body.agent_name,
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'approve') {
      const result = await approveStep(params.id, body.by || 'operator');
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'reject') {
      const result = await rejectStep(
        params.id,
        body.reason || 'Rejeitado',
        body.by || 'operator'
      );
      return NextResponse.json({ success: true, mission: result });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
