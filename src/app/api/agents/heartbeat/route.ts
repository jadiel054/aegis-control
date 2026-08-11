import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agent_id, name, status = 'online' } = body;

    if (!agent_id && !name) {
      return NextResponse.json(
        { error: 'Missing agent_id or name in request body' },
        { status: 400 }
      );
    }

    let agentToUpdate = null;

    if (agent_id) {
      // Find by ID
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('id', agent_id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }
      agentToUpdate = data;
    } else if (name) {
      // Find by Name (case-insensitive or exact)
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .ilike('name', name)
        .single();

      if (error || !data) {
        // If not found, let's create a new agent dynamically to be extremely robust!
        // But seed already has the 3 main ones. Let's create it or return 404. Let's create it if name is unknown.
        const { data: newAgent, error: createError } = await supabase
          .from('agents')
          .insert({ name, role: 'agent', status: 'online', last_heartbeat: new Date().toISOString() })
          .select()
          .single();

        if (createError) {
          return NextResponse.json(
            { error: `Agent '${name}' not found and could not be created.` },
            { status: 404 }
          );
        }
        agentToUpdate = newAgent;
      } else {
        agentToUpdate = data;
      }
    }

    // Update heartbeat and status
    const { data: updatedAgent, error: updateError } = await supabase
      .from('agents')
      .update({
        status: status,
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', agentToUpdate.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update agent heartbeat', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, agent: updatedAgent });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
