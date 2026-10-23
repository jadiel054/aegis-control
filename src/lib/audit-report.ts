import { getSql } from '@/lib/db';
import { getMission } from '@/lib/dispatcher';
import { sendChatAction, sendTelegramDocument, sendTelegramMessage } from '@/lib/telegram';

function slug(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'missao';
}

export function buildAuditMarkdown(mission: {
  task: any;
  steps: any[];
}): string {
  const t = mission.task;
  const lines: string[] = [];

  lines.push(`# Auditoria Aegis — ${t.title}`);
  lines.push('');
  lines.push(`- **task_id:** \`${t.id}\``);
  lines.push(`- **status:** ${t.status}`);
  lines.push(`- **fonte:** ${t.source || 'n/a'}`);
  lines.push(`- **criado por:** ${t.created_by || 'n/a'}`);
  lines.push(`- **prioridade:** ${t.priority || 'n/a'}`);
  lines.push(`- **criado em:** ${t.created_at || ''}`);
  lines.push(`- **atualizado em:** ${t.updated_at || ''}`);
  lines.push('');
  lines.push('## Descrição');
  lines.push('');
  lines.push(t.description || t.title || '(sem descrição)');
  lines.push('');
  lines.push('## Pipeline');
  lines.push('');
  lines.push('| # | Agente | Papel | Status | Gate | Aprovado por |');
  lines.push('|---|--------|-------|--------|------|--------------|');
  for (const s of mission.steps) {
    lines.push(
      `| ${s.step_index} | ${s.agent_name || '-'} | ${s.role} | ${s.status} | ${s.requires_approval ? 'sim' : 'não'} | ${s.approved_by || '-'} |`
    );
  }
  lines.push('');

  for (const s of mission.steps) {
    lines.push(`## Passo ${s.step_index} — ${s.agent_name || s.role}`);
    lines.push('');
    lines.push(`- status: **${s.status}**`);
    if (s.started_at) lines.push(`- início: ${s.started_at}`);
    if (s.finished_at) lines.push(`- fim: ${s.finished_at}`);
    if (s.approved_at) lines.push(`- aprovação: ${s.approved_at} (${s.approved_by || ''})`);
    lines.push('');
    if (s.input) {
      lines.push('### Entrada');
      lines.push('');
      lines.push('```');
      lines.push(String(s.input).slice(0, 8000));
      lines.push('```');
      lines.push('');
    }
    if (s.output) {
      lines.push('### Saída');
      lines.push('');
      lines.push(String(s.output).slice(0, 12000));
      lines.push('');
    }
  }

  if (t.result_summary) {
    lines.push('## Resumo final');
    lines.push('');
    lines.push(String(t.result_summary).slice(0, 8000));
    lines.push('');
  }

  lines.push('---');
  lines.push(`_Gerado automaticamente pelo Aegis · ${new Date().toISOString()}_`);
  return lines.join('\n');
}

/** Build audit .md and send to Jarvis Comando operator chats */
export async function deliverMissionAudit(taskId: string) {
  const mission = await getMission(taskId);
  if (!mission) return { sent: 0, reason: 'not_found' };

  const md = buildAuditMarkdown(mission);
  const filename = `aegis-audit-${slug(mission.task.title)}-${String(taskId).slice(0, 8)}.md`;

  const sql = getSql();
  const rows = await sql`
    SELECT telegram_bot_token, telegram_chat_ids
    FROM agents
    WHERE LOWER(name) = 'jarvis comando'
      AND telegram_bot_token IS NOT NULL
      AND telegram_bot_token <> ''
    LIMIT 1
  `;
  const bot = rows[0];
  if (!bot?.telegram_bot_token) return { sent: 0, reason: 'no_bot' };

  const chats = Array.isArray(bot.telegram_chat_ids)
    ? bot.telegram_chat_ids.map(String)
    : [];
  if (!chats.length) return { sent: 0, reason: 'no_chats' };

  let sent = 0;
  for (const chatId of chats) {
    try {
      await sendChatAction(bot.telegram_bot_token, chatId, 'upload_document').catch(() => {});
      await sendTelegramMessage(
        bot.telegram_bot_token,
        chatId,
        `📄 <b>Auditoria da missão</b>\n<code>${taskId}</code>\n${mission.task.title}`
      );
      await sendTelegramDocument(bot.telegram_bot_token, chatId, {
        filename,
        content: md,
        caption: `Auditoria · ${mission.task.status} · ${mission.task.title}`.slice(0, 200),
        mime: 'text/markdown; charset=utf-8',
      });
      sent++;
    } catch (e) {
      console.error('[audit-deliver]', chatId, e);
    }
  }

  // Persist report text on task for panel/API
  await sql`
    UPDATE tasks SET result_summary = ${md.slice(0, 50000)}, updated_at = NOW()
    WHERE id = ${taskId}
  `;

  return { sent, filename, bytes: md.length };
}
