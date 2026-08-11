import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      agent_id,
      severity, // 'low' | 'medium' | 'high' | 'critical'
      title,
      description,
      status = 'open', // 'open' | 'investigating' | 'resolved'
      detected_by = 'manual', // 'manual' | 'automatic'
      resolution_notes,
    } = body;

    if (!title || !severity) {
      return NextResponse.json({ error: 'Missing field: title or severity' }, { status: 400 });
    }

    const insertPayload: any = {
      agent_id: agent_id || null,
      severity,
      title,
      description,
      status,
      detected_by,
      resolution_notes: resolution_notes || null,
    };

    if (status === 'resolved') {
      insertPayload.resolved_at = new Date().toISOString();
    }

    const { data: incident, error } = await supabase
      .from('security_incidents')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to create security incident', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, incident });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
