import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agent_id, command_type, payload = {}, issued_by = 'system' } = body;

    if (!agent_id || !command_type) {
      return NextResponse.json(
        { error: 'Missing required fields: agent_id and command_type' },
        { status: 400 }
      );
    }

    // 1. Get agent's webhook_url
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('webhook_url, name')
      .eq('id', agent_id)
      .single();

    if (agentError || !agent) {
      return NextResponse.json(
        { error: 'Agent not found or has no valid information' },
        { status: 404 }
      );
    }

    // 2. Insert command in DB with pending status
    const { data: command, error: commandInsertError } = await supabase
      .from('commands')
      .insert({
        agent_id,
        command_type,
        payload,
        status: 'pending',
        issued_by,
      })
      .select()
      .single();

    if (commandInsertError || !command) {
      return NextResponse.json(
        { error: 'Failed to record command', details: commandInsertError?.message },
        { status: 500 }
      );
    }

    if (!agent.webhook_url) {
      // Update command as failed since there is no webhook
      const { data: failedCommand } = await supabase
        .from('commands')
        .update({ status: 'failed', executed_at: new Date().toISOString() })
        .eq('id', command.id)
        .select()
        .single();

      return NextResponse.json(
        { error: 'Agent has no webhook_url configured', command: failedCommand },
        { status: 400 }
      );
    }

    // 3. Dispatch webhook in background or with timeout
    let finalStatus = 'sent';
    let executedAt = new Date().toISOString();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 seconds timeout

      const response = await fetch(agent.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command_id: command.id,
          command_type,
          payload,
          issued_by,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        finalStatus = 'acknowledged';
      } else {
        finalStatus = 'failed';
      }
    } catch (fetchErr: any) {
      console.warn(`Webhook failed for agent ${agent.name}:`, fetchErr.message);
      finalStatus = 'failed';
    }

    // 4. Update command with execution status
    const { data: updatedCommand, error: updateError } = await supabase
      .from('commands')
      .update({
        status: finalStatus,
        executed_at: executedAt,
      })
      .eq('id', command.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update final command status', details: updateError.message },
        { status: 500 }
      );
    }

    // Create a message in log format too to show command trigger in log feed
    await supabase.from('agent_dispatch_messages').insert({
      from_agent_id: agent_id,
      content: `Received command: ${command_type.toUpperCase()} (issued by ${issued_by}). Status: ${finalStatus.toUpperCase()}`,
      type: finalStatus === 'failed' ? 'error' : 'log',
    });

    return NextResponse.json({ success: true, command: updatedCommand });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
