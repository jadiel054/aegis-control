# Jarvis Comando — Telegram hub (estilo Manus)

## Fluxo

```
Telegram → webhook Aegis → registra mensagem → responde
                 ↘ opcional: Morpheus /api/chat
```

## Configuração (operador)

1. BotFather → **Jarvis Comando** → copie o **token** (não cole no chat do Grok).
2. Aegis → **Config. Agentes** → filtro **Bots Telegram** → **Jarvis Comando**:
   - Cole o token
   - Chat IDs: deixe vazio na 1ª vez (ou use `/id` depois)
   - Salvar
3. Ative o webhook:

```bash
curl -X POST https://aegis-control-sand.vercel.app/api/telegram/setup \
  -H 'Content-Type: application/json' \
  -d '{"agent":"Jarvis Comando"}'
```

4. No Telegram, abra @JarvisComandoBot → `/start` → `/id`
5. Volte no Aegis e cole o chat_id no campo do agente → Salvar

## Env opcional (Vercel Aegis)

```
AEGIS_PUBLIC_URL=https://aegis-control-sand.vercel.app
TELEGRAM_WEBHOOK_SECRET=uma-string-longa-aleatoria
TELEGRAM_SETUP_SECRET=outra-string-se-quiser-proteger-setup
MORPHEUS_API_URL=https://morpheus-app-5bmx.onrender.com
```

## Comandos no bot

- `/start` — ajuda
- `/id` — mostra chat_id
- `/status` — status dos agentes no Neon
- texto livre — registra no Aegis (+ Morpheus se configurado)
