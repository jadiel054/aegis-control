import { neon } from '@neondatabase/serverless';

/**
 * Neon HTTP client (server-side only).
 * Use DATABASE_URL (pooled) for app traffic.
 */
export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Point it to the Neon pooled connection string.');
  }
  return neon(url);
}

export type Agent = {
  id: string;
  name: string;
  role: string;
  status: 'online' | 'offline' | 'error';
  agent_type: 'llm_agent' | 'telegram_bot' | 'worker' | 'saas' | 'orchestrator';
  webhook_url: string | null;
  telegram_bot_token: string | null;
  telegram_chat_ids: unknown;
  capabilities: unknown;
  metadata: unknown;
  last_heartbeat: string | null;
  created_at: string;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  assigned_agent_id: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'rejected' | 'failed';
  priority: 'low' | 'medium' | 'high';
  created_by: string;
  result_summary?: string | null;
  audit_markdown?: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskStep = {
  id: string;
  task_id: string;
  step_index: number;
  role: string;
  agent_name: string | null;
  agent_id: string | null;
  status: 'pending' | 'ready' | 'running' | 'awaiting_approval' | 'approved' | 'done' | 'rejected' | 'failed';
  requires_approval: boolean;
  execution_mode: 'real' | 'simulated';
  approved_by: string | null;
  approved_at: string | null;
  input: string | null;
  output: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type Command = {
  id: string;
  agent_id: string;
  command_type: 'restart' | 'redeploy' | 'run_diagnostic' | 'custom';
  payload: Record<string, unknown>;
  status: 'pending' | 'sent' | 'acknowledged' | 'failed';
  issued_by: string;
  created_at: string;
  executed_at: string | null;
};

export type DispatchMessage = {
  id: string;
  from_agent_id: string;
  to_agent_id: string | null;
  task_id: string | null;
  content: string;
  type: 'request' | 'response' | 'log' | 'error';
  created_at: string;
};

export type SecurityIncident = {
  id: string;
  agent_id: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string | null;
  status: 'open' | 'investigating' | 'resolved';
  detected_by: 'manual' | 'automatic';
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
};
