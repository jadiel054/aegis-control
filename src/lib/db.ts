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
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  priority: 'low' | 'medium' | 'high';
  created_by: string;
  created_at: string;
  updated_at: string;
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
