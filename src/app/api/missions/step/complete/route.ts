import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { completeStep } from '@/lib/dispatcher';
import { checkApiKey } from '@/lib/api-auth';

export async function POST(request: Request) {
  try {
    if (!checkApiKey(request)) {
      return NextResponse.json({ error: 'Unauthorized: AEGIS_API_KEY mismatch' }, { status: 401 });
    }
    
    const body = await request.json();
    const { taskId, stepIndex, output, agentName } = body;
    
    if (!taskId || stepIndex === undefined) {
      return NextResponse.json(
        { error: 'taskId and stepIndex are required' },
        { status: 400 }
      );
    }
    
    const result = await completeStep({
      taskId,
      stepIndex,
      output: output || 'Step completed by agent',
      agentName: agentName || 'unknown',
    });
    
    return NextResponse.json({ 
      success: true, 
      message: 'Step completed',
      result 
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to complete step' },
      { status: 500 }
    );
  }
}
