# Jarvis Comando — ops hub

## Capacidades

- Chat texto (Groq `openai/gpt-oss-20b` …)
- Foto/print → visão Gemini (`GOOGLE_API_KEY` ou OpenRouter)
- `/resumo` `/pending` `/status`
- Agentes notificam: `POST /api/telegram/notify`

## Env Vercel (Aegis)

```
GROQ_API_KEY=
JARVIS_MODEL=openai/gpt-oss-20b
GOOGLE_API_KEY=          # ou GEMINI_API_KEY — visão
OPENROUTER_API_KEY=      # fallback texto/visão
AEGIS_PUBLIC_URL=https://aegis-control-sand.vercel.app
AEGIS_NOTIFY_SECRET=     # opcional protege /api/telegram/notify
```

## Notify (outros agentes)

```bash
curl -X POST https://aegis-control-sand.vercel.app/api/telegram/notify \
  -H 'Content-Type: application/json' \
  -d '{
    "kind": "need_confirm",
    "agentName": "Plutao",
    "title": "Write-gate: commit pendente",
    "detail": "PR #42 aguardando aprovação",
    "taskId": "uuid-opcional"
  }'
```

kinds: heartbeat | log | progress | need_confirm | completed | failed | incident | summary | custom

## Mensagens de agente

`POST /api/messages` com `notify: true` ou `type: error` também dispara Telegram.
