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
  // Telegram limit ~4096; chunk if needed
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 3900) {
    const slice = remaining.slice(0, 3900);
    const cut = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '), 2000);
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining) chunks.push(remaining);

  let last;
  for (let i = 0; i < chunks.length; i++) {
    last = await telegramApi(token, 'sendMessage', {
      chat_id: chatId,
      text: chunks[i],
      parse_mode: 'HTML',
      ...(i === chunks.length - 1 ? extra : {}),
    });
  }
  return last;
}

export async function sendChatAction(
  token: string,
  chatId: string | number,
  action: 'typing' | 'upload_photo' = 'typing'
) {
  return telegramApi(token, 'sendChatAction', { chat_id: chatId, action });
}

export async function getTelegramFile(token: string, fileId: string) {
  const file = await telegramApi(token, 'getFile', { file_id: fileId });
  const path = file.file_path as string;
  const url = `${API}/file/bot${token}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download file failed ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime =
    path.endsWith('.png') ? 'image/png'
    : path.endsWith('.webp') ? 'image/webp'
    : path.endsWith('.gif') ? 'image/gif'
    : 'image/jpeg';
  return { buf, mime, path, fileSize: file.file_size as number | undefined };
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

export const AEGIS_BOT_COMMANDS = [
  { command: 'start', description: 'Início e teclado' },
  { command: 'status', description: 'Status do fleet' },
  { command: 'resumo', description: 'Resumo do que aconteceu' },
  { command: 'pending', description: 'Aguardando confirmação' },
  { command: 'id', description: 'Meu chat_id' },
  { command: 'help', description: 'Ajuda' },
];

export async function setBotCommands(token: string) {
  return telegramApi(token, 'setMyCommands', { commands: AEGIS_BOT_COMMANDS });
}

export function quickReplyKeyboard() {
  return {
    keyboard: [
      [{ text: '/status' }, { text: '/resumo' }],
      [{ text: '/pending' }, { text: '/help' }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}
