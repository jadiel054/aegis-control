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

function providerConfig() {
  const groq = process.env.GROQ_API_KEY;
  if (groq) {
    return {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: groq,
      model: process.env.JARVIS_MODEL || 'llama-3.3-70b-versatile',
    };
  }
  const or = process.env.OPENROUTER_API_KEY;
  if (or) {
    return {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: or,
      model: process.env.JARVIS_MODEL || 'meta-llama/llama-3.3-70b-instruct',
    };
  }
  return null;
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

  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.key}`,
      'HTTP-Referer': process.env.AEGIS_PUBLIC_URL || 'https://aegis-control-sand.vercel.app',
      'X-Title': 'Aegis Jarvis Comando',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: 0.7,
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) return null;
  return { text: text.slice(0, 3500), model: cfg.model };
}
