import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { jarvisReply } from '@/lib/jarvis-brain';
import { quickReplyKeyboard, sendTelegramMessage } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret) {
      const header = request.headers.get('x-telegram-bot-api-secret-token');
      if (header !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { searchParams } = new URL(request.url);
    const agentName = searchParams.get('agent') || 'Jarvis Comando';

    const update = await request.json();
    const message = update.message || update.edited_message;
    if (!message?.chat?.id) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const chatId = String(message.chat.id);
    const text = (message.text || message.caption || '').trim();
    const from = message.from
      ? `${message.from.first_name || ''} ${message.from.last_name || ''}`.trim()
      : 'unknown';

    const sql = getSql();
    const agents = await sql`
      SELECT * FROM agents WHERE LOWER(name) = LOWER(${agentName}) LIMIT 1
    `;
    const agent = agents[0];
    if (!agent) {
      return NextResponse.json({ error: `Agent ${agentName} not found` }, { status: 404 });
    }

    const allowed = Array.isArray(agent.telegram_chat_ids)
      ? agent.telegram_chat_ids.map(String)
      : [];
    if (allowed.length > 0 && !allowed.includes(chatId)) {
      if (agent.telegram_bot_token) {
        await sendTelegramMessage(
          agent.telegram_bot_token,
          chatId,
          '⛔ Chat não autorizado neste bot.'
        ).catch(() => {});
      }
      return NextResponse.json({ ok: true, denied: true });
    }

    await sql`
      INSERT INTO agent_dispatch_messages (from_agent_id, to_agent_id, content, type)
      VALUES (
        ${agent.id},
        NULL,
        ${JSON.stringify({ source: 'telegram', chat_id: chatId, from, text, update_id: update.update_id })},
        'request'
      )
    `;

    await sql`
      UPDATE agents SET status = 'online', last_heartbeat = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ last_telegram_chat_id: chatId })}::jsonb
      WHERE id = ${agent.id}
    `;

    if (!agent.telegram_bot_token) {
      return NextResponse.json({ ok: true, warning: 'no token' });
    }

    const token = agent.telegram_bot_token as string;
    const withKeyboard = { reply_markup: quickReplyKeyboard() };

    if (text === '/start' || text.startsWith('/start ') || text === '/help') {
      await sendTelegramMessage(
        token,
        chatId,
        [
          `<b>Aegis · ${agent.name}</b>`,
          '',
          'Hub do fleet — conversa natural + status.',
          '',
          'Comandos rápidos:',
          '/status — fleet',
          '/id — seu chat_id',
          '/help — ajuda',
          '',
          'Ou escreva em linguagem normal: eu respondo, pergunto e oriento os próximos passos.',
        ].join('\n'),
        withKeyboard
      );
      return NextResponse.json({ ok: true });
    }

    if (text === '/id') {
      await sendTelegramMessage(
        token,
        chatId,
        `Seu chat_id: <code>${chatId}</code>`,
        withKeyboard
      );
      return NextResponse.json({ ok: true });
    }

    if (text === '/status') {
      const onlineAgents = await sql`
        SELECT name, status, last_heartbeat FROM agents ORDER BY name LIMIT 30
      `;
      const lines = onlineAgents.map(
        (a: any) =>
          `• <b>${a.name}</b> — ${a.status} (${a.last_heartbeat ? new Date(a.last_heartbeat).toLocaleString() : 'never'})`
      );
      await sendTelegramMessage(
        token,
        chatId,
        `<b>Fleet status</b>\n\n${lines.join('\n')}`,
        withKeyboard
      );
      return NextResponse.json({ ok: true });
    }

    // Conversational path
    let reply =
      'Recebi sua mensagem no Aegis. Para eu responder com IA, o operador precisa configurar GROQ_API_KEY (ou OPENROUTER_API_KEY) no Vercel do Aegis.';

    try {
      const fleetRows = await sql`
        SELECT name, status FROM agents ORDER BY name LIMIT 20
      `;
      const fleetHint = fleetRows
        .map((a: any) => `${a.name}:${a.status}`)
        .join(', ');

      // Recent context for this chat (best-effort from last messages)
      const recent = await sql`
        SELECT content, type FROM agent_dispatch_messages
        WHERE from_agent_id = ${agent.id}
        ORDER BY created_at DESC
        LIMIT 12
      `;
      const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      for (const row of [...recent].reverse()) {
        try {
          if (row.type === 'request') {
            const parsed = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
            if (parsed?.text && String(parsed.chat_id) === chatId) {
              history.push({ role: 'user', content: String(parsed.text) });
            }
          } else if (row.type === 'response' && typeof row.content === 'string') {
            history.push({ role: 'assistant', content: row.content });
          }
        } catch {
          /* skip */
        }
      }
      // drop the message we just inserted (last user) to avoid dup — jarvisReply adds userText
      const hist = history.slice(0, -1).slice(-8);

      const brain = await jarvisReply({
        userText: text || '(sem texto)',
        history: hist,
        fleetHint,
      });
      if (brain?.text) reply = brain.text;
    } catch (e: any) {
      console.error('[jarvis-brain]', e);
      reply = `Tive um problema ao pensar nisso: ${e.message || 'erro'}. Tente de novo em instantes.`;
    }

    await sendTelegramMessage(token, chatId, reply, withKeyboard);

    await sql`
      INSERT INTO agent_dispatch_messages (from_agent_id, to_agent_id, content, type)
      VALUES (${agent.id}, NULL, ${reply}, 'response')
    `;

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[telegram webhook]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ service: 'aegis-telegram-gateway', brain: 'jarvis-brain' });
}
