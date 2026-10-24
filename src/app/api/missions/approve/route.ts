import { NextResponse } from 'next/server';
import { approveStep } from '@/lib/dispatcher';
import { checkApiKey } from '@/lib/api-auth';

export async function POST(request: Request) {
  try {
    if (!checkApiKey(request)) {
      return NextResponse.json({ error: 'Unauthorized: AEGIS_API_KEY mismatch' }, { status: 401 });
    }
    
    const body = await request.json();
    const { taskId, approvedBy = 'operator' } = body;
    
    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }
    
    const result = await approveStep(taskId, approvedBy);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Mission step approved',
      result 
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to approve mission step' },
      { status: 500 }
    );
  }
}
