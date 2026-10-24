import { NextResponse } from 'next/server';
import { getOperatorProfile, saveOperatorProfile, getInitialsFromName, getDefaultAvatarColor, getOperatorId } from '@/lib/operator-profile';
import { isAuthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET: Get operator profile
 */
export async function GET() {
  try {
    if (!isAuthorized()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const operatorId = getOperatorId();
    const profile = await getOperatorProfile(operatorId);
    
    if (!profile) {
      // Return default profile if not exists
      return NextResponse.json({
        display_name: 'Aegis Operator',
        email: 'operator@aegis.internal',
        avatar_url: null,
        avatar_initials: 'AO',
        avatar_color: 'bg-cyan-500',
      });
    }

    return NextResponse.json(profile);
  } catch (error: any) {
    console.error('Failed to get operator profile:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST: Create or update operator profile
 */
export async function POST(request: Request) {
  try {
    if (!isAuthorized()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { display_name, email, avatar_url, avatar_initials, avatar_color } = body;

    if (!display_name || !email) {
      return NextResponse.json(
        { error: 'display_name and email are required' },
        { status: 400 }
      );
    }

    const operatorId = getOperatorId();
    
    // Auto-generate initials and color if not provided
    const finalInitials = avatar_initials || getInitialsFromName(display_name);
    const finalColor = avatar_color || getDefaultAvatarColor(display_name);

    const profile = await saveOperatorProfile(operatorId, {
      display_name: display_name.trim(),
      email: email.trim(),
      avatar_url: avatar_url || null,
      avatar_initials: finalInitials,
      avatar_color: finalColor,
    });

    return NextResponse.json({ success: true, profile } as { success: boolean; profile: unknown });
  } catch (error: any) {
    console.error('Failed to save operator profile:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
