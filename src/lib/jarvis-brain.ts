/**
 * Jarvis Comando — conversational brain (Manus-style)
 * Uses GROQ_API_KEY or OPENROUTER_API_KEY from Aegis env.
 *
 * Groq (Oct 2026): Llama 3.x free tier mostly gone / enterprise.
 * Production chat IDs: openai/gpt-oss-20b, openai/gpt-oss-120b, qwen/qwen3.8-27b
 */

export const JARVIS_COMANDO_SYSTEM_PROMPT = `Você é o **Jarvis Comando**, porta de entrada do fleet Aegis do operador Jadiel.

## Personalidade
- Natural, prestativo e direto — como um colega técnico competente no Telegram.
- Responda em **português do Brasil**, tom conversacional (não robótico).
- Faça perguntas de esclarecimento quando a intenção estiver ambígua.
- Seja conciso no Telegram (máx. ~8–12 linhas, salvo se o usuário pedir detalhe).
- Use HTML simples se útil (<b>, <i>, <code>), sem markdown excessivo.

## Papel no sistema
Você é o **hub Telegram** do ecossistema:
- **Aegis** = mission control (status, comandos, segurança)
- **Morpheus** = orquestrador multi-LLM / planos
- **Plutão** = worker / OS / write-gate (modelos locais GGUF no app Android no futuro)
- **Zarith** = agente executivo

Você NÃO inventa que já executou deploy, commit ou write em produção. Se a ação exigir write, diga o próximo passo (aprovação no Aegis / write-gate).

## Capacidades atuais
- Conversar, planejar, orientar e resumir status do fleet
- Comandos: /start /status /id /help
- Registrar a conversa no Aegis

## Estilo Manus
- Confirme o que entendeu quando a tarefa for complexa
- Proponha 1–3 próximos passos concretos
- Não peça tokens/senhas no chat; oriente o painel Aegis

## Identidade
Jarvis Comando, hub Telegram do Aegis SOC.`;

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

/** Active Groq chat models (Oct 2026) — avoid decommissioned Llama 3.1/3.3 free ids */
const GROQ_MODEL_CANDIDATES = [
  process.env.JARVIS_MODEL,
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-safeguard-20b',
].filter(Boolean) as string[];

const OPENROUTER_MODEL_CANDIDATES = [
  process.env.JARVIS_MODEL,
  'openai/gpt-4o-mini',
  'google/gemini-2.5-flash',
  'meta-llama/llama-3.3-70b-instruct',
].filter(Boolean) as string[];

function providerConfig() {
  const groq = process.env.GROQ_API_KEY;
  if (groq) {
    return {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: groq,
      models: GROQ_MODEL_CANDIDATES,
      name: 'groq',
    };
  }
  const or = process.env.OPENROUTER_API_KEY;
  if (or) {
    return {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: or,
      models: OPENROUTER_MODEL_CANDIDATES,
      name: 'openrouter',
    };
  }
  return null;
}

async function callChat(
  url: string,
  key: string,
  model: string,
  messages: ChatMsg[]
) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': process.env.AEGIS_PUBLIC_URL || 'https://aegis-control-sand.vercel.app',
      'X-Title': 'Aegis Jarvis Comando',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 800,
    }),
  });

  const bodyText = await res.text();
  let data: any;
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new Error(`LLM ${res.status}: ${bodyText.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = data?.error?.message || bodyText.slice(0, 200);
    const err = new Error(`LLM ${res.status}: ${msg}`) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = data?.error?.code;
    throw err;
  }

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('LLM empty response');
  return { text: text.slice(0, 3500), model };
}

export async function jarvisReply(opts: {
  userText: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  fleetHint?: string;
}): Promise<{ text: string; model?: string } | null> {
  const cfg = providerConfig();
  if (!cfg) return null;

  const messages: ChatMsg[] = [
    { role: 'system', content: JARVIS_COMANDO_SYSTEM_PROMPT },
  ];

  if (opts.fleetHint) {
    messages.push({
      role: 'system',
      content: `Snapshot recente do fleet:\n${opts.fleetHint}`,
    });
  }

  for (const h of opts.history || []) {
    messages.push({ role: h.role, content: h.content.slice(0, 1500) });
  }
  messages.push({ role: 'user', content: opts.userText.slice(0, 4000) });

  let lastError: Error | null = null;
  for (const model of cfg.models) {
    try {
      return await callChat(cfg.url, cfg.key, model, messages);
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message || '');
      if (
        e?.status === 400
        || e?.status === 404
        || e?.code === 'model_not_found'
        || /model_not_found|does not exist|decommissioned|not have access|no longer supported/i.test(msg)
      ) {
        continue;
      }
      throw e;
    }
  }

  throw lastError || new Error('Nenhum modelo LLM disponível');
}
