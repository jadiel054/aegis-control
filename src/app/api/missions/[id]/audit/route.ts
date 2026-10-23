import { NextResponse } from 'next/server';
import { deliverMissionAudit } from '@/lib/audit-report';
import { buildAuditMarkdown } from '@/lib/audit-report';
import { getMission } from '@/lib/dispatcher';

export const runtime = 'nodejs';

/** GET: download markdown body. POST: send audit doc to Telegram. */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const mission = await getMission(params.id);
    if (!mission) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const md = buildAuditMarkdown(mission);
    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="aegis-audit-${params.id.slice(0, 8)}.md"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const result = await deliverMissionAudit(params.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
