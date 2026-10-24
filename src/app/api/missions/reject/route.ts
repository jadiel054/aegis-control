import { NextResponse } from 'next/server';
import { rejectStep } from '@/lib/dispatcher';
import { checkApiKey } from '@/lib/api-auth';

export async function POST(request: Request) {
  try {
    if (!checkApiKey(request)) {
      return NextResponse.json({ error: 'Unauthorized: AEGIS_API_KEY mismatch' }, { status: 401 });
    }
    
    const body = await request.json();
    const { taskId, reason = 'Rejected by operator', by = 'operator' } = body;
    
    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }
    
    const result = await rejectStep(taskId, reason, by);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Mission rejected',
      result 
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to reject mission' },
      { status: 500 }
    );
  }
}
