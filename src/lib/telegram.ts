/** Minimal Telegram Bot API helpers (server-side). */

const API = 'https://api.telegram.org';

export async function telegramApi(
  token: string,
  method: string,
  body?: Record<string, unknown>
) {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || `Telegram ${method} failed`);
  }
  return data.result;
}

export async function sendTelegramMessage(
  token: string,
  chatId: string | number,
  text: string,
  extra?: Record<string, unknown>
) {
  return telegramApi(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...extra,
  });
}

export async function setTelegramWebhook(
  token: string,
  url: string,
  secretToken?: string
) {
  return telegramApi(token, 'setWebhook', {
    url,
    secret_token: secretToken || undefined,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });
}

export async function getTelegramWebhookInfo(token: string) {
  return telegramApi(token, 'getWebhookInfo');
}

/** Menu / that appears when user taps the command list in Telegram */
export const AEGIS_BOT_COMMANDS = [
  { command: 'start', description: 'Início e teclado rápido' },
  { command: 'status', description: 'Status do fleet no Aegis' },
  { command: 'id', description: 'Mostrar meu chat_id' },
  { command: 'help', description: 'Ajuda dos comandos' },
];

export async function setBotCommands(token: string) {
  return telegramApi(token, 'setMyCommands', {
    commands: AEGIS_BOT_COMMANDS,
  });
}

/** Persistent reply keyboard (tap buttons send the text) */
export function quickReplyKeyboard() {
  return {
    keyboard: [
      [{ text: '/status' }, { text: '/id' }],
      [{ text: '/help' }, { text: '/start' }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}
