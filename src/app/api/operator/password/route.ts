import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { isAuthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST: Change operator password
 *
 * Status: SIMULATION ONLY.
 * Does not persist a new password. Real implementation must hash with
 * bcrypt/argon2 and store against the operator record.
 */
export async function POST(request: Request) {
  try {
    if (!isAuthorized()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'currentPassword and newPassword are required' },
        { status: 400 }
      );
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const sql = getSql();
    const operatorId = 'default-operator'; // TODO: derive from signed session

    const existing = await sql`
      SELECT id FROM operators
      WHERE id = ${operatorId}
      LIMIT 1
    `;

    if (!existing[0]) {
      return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
    }

    // Simulation only — password is not actually changed.
    return NextResponse.json({
      success: true,
      message:
        'Password change accepted (simulation). Implement bcrypt/argon2 + DB update before production use.',
    });
  } catch (error) {
    console.error('Failed to change password:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
