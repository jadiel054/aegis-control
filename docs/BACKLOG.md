# Aegis / fleet backlog

## Done
- Neon migration (Supabase unlinked)
- Agent SDK (heartbeat, command poll, message dispatch)
- Morpheus live heartbeat on Render
- Plutão + Zarith heartbeat via GitHub Actions
- Telegram fields on schema + UI `/agents`
- Tests panel `run_diagnostic`

## Next (write-gate / GGUF / MCP write)

Aligned with Plutão queue:

1. **Write-gate no chat do Aegis**
   - Commands that mutate repos/DB require operator approval in Aegis UI
   - Status flow: `pending` → `awaiting_approval` → `approved` | `rejected` → agent executes
   - Reuse Plutão waitingApproval pattern

2. **GGUF (Plutão Android local model)**
   - Already in `plutao-os/apps/android/native`
   - Surface status/capability on Aegis agent card for Plutão
   - Command type `gguf_infer` optional later

3. **MCP write**
   - Reintroduce `mcp:write` + `send_message` only with OAuth consent, rate limit, audit
   - Ops key remains read-only until gate is live
   - Aegis records audit rows in `messages` / `security_incidents`

Do not bypass gates.
