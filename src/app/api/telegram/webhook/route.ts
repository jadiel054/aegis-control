import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { jarvisReply } from '@/lib/jarvis-brain';
import { buildFleetResumo, formatResumoHtml } from '@/lib/fleet-notify';
import {
  getTelegramFile,
  quickReplyKeyboard,
  sendChatAction,
  sendTelegramMessage,
} from '@/lib/telegram';
import { describeImage } from '@/lib/vision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function largestPhoto(message: any): string | null {
  const photos = message.photo;
  if (!Array.isArray(photos) || photos.length === 0) return null;
  return photos[photos.length - 1]?.file_id || null;
}

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
    let text = (message.text || message.caption || '').trim();
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

    if (!agent.telegram_bot_token) {
      return NextResponse.json({ ok: true, warning: 'no token' });
    }

    const token = agent.telegram_bot_token as string;
    const withKeyboard = { reply_markup: quickReplyKeyboard() };

    await sendChatAction(token, chatId, 'typing').catch(() => {});

    // --- Media: photo ---
    const photoId = largestPhoto(message);
    let visionNote = '';
    if (photoId) {
      try {
        await sendChatAction(token, chatId, 'upload_photo').catch(() => {});
        const file = await getTelegramFile(token, photoId);
        if (file.buf.length > 4_500_000) {
          visionNote = 'Imagem grande demais para análise automática (>~4MB).';
        } else {
          const b64 = file.buf.toString('base64');
          visionNote = await describeImage({
            imageBase64: b64,
            mime: file.mime,
            caption: message.caption,
          });
        }
      } catch (e: any) {
        visionNote = `Não consegui analisar a imagem: ${e.message}`;
      }
    }

    // document image mime
    if (!photoId && message.document?.mime_type?.startsWith('image/')) {
      try {
        const file = await getTelegramFile(token, message.document.file_id);
        const b64 = file.buf.toString('base64');
        visionNote = await describeImage({
          imageBase64: b64,
          mime: message.document.mime_type,
          caption: message.caption,
        });
      } catch (e: any) {
        visionNote = `Documento imagem: ${e.message}`;
      }
    } else if (message.document && !photoId) {
      visionNote = `Recebi o arquivo <code>${message.document.file_name || 'documento'}</code> (${message.document.mime_type || 'tipo desconhecido'}). Análise automática de PDF/binário ainda limitada — descreva o que precisa ou envie print.`;
    }

    await sql`
      INSERT INTO agent_dispatch_messages (from_agent_id, to_agent_id, content, type)
      VALUES (
        ${agent.id},
        NULL,
        ${JSON.stringify({
          source: 'telegram',
          chat_id: chatId,
          from,
          text,
          has_photo: Boolean(photoId),
          vision_preview: visionNote ? visionNote.slice(0, 500) : null,
          update_id: update.update_id,
        })},
        'request'
      )
    `;

    await sql`
      UPDATE agents SET status = 'online', last_heartbeat = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ last_telegram_chat_id: chatId })}::jsonb
      WHERE id = ${agent.id}
    `;

    if (text === '/start' || text.startsWith('/start ') || text === '/help') {
      await sendTelegramMessage(
        token,
        chatId,
        [
          `<b>Aegis · ${agent.name}</b>`,
          '',
          'Hub do fleet: conversa, status, resumos e alertas.',
          '',
          '/status — agentes',
          '/resumo — o que rolou (tarefas, pendências, incidentes)',
          '/pending — aguardando confirmação',
          '',
          'Envie <b>print/foto</b> para análise visual (Gemini).',
          'Agentes podem me notificar em tempo real (progresso, falha, confirmação).',
        ].join('\n'),
        withKeyboard
      );
      return NextResponse.json({ ok: true });
    }

    if (text === '/id') {
      await sendTelegramMessage(token, chatId, `chat_id: <code>${chatId}</code>`, withKeyboard);
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

    if (text === '/resumo') {
      const data = await buildFleetResumo();
      await sendTelegramMessage(token, chatId, formatResumoHtml(data), withKeyboard);
      return NextResponse.json({ ok: true });
    }

    if (text === '/pending') {
      const data = await buildFleetResumo();
      if (!data.pendingCommands.length && !data.openIncidents.length) {
        await sendTelegramMessage(
          token,
          chatId,
          'Nada pendente de confirmação no momento. ✅',
          withKeyboard
        );
      } else {
        const lines = ['<b>⏸️ Pendências</b>', ''];
        for (const c of data.pendingCommands) {
          lines.push(`• Comando <b>${c.command_type}</b> — ${c.status}`);
        }
        for (const i of data.openIncidents) {
          lines.push(`• Incidente [${i.severity}] ${i.title}`);
        }
        lines.push('', 'Quando o write-gate estiver ativo, a aprovação será por aqui / no painel Aegis.');
        await sendTelegramMessage(token, chatId, lines.join('\n'), withKeyboard);
      }
      return NextResponse.json({ ok: true });
    }

    // Pure vision reply if only photo
    if (visionNote && !text) {
      await sendTelegramMessage(token, chatId, visionNote, withKeyboard);
      await sql`
        INSERT INTO agent_dispatch_messages (from_agent_id, content, type)
        VALUES (${agent.id}, ${visionNote}, 'response')
      `;
      return NextResponse.json({ ok: true });
    }

    // Text (+ optional vision context)
    let userText = text || '(sem texto)';
    if (visionNote) {
      userText = `${text}\n\n[Análise da imagem anexada]\n${visionNote}`;
    }

    let reply =
      'Recebi no Aegis. Configure GROQ_API_KEY (texto) e GOOGLE_API_KEY (visão) no Vercel.';

    try {
      const fleetRows = await sql`SELECT name, status FROM agents ORDER BY name LIMIT 20`;
      const fleetHint = fleetRows.map((a: any) => `${a.name}:${a.status}`).join(', ');

      const recent = await sql`
        SELECT content, type FROM agent_dispatch_messages
        WHERE from_agent_id = ${agent.id}
        ORDER BY created_at DESC LIMIT 12
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
      const hist = history.slice(0, -1).slice(-8);

      const brain = await jarvisReply({
        userText,
        history: hist,
        fleetHint,
      });
      if (brain?.text) reply = brain.text;
    } catch (e: any) {
      console.error('[jarvis-brain]', e);
      reply = visionNote
        ? visionNote
        : `Tive um problema ao pensar nisso: ${e.message || 'erro'}.`;
    }

    await sendTelegramMessage(token, chatId, reply, withKeyboard);
    await sql`
      INSERT INTO agent_dispatch_messages (from_agent_id, content, type)
      VALUES (${agent.id}, ${reply}, 'response')
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
    features: ['chat', 'vision', 'resumo', 'pending', 'fleet-notify'],
  });
}
