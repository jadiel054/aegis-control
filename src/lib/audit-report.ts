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

export function cleanHtmlForMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .replace(/<pre>([\s\S]*?)<\/pre>/gi, '```\n$1\n```');
}

export function buildAuditMarkdown(mission: {
  task: any;
  steps: any[];
}): string {
  const t = mission.task;
  const lines: string[] = [];

  lines.push(`# Auditoria Aegis — ${cleanHtmlForMarkdown(t.title)}`);
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
  lines.push(cleanHtmlForMarkdown(t.description || t.title || '(sem descrição)'));
  lines.push('');
  lines.push('## Pipeline');
  lines.push('');
  lines.push('| # | Agente | Papel | Status | Modo | Gate | Aprovado por |');
  lines.push('|---|--------|-------|--------|------|------|--------------|');
  for (const s of mission.steps) {
    const modeLabel = (s.execution_mode || 'simulated') === 'real' ? 'REAL' : 'SIMULADO';
    lines.push(
      `| ${s.step_index} | ${cleanHtmlForMarkdown(s.agent_name || '-')} | ${s.role} | ${s.status} | ${modeLabel} | ${s.requires_approval ? 'sim' : 'não'} | ${s.approved_by || '-'} |`
    );
  }
  lines.push('');

  for (const s of mission.steps) {
    const modeLabel = (s.execution_mode || 'simulated') === 'real' ? 'REAL' : 'SIMULADO';
    lines.push(`## Passo ${s.step_index} — ${cleanHtmlForMarkdown(s.agent_name || s.role)}`);
    lines.push('');
    lines.push(`- status: **${s.status}**`);
    lines.push(`- modo: **${modeLabel}**`);
    if (s.started_at) lines.push(`- início: ${s.started_at}`);
    if (s.finished_at) lines.push(`- fim: ${s.finished_at}`);
    if (s.approved_at) lines.push(`- aprovação: ${s.approved_at} (${s.approved_by || ''})`);
    lines.push('');
    if (s.input) {
      lines.push('### Entrada');
      lines.push('');
      lines.push('```');
      lines.push(cleanHtmlForMarkdown(String(s.input).slice(0, 8000)));
      lines.push('```');
      lines.push('');
    }
    if (s.output) {
      lines.push('### Saída');
      lines.push('');
      lines.push(cleanHtmlForMarkdown(String(s.output).slice(0, 12000)));
      lines.push('');
    }
  }

  if (t.result_summary) {
    lines.push('## Resumo final');
    lines.push('');
    lines.push(cleanHtmlForMarkdown(String(t.result_summary).slice(0, 8000)));
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

  // Save report text on task for panel/API first so it's recorded even if send fails
  await sql`
    UPDATE tasks SET audit_markdown = ${md.slice(0, 50000)}, updated_at = NOW()
    WHERE id = ${taskId}
  `;

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
    const sendFn = async () => {
      await sendChatAction(bot.telegram_bot_token, chatId, 'upload_document').catch(() => {});
      await sendTelegramMessage(
        bot.telegram_bot_token,
        chatId,
        `📄 <b>Auditoria da missão</b>\n<code>${taskId}</code>\n${cleanHtmlForMarkdown(mission.task.title)}`
      );
      await sendTelegramDocument(bot.telegram_bot_token, chatId, {
        filename,
        content: md,
        caption: `Auditoria · ${mission.task.status} · ${cleanHtmlForMarkdown(mission.task.title)}`.slice(0, 200),
        mime: 'text/markdown; charset=utf-8',
      });
    };

    try {
      await sendFn();
      sent++;
    } catch (e: any) {
      console.error(`[audit-deliver] Initial send failed for chat ${chatId}: ${e?.message || String(e)}. Retrying once...`);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await sendFn();
        sent++;
      } catch (retryError: any) {
        console.error(`[audit-deliver] Retry send failed for chat ${chatId}: ${retryError?.message || String(retryError)}`);
      }
    }
  }

  return { sent, filename, bytes: md.length };
}
