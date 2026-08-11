-- =========================================================================
-- AEGIS CONTROL DATABASE MIGRATION & SEED
-- =========================================================================

-- 1. Create table 'agents'
CREATE TABLE IF NOT EXISTS public.agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error')),
    webhook_url TEXT,
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create table 'tasks'
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    assigned_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'failed')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    created_by TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create table 'commands'
CREATE TABLE IF NOT EXISTS public.commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    command_type TEXT NOT NULL CHECK (command_type IN ('restart', 'redeploy', 'run_diagnostic', 'custom')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'acknowledged', 'failed')),
    issued_by TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    executed_at TIMESTAMP WITH TIME ZONE
);

-- 4. Create table 'messages'
-- 4. Create table 'agent_dispatch_messages'
CREATE TABLE IF NOT EXISTS public.agent_dispatch_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    to_agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('request', 'response', 'log', 'error')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create table 'security_incidents'
CREATE TABLE IF NOT EXISTS public.security_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved')),
    detected_by TEXT NOT NULL DEFAULT 'manual' CHECK (detected_by IN ('manual', 'automatic')),
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- 6. Create table 'test_runs'
CREATE TABLE IF NOT EXISTS public.test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    test_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'passed', 'failed')),
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    logs TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS (Row Level Security) on all tables (if required, but since this is an administrative board and simple config,
-- we'll set policies or keep them simple so that authenticated and anon keys can operate. Or disable RLS for direct ease of access if allowed.
-- Usually, in administrative tools, we can keep it open or write standard permissive RLS policies.
-- Let's write permissive policies so standard queries work without blocking, but if needed, they are secure under Auth.)
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_dispatch_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;

-- Permissive policies for authenticated users and anon for heartbeat/webhook endpoints
CREATE POLICY "Allow all public read/write to agents" ON public.agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all public read/write to tasks" ON public.tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all public read/write to commands" ON public.commands FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all public read/write to agent_dispatch_messages" ON public.agent_dispatch_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all public read/write to security_incidents" ON public.security_incidents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all public read/write to test_runs" ON public.test_runs FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime publication
BEGIN;
  -- Remove tables if they are already in the publication to avoid errors
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.agents;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.tasks;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.commands;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.agent_dispatch_messages;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.security_incidents;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.test_runs;

  -- Add tables to the publication
  ALTER PUBLICATION supabase_realtime ADD TABLE public.agents;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.commands;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_dispatch_messages;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.security_incidents;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.test_runs;
COMMIT;

-- Seed initial agents
INSERT INTO public.agents (name, role, status, webhook_url, last_heartbeat)
VALUES
  ('Jarvis', 'orchestrator', 'offline', 'https://jarvis-nexus-app.vercel.app/api/agent', CURRENT_TIMESTAMP),
  ('Morpheus', 'coordinator', 'offline', 'https://morpheus-app-5bmx.onrender.com/api/agent', CURRENT_TIMESTAMP),
  ('Zarith', 'engineer', 'offline', 'https://zarith-api-server.onrender.com/api/agent', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
