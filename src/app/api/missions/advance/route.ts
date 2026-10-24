import { NextResponse } from 'next/server';
import { advanceMission } from '@/lib/mission-executor';
import { checkApiKey } from '@/lib/api-auth';

export async function POST(request: Request) {
  try {
    if (!checkApiKey(request)) {
      return NextResponse.json({ error: 'Unauthorized: AEGIS_API_KEY mismatch' }, { status: 401 });
    }
    
    const body = await request.json();
    const { taskId } = body;
    
    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }
    
    const result = await advanceMission(taskId, 5);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Mission advanced',
      result 
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to advance mission' },
      { status: 500 }
    );
  }
}
