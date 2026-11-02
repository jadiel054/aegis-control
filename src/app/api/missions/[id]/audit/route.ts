import { NextResponse } from 'next/server';
import { deliverMissionAudit, buildAuditMarkdown } from '@/lib/audit-report';
import { getMission } from '@/lib/dispatcher';
import { checkApiKey } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET: download markdown body. POST: send audit doc to Telegram. */
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
    const md = buildAuditMarkdown(mission);
    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="aegis-audit-${id.slice(0, 8)}.md"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkApiKey(req)) {
      return NextResponse.json({ error: 'Unauthorized: AEGIS_API_KEY mismatch' }, { status: 401 });
    }

    const { id } = await context.params;
    const result = await deliverMissionAudit(id);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
