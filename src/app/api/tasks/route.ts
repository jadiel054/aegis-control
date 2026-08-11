import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      title,
      description,
      assigned_agent_id,
      status = 'pending',
      priority = 'medium',
      created_by = 'system',
    } = body;

    if (!title) {
      return NextResponse.json({ error: 'Missing field: title' }, { status: 400 });
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        title,
        description,
        assigned_agent_id: assigned_agent_id || null,
        status,
        priority,
        created_by,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to create task', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, task });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
