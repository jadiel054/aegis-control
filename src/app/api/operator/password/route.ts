import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { isAuthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST: Change operator password
 * Note: In production, this should use bcrypt/argon2 for password hashing
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

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const sql = getSql();
    const operatorId = 'default-operator'; // In production, get from session

    // In production, you would:
    // 1. Verify currentPassword against hashed password in database
    // 2. Hash newPassword with bcrypt/argon2
    // 3. Update the hashed password in database

    // For now, we'll simulate the process
    // Check if operator exists
    const existing = await sql`
      SELECT id FROM operators 
      WHERE id = ${operatorId} 
      LIMIT 1
    `;

    if (!existing[0]) {
      return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
    }

    // In a real implementation, you would:
    // const isValid = await verifyPassword(currentPassword);
    // if (!isValid) {
    //   return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    // }
    // const hashedPassword = await hashPassword(newPassword);
    // await sql`UPDATE operators SET password_hash = ${hashedPassword} WHERE id = ${operatorId}`;

    // For now, just return success (simulation)
    return NextResponse.json({
      success: true,
      message: 'Password changed successfully (simulation - implement bcrypt/argon2 for production)',
    });
  } catch (error: any) {
    console.error('Failed to change password:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
