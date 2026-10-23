import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { quickReplyKeyboard, sendTelegramMessage } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
      SELECT * FROM agents
      WHERE LOWER(name) = LOWER(${agentName}) LIMIT 1
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
          '⛔ Chat não autorizado neste bot. Peça ao operador para liberar seu chat_id no Aegis.'
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
      return NextResponse.json({ ok: true, warning: 'no token configured' });
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
          'Hub Telegram do fleet (estilo Manus).',
          '',
          'Toque nos botões abaixo ou digite:',
          '/start — início + teclado',
          '/status — status do fleet',
          '/id — seu chat_id',
          '/help — esta ajuda',
          '',
          'Texto livre: registra no Aegis e responde.',
          '',
          `<i>chat_id: <code>${chatId}</code></i>`,
        ].join('\n'),
        withKeyboard
      );
      return NextResponse.json({ ok: true });
    }

    if (text === '/id') {
      await sendTelegramMessage(
        token,
        chatId,
        `Seu chat_id: <code>${chatId}</code>\nJá está liberado se aparecer no painel Aegis.`,
        withKeyboard
      );
      return NextResponse.json({ ok: true });
    }

    if (text === '/status') {
      const onlineAgents = await sql`
        SELECT name, status, last_heartbeat FROM agents
        ORDER BY name LIMIT 30
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

    let reply =
      `✅ Recebido no Aegis (${agent.name}).\n` +
      `Mensagem registrada no feed.\n` +
      `<i>${text.slice(0, 200) || '(sem texto)'}</i>`;

    const morpheusUrl = process.env.MORPHEUS_API_URL;
    if (morpheusUrl && text && !text.startsWith('/')) {
      try {
        const mr = await fetch(`${morpheusUrl.replace(/\/$/, '')}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.MORPHEUS_API_KEY
              ? { Authorization: `Bearer ${process.env.MORPHEUS_API_KEY}` }
              : {}),
          },
          body: JSON.stringify({
            message: text,
            source: 'telegram',
            agent: agent.name,
            chat_id: chatId,
          }),
        });
        if (mr.ok) {
          const data = await mr.json();
          const answer =
            data.reply || data.message || data.content || data.response;
          if (answer && typeof answer === 'string') {
            reply = answer.slice(0, 3500);
          }
        }
      } catch {
        // keep local ack
      }
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
  return NextResponse.json({
    service: 'aegis-telegram-gateway',
    usage: 'POST webhook from Telegram; configure via /api/telegram/setup',
  });
}
