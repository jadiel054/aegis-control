import { getSql } from '@/lib/db';
import { sendTelegramMessage } from '@/lib/telegram';

export type FleetEvent = {
  kind:
    | 'heartbeat'
    | 'log'
    | 'progress'
    | 'need_confirm'
    | 'completed'
    | 'failed'
    | 'incident'
    | 'summary'
    | 'custom';
  agentName?: string;
  title?: string;
  detail?: string;
  taskId?: string;
  severity?: 'info' | 'warn' | 'error' | 'critical';
};

function formatEvent(ev: FleetEvent) {
  const icon =
    ev.kind === 'need_confirm' ? '⏸️'
    : ev.kind === 'completed' ? '✅'
    : ev.kind === 'failed' ? '❌'
    : ev.kind === 'incident' ? '🚨'
    : ev.kind === 'progress' ? '🔄'
    : '📡';

  const lines = [
    `${icon} <b>${ev.title || ev.kind}</b>`,
    ev.agentName ? `Agente: <b>${ev.agentName}</b>` : '',
    ev.detail || '',
    ev.taskId ? `task: <code>${ev.taskId}</code>` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

/** Push event to Jarvis Comando operator chat(s). */
export async function notifyOperatorTelegram(ev: FleetEvent) {
  const sql = getSql();
  const rows = await sql`
    SELECT name, telegram_bot_token, telegram_chat_ids
    FROM agents
    WHERE LOWER(name) = 'jarvis comando'
      AND telegram_bot_token IS NOT NULL
      AND telegram_bot_token <> ''
    LIMIT 1
  `;
  const bot = rows[0];
  if (!bot?.telegram_bot_token) return { sent: 0, reason: 'no_bot_token' };

  const chats = Array.isArray(bot.telegram_chat_ids)
    ? bot.telegram_chat_ids.map(String)
    : [];
  if (chats.length === 0) return { sent: 0, reason: 'no_chat_ids' };

  const text = formatEvent(ev);
  let sent = 0;
  for (const chatId of chats) {
    try {
      await sendTelegramMessage(bot.telegram_bot_token, chatId, text);
      sent++;
    } catch (e) {
      console.error('[fleet-notify]', chatId, e);
    }
  }

  // Audit log
  const jarvis = await sql`SELECT id FROM agents WHERE LOWER(name) = 'jarvis comando' LIMIT 1`;
  if (jarvis[0]) {
    await sql`
      INSERT INTO agent_dispatch_messages (from_agent_id, content, type)
      VALUES (${jarvis[0].id}, ${JSON.stringify({ event: ev, notified: sent })}, 'log')
    `;
  }

  return { sent };
}

export async function buildFleetResumo() {
  const sql = getSql();
  const agents = await sql`SELECT name, status, last_heartbeat, agent_type FROM agents ORDER BY name`;
  const tasks = await sql`
    SELECT title, status, priority, updated_at FROM tasks
    ORDER BY updated_at DESC NULLS LAST LIMIT 8
  `;
  const cmds = await sql`
    SELECT command_type, status, issued_by, created_at FROM agent_commands
    ORDER BY created_at DESC LIMIT 8
  `;
  const msgs = await sql`
    SELECT content, type, created_at FROM agent_dispatch_messages
    ORDER BY created_at DESC LIMIT 12
  `;
  const incidents = await sql`
    SELECT title, severity, status FROM security_incidents
    WHERE status IN ('open', 'investigating')
    ORDER BY created_at DESC LIMIT 5
  `;

  const pendingCmds = cmds.filter((c: any) =>
    ['pending', 'awaiting_approval', 'sent'].includes(String(c.status))
  );

  return {
    agents,
    tasks,
    recentCommands: cmds,
    pendingCommands: pendingCmds,
    recentMessages: msgs,
    openIncidents: incidents,
  };
}

export function formatResumoHtml(data: Awaited<ReturnType<typeof buildFleetResumo>>) {
  const lines: string[] = ['<b>📋 Resumo Aegis</b>', ''];

  lines.push('<b>Agentes</b>');
  for (const a of data.agents.slice(0, 15)) {
    lines.push(`• ${a.name}: ${a.status}`);
  }

  if (data.openIncidents.length) {
    lines.push('', '<b>Incidentes abertos</b>');
    for (const i of data.openIncidents) {
      lines.push(`• [${i.severity}] ${i.title} (${i.status})`);
    }
  }

  if (data.pendingCommands.length) {
    lines.push('', '<b>Comandos pendentes / confirmação</b>');
    for (const c of data.pendingCommands) {
      lines.push(`• ${c.command_type} — ${c.status}`);
    }
  }

  if (data.tasks.length) {
    lines.push('', '<b>Tarefas recentes</b>');
    for (const t of data.tasks) {
      lines.push(`• ${t.title} — ${t.status}`);
    }
  }

  lines.push('', '<i>Use /pending para foco em aprovações. Envie print para análise visual.</i>');
  return lines.join('\n');
}
