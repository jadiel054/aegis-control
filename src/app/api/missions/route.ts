import { NextResponse } from 'next/server';
import { createMission } from '@/lib/dispatcher';

export const runtime = 'nodejs';

/** Create a shared multi-agent mission (dispatcher). */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.title) {
      return NextResponse.json({ error: 'title required' }, { status: 400 });
    }
    const result = await createMission({
      title: body.title,
      description: body.description,
      source: body.source || 'api',
      created_by: body.created_by || 'api',
      priority: body.priority,
      pipeline: body.pipeline,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
