import { NextResponse } from 'next/server';
import {
  approveStep,
  completeStep,
  getMission,
  rejectStep,
} from '@/lib/dispatcher';
import { checkApiKey } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkApiKey(req)) {
      return NextResponse.json({ error: 'Unauthorized: AEGIS_API_KEY mismatch' }, { status: 401 });
    }

    const { id } = await context.params;
    const mission = await getMission(id);
    if (!mission) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(mission);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Agent completes current step / handoff */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkApiKey(request)) {
      return NextResponse.json({ error: 'Unauthorized: AEGIS_API_KEY mismatch' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const action = body.action || 'complete';

    if (action === 'complete') {
      const result = await completeStep({
        taskId: id,
        stepIndex: body.step_index,
        output: body.output || '',
        agentName: body.agent_name,
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'approve') {
      const result = await approveStep(id, 'api');
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'reject') {
      const result = await rejectStep(
        id,
        body.reason || 'Rejeitado via API',
        'api'
      );
      return NextResponse.json({ success: true, mission: result });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
