import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { isAuthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET: Get operator personalization settings
 */
export async function GET() {
  try {
    if (!await isAuthorized()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sql = getSql();
    const operatorId = 'default-operator'; // In production, get from session

    // Check if settings exist
    const rows = await sql`
      SELECT * FROM operator_personalization 
      WHERE operator_id = ${operatorId} 
      LIMIT 1
    `;

    if (rows[0]) {
      return NextResponse.json(rows[0]);
    }

    // Return defaults if not exists
    return NextResponse.json({
      accent_color: 'bg-cyan-500',
      density: 'default',
      font_size: 'medium',
      polling_enabled: true,
      polling_interval: 10,
      show_timestamps: true,
      dark_mode: true,
    });
  } catch (error: any) {
    console.error('Failed to get personalization:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST: Create or update operator personalization settings
 */
export async function POST(request: Request) {
  try {
    if (!isAuthorized()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      accent_color,
      density,
      font_size,
      polling_enabled,
      polling_interval,
      show_timestamps,
      dark_mode,
    } = body;

    const sql = getSql();
    const operatorId = 'default-operator'; // In production, get from session

    // Check if settings exist
    const existing = await sql`
      SELECT id FROM operator_personalization 
      WHERE operator_id = ${operatorId} 
      LIMIT 1
    `;

    if (existing[0]) {
      // Update existing settings
      const updated = await sql`
        UPDATE operator_personalization 
        SET 
          accent_color = ${accent_color},
          density = ${density},
          font_size = ${font_size},
          polling_enabled = ${polling_enabled},
          polling_interval = ${polling_interval},
          show_timestamps = ${show_timestamps},
          dark_mode = ${dark_mode},
          updated_at = NOW()
        WHERE operator_id = ${operatorId}
        RETURNING *
      `;
      return NextResponse.json({ success: true, settings: updated[0] });
    } else {
      // Create new settings
      const created = await sql`
        INSERT INTO operator_personalization 
          (operator_id, accent_color, density, font_size, polling_enabled, polling_interval, show_timestamps, dark_mode, created_at, updated_at)
        VALUES 
          (${operatorId}, ${accent_color}, ${density}, ${font_size}, ${polling_enabled}, ${polling_interval}, ${show_timestamps}, ${dark_mode}, NOW(), NOW())
        RETURNING *
      `;
      return NextResponse.json({ success: true, settings: created[0] });
    }
  } catch (error: any) {
    console.error('Failed to save personalization:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
