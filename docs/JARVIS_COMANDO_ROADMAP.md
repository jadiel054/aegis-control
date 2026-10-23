# Jarvis Comando — roadmap (estilo Manus)

## Fase 1 ✅
- Webhook Aegis + /start /status /id
- Teclado rápido + menu de comandos
- Registro no feed Neon

## Fase 2 (esta entrega)
- System prompt de persona (natural, prestativo, pergunta)
- Loop conversacional via Groq/OpenRouter no Aegis
- Contexto curto das últimas mensagens do chat

**Env no Vercel (Aegis):**
```
GROQ_API_KEY=gsk_...
# ou OPENROUTER_API_KEY=...
JARVIS_MODEL=llama-3.3-70b-versatile   # opcional
```

## Fase 3 — papéis + execução
- Delegar tarefas pesadas ao Morpheus (`/api/chat` com auth)
- Comandos Aegis: `run_diagnostic`, criar task, notificar agente
- Write-gate antes de commit/deploy

## Fase 4 — multi-bot
- Mesmo brain com `agent` query param (Alerts só notifica, etc.)
- Memória por chat_id em tabela dedicada
