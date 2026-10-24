import { NextResponse } from 'next/server';
import { deliverMissionAudit } from '@/lib/audit-report';
import { buildAuditMarkdown } from '@/lib/audit-report';
import { getMission } from '@/lib/dispatcher';

export const runtime = 'nodejs';

/** GET: download markdown body. POST: send audit doc to Telegram. */
function checkApiKey(req: Request): boolean {
  const expectedKey = process.env.AEGIS_API_KEY;
  if (!expectedKey) return true; // If key is not set, allow access
  const authHeader = req.headers.get('authorization');
  const xApiKey = req.headers.get('x-api-key');
  if (xApiKey === expectedKey) return true;
  if (authHeader) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    if (token === expectedKey) return true;
  }
  return false;
}

/** GET: download markdown body. POST: send audit doc to Telegram. */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (!checkApiKey(req)) {
      return NextResponse.json({ error: 'Unauthorized: AEGIS_API_KEY mismatch' }, { status: 401 });
    }

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
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (!checkApiKey(req)) {
      return NextResponse.json({ error: 'Unauthorized: AEGIS_API_KEY mismatch' }, { status: 401 });
    }

    const result = await deliverMissionAudit(params.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
