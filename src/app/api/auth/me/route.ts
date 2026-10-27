import { NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';

export async function GET() {
  return NextResponse.json({ authenticated: await isAuthorized() });
}
