import { NextResponse } from 'next/server';
import { advanceMission } from '@/lib/mission-executor';
import { checkApiKey } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Advance pipeline for a mission (auto-run ready steps until gate/done). */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (!checkApiKey(req)) {
      return NextResponse.json({ error: 'Unauthorized: AEGIS_API_KEY mismatch' }, { status: 401 });
    }

    const result = await advanceMission(params.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
