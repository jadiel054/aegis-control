import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import {
  approveStep,
  createMission,
  getMission,
  rejectStep,
} from '@/lib/dispatcher';
import { advanceMission } from '@/lib/mission-executor';
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

    const photoId = largestPhoto(message);
    let visionNote = '';
    if (photoId) {
      try {
        const file = await getTelegramFile(token, photoId);
        if (file.buf.length <= 4_500_000) {
          visionNote = await describeImage({
            imageBase64: file.buf.toString('base64'),
            mime: file.mime,
            caption: message.caption,
          });
        }
      } catch (e: any) {
        visionNote = `Não consegui analisar a imagem: ${e.message}`;
      }
    }

    await sql`
      INSERT INTO agent_dispatch_messages (from_agent_id, content, type)
      VALUES (${agent.id}, ${JSON.stringify({ source: 'telegram', chat_id: chatId, from, text })}, 'request')
    `;
    await sql`UPDATE agents SET status = 'online', last_heartbeat = NOW() WHERE id = ${agent.id}`;

    if (text === '/start' || text.startsWith('/start ') || text === '/help') {
      await sendTelegramMessage(
        token,
        chatId,
        [
          `<b>Aegis · ${agent.name}</b>`,
          '',
          '/mission &lt;texto&gt; — cria e inicia pipeline',
          '/approve &lt;id&gt; — libera passo Plutão',
          '/reject &lt;id&gt; — cancela',
          '/task &lt;id&gt; — ver passos',
          '/pending /status /resumo',
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
      const rows = await sql`SELECT name, status FROM agents ORDER BY name LIMIT 30`;
      await sendTelegramMessage(
        token,
        chatId,
        `<b>Fleet</b>\n\n${rows.map((a: any) => `• ${a.name}: ${a.status}`).join('\n')}`,
        withKeyboard
      );
      return NextResponse.json({ ok: true });
    }

    if (text === '/resumo') {
      await sendTelegramMessage(token, chatId, formatResumoHtml(await buildFleetResumo()), withKeyboard);
      return NextResponse.json({ ok: true });
    }

    if (text === '/pending') {
      const waiting = await sql`
        SELECT t.id, t.title, s.agent_name, s.role FROM task_steps s
        JOIN tasks t ON t.id = s.task_id
        WHERE s.status = 'awaiting_approval'
        ORDER BY s.created_at DESC LIMIT 10
      `;
      if (!waiting.length) {
        await sendTelegramMessage(token, chatId, 'Nada aguardando aprovação. ✅', withKeyboard);
      } else {
        const lines = ['<b>⏸️ Aguardando aprovação</b>', ''];
        for (const w of waiting) {
          lines.push(`• ${w.title} (${w.agent_name || w.role})`);
          lines.push(`  <code>/approve ${w.id}</code>`);
        }
        await sendTelegramMessage(token, chatId, lines.join('\n'), withKeyboard);
      }
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/mission ') || text.startsWith('/missao ')) {
      const body = text.replace(/^\/(mission|missao)\s+/i, '').trim();
      if (!body) {
        await sendTelegramMessage(token, chatId, 'Uso: /mission descreva a tarefa', withKeyboard);
        return NextResponse.json({ ok: true });
      }

      const { task, steps } = await createMission({
        title: body.slice(0, 120),
        description: body,
        source: 'telegram',
        created_by: `telegram:${chatId}`,
      });

      await sendTelegramMessage(
        token,
        chatId,
        `<b>Missão criada</b>\n<code>${task.id}</code>\n${body.slice(0, 200)}\n\nIniciando pipeline…`,
        withKeyboard
      );

      // Auto-run until approval gate or done
      let advanced;
      try {
        advanced = await advanceMission(task.id);
      } catch (e: any) {
        await sendTelegramMessage(token, chatId, `Executor: ${e.message}`, withKeyboard);
        return NextResponse.json({ ok: true });
      }

      const m = advanced.mission;
      const plan = (m?.steps || steps)
        .map((s: any) => `${s.step_index}:${s.agent_name || s.role}[${s.status}]`)
        .join(' → ');

      await sendTelegramMessage(
        token,
        chatId,
        `<b>Pipeline</b>\n${plan}\n\n${
          m?.task?.status === 'done'
            ? '✅ Concluída'
            : 'Se parou em awaiting_approval, use /approve com o id.'
        }`,
        withKeyboard
      );
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/approve ')) {
      const id = text.replace('/approve ', '').trim();
      try {
        const result = await approveStep(id, `telegram:${chatId}`);
        // Continue pipeline after approval
        const advanced = await advanceMission(id);
        await sendTelegramMessage(
          token,
          chatId,
          `✅ Aprovado e avançado.\ncomplete=${result.status}\ntask=${id}\nstatus agora: ${advanced.mission?.task?.status}`,
          withKeyboard
        );
      } catch (e: any) {
        await sendTelegramMessage(token, chatId, `Erro: ${e.message}`, withKeyboard);
      }
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/reject ')) {
      const id = text.replace('/reject ', '').trim().split(/\s+/)[0];
      try {
        await rejectStep(id, 'Rejeitado via Telegram', `telegram:${chatId}`);
        await sendTelegramMessage(token, chatId, `❌ Rejeitada\n<code>${id}</code>`, withKeyboard);
      } catch (e: any) {
        await sendTelegramMessage(token, chatId, `Erro: ${e.message}`, withKeyboard);
      }
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/task ')) {
      const id = text.replace('/task ', '').trim();
      const mission = await getMission(id);
      if (!mission) {
        await sendTelegramMessage(token, chatId, 'Não encontrada', withKeyboard);
      } else {
        const lines = [
          `<b>${mission.task.title}</b> (${mission.task.status})`,
          ...mission.steps.map(
            (s: any) =>
              `${s.step_index}. ${s.agent_name || s.role} — <b>${s.status}</b>`
          ),
        ];
        await sendTelegramMessage(token, chatId, lines.join('\n'), withKeyboard);
      }
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/run ')) {
      const id = text.replace('/run ', '').trim();
      try {
        const advanced = await advanceMission(id);
        await sendTelegramMessage(
          token,
          chatId,
          `Run: ${advanced.mission?.task?.status}\n<code>${id}</code>`,
          withKeyboard
        );
      } catch (e: any) {
        await sendTelegramMessage(token, chatId, e.message, withKeyboard);
      }
      return NextResponse.json({ ok: true });
    }

    if (visionNote && !text) {
      await sendTelegramMessage(token, chatId, visionNote, withKeyboard);
      return NextResponse.json({ ok: true });
    }

    let userText = text || '(sem texto)';
    if (visionNote) userText = `${text}\n\n[Imagem]\n${visionNote}`;
    let reply = 'Recebi.';
    try {
      const brain = await jarvisReply({ userText });
      if (brain?.text) reply = brain.text;
    } catch (e: any) {
      reply = e.message;
    }
    await sendTelegramMessage(token, chatId, reply, withKeyboard);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[telegram webhook]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ service: 'aegis-telegram-gateway', missions: true });
}
