import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    const { severity, title, description, status, resolution_notes } = body;

    const updatePayload: any = {};
    if (severity !== undefined) updatePayload.severity = severity;
    if (title !== undefined) updatePayload.title = title;
    if (description !== undefined) updatePayload.description = description;
    if (status !== undefined) {
      updatePayload.status = status;
      if (status === 'resolved') {
        updatePayload.resolved_at = new Date().toISOString();
      } else {
        // If moved back from resolved, clear resolved_at
        updatePayload.resolved_at = null;
      }
    }
    if (resolution_notes !== undefined) updatePayload.resolution_notes = resolution_notes;

    const { data: incident, error } = await supabase
      .from('security_incidents')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update security incident', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, incident });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
