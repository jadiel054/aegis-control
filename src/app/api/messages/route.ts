import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let {
      from_agent_id,
      from_agent_name,
      to_agent_id,
      to_agent_name,
      task_id,
      content,
      type, // 'request' | 'response' | 'log' | 'error'
    } = body;

    if (!content || !type) {
      return NextResponse.json(
        { error: 'Missing content or type in request body' },
        { status: 400 }
      );
    }

    // Resolve from_agent_id if only from_agent_name is provided
    if (!from_agent_id && from_agent_name) {
      const { data, error } = await supabase
        .from('agents')
        .select('id')
        .ilike('name', from_agent_name)
        .single();

      if (!error && data) {
        from_agent_id = data.id;
      }
    }

    // Resolve to_agent_id if only to_agent_name is provided
    if (!to_agent_id && to_agent_name) {
      const { data, error } = await supabase
        .from('agents')
        .select('id')
        .ilike('name', to_agent_name)
        .single();

      if (!error && data) {
        to_agent_id = data.id;
      }
    }

    if (!from_agent_id) {
      return NextResponse.json(
        { error: 'Could not resolve from_agent_id (provide from_agent_id or from_agent_name)' },
        { status: 400 }
      );
    }

    // Insert message
    const { data: insertedMessage, error: insertError } = await supabase
      .from('agent_dispatch_messages')
      .insert({
        from_agent_id,
        to_agent_id: to_agent_id || null,
        task_id: task_id || null,
        content,
        type,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: 'Failed to record message', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: insertedMessage });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
