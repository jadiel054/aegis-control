/**
 * Jarvis Comando — conversational brain (Manus-style)
 * Uses GROQ_API_KEY or OPENROUTER_API_KEY from Aegis env.
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
- **Plutão** = worker / OS / write-gate
- **Zarith** = agente executivo
- Outros bots Jarvis_* = papéis especializados (ainda em configuração)

Você NÃO inventa que já executou deploy, commit ou write em produção. Se a ação exigir write (código, deploy, banco), diga o que faria e que o próximo passo é aprovar no Aegis / write-gate.

## Capacidades atuais neste canal
- Conversar, planejar, orientar e resumir status do fleet
- Explicar comandos: /start /status /id /help
- Registrar a conversa no Aegis
- Orientar próximos passos técnicos com clareza

## Capacidades em evolução (seja honesto)
- Execução autônoma completa (GitHub/Vercel/Neon) passa por Morpheus + Plutão + write-gate
- Outros bots do BotFather ainda podem estar offline até configurados

## Estilo estilo Manus
- Confirme o que entendeu em uma frase quando a tarefa for complexa
- Proponha 1–3 próximos passos concretos
- Pergunte o que falta em vez de assumir credenciais ou decisões irreversíveis
- Nunca peça para colar tokens de bot ou senhas neste chat; oriente a usar o painel Aegis

## Identidade
Se perguntarem quem você é: Jarvis Comando, hub Telegram do Aegis SOC.`;

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

/** Groq model ids change; try several until one works. */
const GROQ_MODEL_CANDIDATES = [
  process.env.JARVIS_MODEL,
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai/gpt-oss-120b',
  'gemma2-9b-it',
].filter(Boolean) as string[];

const OPENROUTER_MODEL_CANDIDATES = [
  process.env.JARVIS_MODEL,
  'meta-llama/llama-3.3-70b-instruct',
  'meta-llama/llama-3.1-70b-instruct',
  'google/gemini-2.5-flash',
  'openai/gpt-4o-mini',
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
      content: `Snapshot recente do fleet (pode estar desatualizado):\n${opts.fleetHint}`,
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
      // try next model on 404 / model_not_found
      const msg = String(e?.message || '');
      if (
        e?.status === 404
        || e?.code === 'model_not_found'
        || /model_not_found|does not exist|not have access/i.test(msg)
      ) {
        continue;
      }
      throw e;
    }
  }

  throw lastError || new Error('Nenhum modelo LLM disponível');
}
