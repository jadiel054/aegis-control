/**
 * Aegis Agent SDK (minimal)
 * ------------------------
 * Drop this file into any agent repo (Plutão, Morpheus, Zarith, bots…)
 * and call startHeartbeat() + pollCommands().
 *
 * Env:
 *   AEGIS_BASE_URL   e.g. https://aegis-control.vercel.app
 *   AEGIS_AGENT_NAME e.g. Plutao | Morpheus | Zarith
 *   AEGIS_AGENT_ID   optional UUID if already registered
 */

export type AegisConfig = {
  baseUrl: string;
  agentName: string;
  agentId?: string;
  heartbeatIntervalMs?: number;
  commandPollIntervalMs?: number;
  onCommand?: (cmd: AegisCommand) => Promise<void> | void;
};

export type AegisCommand = {
  id: string;
  agent_id: string;
  command_type: string;
  payload: Record<string, unknown>;
  status: string;
  issued_by: string;
  created_at: string;
};

export class AegisAgent {
  private cfg: Required<Pick<AegisConfig, 'baseUrl' | 'agentName'>> &
    AegisConfig;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private commandTimer?: ReturnType<typeof setInterval>;
  private agentId?: string;
  private seenCommands = new Set<string>();

  constructor(cfg: AegisConfig) {
    if (!cfg.baseUrl || !cfg.agentName) {
      throw new Error('AegisAgent requires baseUrl and agentName');
    }
    this.cfg = {
      heartbeatIntervalMs: 30_000,
      commandPollIntervalMs: 15_000,
      ...cfg,
    };
    this.agentId = cfg.agentId;
  }

  async heartbeat(status: 'online' | 'offline' | 'error' = 'online', metadata?: Record<string, unknown>) {
    const body: Record<string, unknown> = {
      status,
      name: this.cfg.agentName,
    };
    if (this.agentId) body.agent_id = this.agentId;
    if (metadata) body.metadata = metadata;

    const res = await fetch(`${this.cfg.baseUrl}/api/agents/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Heartbeat failed: ${res.status} ${err}`);
    }

    const data = await res.json();
    if (data.agent?.id) this.agentId = data.agent.id;
    return data.agent;
  }

  async sendMessage(opts: {
    content: string;
    type: 'request' | 'response' | 'log' | 'error';
    toAgentName?: string;
    toAgentId?: string;
    taskId?: string;
  }) {
    const body: Record<string, unknown> = {
      content: opts.content,
      type: opts.type,
      from_agent_name: this.cfg.agentName,
    };
    if (this.agentId) body.from_agent_id = this.agentId;
    if (opts.toAgentId) body.to_agent_id = opts.toAgentId;
    if (opts.toAgentName) body.to_agent_name = opts.toAgentName;
    if (opts.taskId) body.task_id = opts.taskId;

    const res = await fetch(`${this.cfg.baseUrl}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`sendMessage failed: ${res.status}`);
    return res.json();
  }

  async pollCommands(): Promise<AegisCommand[]> {
    if (!this.agentId) {
      // ensure we have an id via heartbeat first
      await this.heartbeat('online');
    }
    const url = `${this.cfg.baseUrl}/api/commands?agent_id=${this.agentId}&status=pending`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const commands: AegisCommand[] = data.commands || [];
    return commands.filter((c) => !this.seenCommands.has(c.id));
  }

  start() {
    const beat = async () => {
      try {
        await this.heartbeat('online');
      } catch (e) {
        console.warn('[AegisAgent] heartbeat error', e);
      }
    };

    const poll = async () => {
      try {
        const cmds = await this.pollCommands();
        for (const cmd of cmds) {
          this.seenCommands.add(cmd.id);
          if (this.cfg.onCommand) {
            await this.cfg.onCommand(cmd);
          }
        }
      } catch (e) {
        console.warn('[AegisAgent] command poll error', e);
      }
    };

    void beat();
    void poll();
    this.heartbeatTimer = setInterval(beat, this.cfg.heartbeatIntervalMs!);
    this.commandTimer = setInterval(poll, this.cfg.commandPollIntervalMs!);
  }

  stop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.commandTimer) clearInterval(this.commandTimer);
  }
}

/** Convenience factory from env */
export function createAegisAgentFromEnv(
  onCommand?: AegisConfig['onCommand']
): AegisAgent {
  const baseUrl = process.env.AEGIS_BASE_URL || '';
  const agentName = process.env.AEGIS_AGENT_NAME || '';
  const agentId = process.env.AEGIS_AGENT_ID;
  if (!baseUrl || !agentName) {
    throw new Error('Set AEGIS_BASE_URL and AEGIS_AGENT_NAME');
  }
  return new AegisAgent({ baseUrl, agentName, agentId, onCommand });
}
