import { getSql } from '@/lib/db';
import { notifyOperatorTelegram } from '@/lib/fleet-notify';

/** Default pipeline roles — not every agent, only specialists needed */
export const DEFAULT_PIPELINE = [
  { role: 'orchestrator', agentHint: 'Morpheus', requires_approval: false },
  { role: 'worker', agentHint: 'Plutao', requires_approval: true },
  { role: 'llm_agent', agentHint: 'Zarith', requires_approval: false },
] as const;

export type CreateMissionInput = {
  title: string;
  description?: string;
  source?: string;
  created_by?: string;
  priority?: string;
  pipeline?: Array<{ role: string; agentHint?: string; requires_approval?: boolean }>;
};

async function resolveAgent(hint: string | undefined, role: string) {
  const sql = getSql();
  if (hint) {
    const byName = await sql`
      SELECT id, name, status FROM agents WHERE LOWER(name) = LOWER(${hint}) LIMIT 1
    `;
    if (byName[0]) return byName[0];
  }
  const byRole = await sql`
    SELECT id, name, status FROM agents
    WHERE agent_type = ${role} OR role = ${role}
    ORDER BY last_heartbeat DESC NULLS LAST
    LIMIT 1
  `;
  return byRole[0] || null;
}

export async function createMission(input: CreateMissionInput) {
  const sql = getSql();
  const pipeline = input.pipeline || [...DEFAULT_PIPELINE];
  const plan = pipeline.map((p, i) => ({
    step: i,
    role: p.role,
    agentHint: p.agentHint || null,
    requires_approval: Boolean(p.requires_approval),
  }));

  const tasks = await sql`
    INSERT INTO tasks (title, description, status, priority, created_by, source, plan, current_step)
    VALUES (
      ${input.title},
      ${input.description || null},
      'pending',
      ${input.priority || 'medium'},
      ${input.created_by || 'system'},
      ${input.source || 'api'},
      ${JSON.stringify(plan)}::jsonb,
      0
    )
    RETURNING *
  `;
  const task = tasks[0];

  for (let i = 0; i < pipeline.length; i++) {
    const step = pipeline[i];
    const agent = await resolveAgent(step.agentHint, step.role);
    await sql`
      INSERT INTO task_steps (
        task_id, step_index, role, agent_name, agent_id, status, requires_approval, input
      ) VALUES (
        ${task.id},
        ${i},
        ${step.role},
        ${agent?.name || step.agentHint || null},
        ${agent?.id || null},
        ${i === 0 ? 'ready' : 'pending'},
        ${Boolean(step.requires_approval)},
        ${i === 0 ? input.description || input.title : null}
      )
    `;
  }

  // Assign first agent on task
  const first = await sql`
    SELECT * FROM task_steps WHERE task_id = ${task.id} AND step_index = 0 LIMIT 1
  `;
  if (first[0]?.agent_id) {
    await sql`
      UPDATE tasks SET assigned_agent_id = ${first[0].agent_id}, status = 'in_progress', updated_at = NOW()
      WHERE id = ${task.id}
    `;
  }

  await notifyOperatorTelegram({
    kind: 'progress',
    agentName: 'Aegis Dispatcher',
    title: 'Nova missão',
    detail: `${input.title}\nFonte: ${input.source || 'api'}\nPassos: ${pipeline.map((p) => p.agentHint || p.role).join(' → ')}`,
    taskId: task.id,
  }).catch(() => {});

  return { task, steps: await listSteps(task.id) };
}

export async function listSteps(taskId: string) {
  const sql = getSql();
  return sql`SELECT * FROM task_steps WHERE task_id = ${taskId} ORDER BY step_index`;
}

export async function getMission(taskId: string) {
  const sql = getSql();
  const tasks = await sql`SELECT * FROM tasks WHERE id = ${taskId} LIMIT 1`;
  if (!tasks[0]) return null;
  const steps = await listSteps(taskId);
  return { task: tasks[0], steps };
}

/** Agent reports output for current step; optionally advance */
export async function completeStep(opts: {
  taskId: string;
  stepIndex?: number;
  output: string;
  agentName?: string;
}) {
  const sql = getSql();
  const mission = await getMission(opts.taskId);
  if (!mission) throw new Error('Task not found');

  const idx = opts.stepIndex ?? mission.task.current_step ?? 0;
  const step = mission.steps.find((s: any) => s.step_index === idx);
  if (!step) throw new Error('Step not found');

  if (step.requires_approval && step.status !== 'approved' && step.status !== 'running') {
    await sql`
      UPDATE task_steps SET status = 'awaiting_approval', output = ${opts.output}, started_at = COALESCE(started_at, NOW())
      WHERE id = ${step.id}
    `;
    await notifyOperatorTelegram({
      kind: 'need_confirm',
      agentName: step.agent_name || opts.agentName,
      title: 'Aprovação necessária',
      detail: `Tarefa: ${mission.task.title}\nPasso ${idx} (${step.role})\n\n${opts.output.slice(0, 800)}\n\nResponda: /approve ${opts.taskId} ou /reject ${opts.taskId}`,
      taskId: opts.taskId,
    }).catch(() => {});
    return { status: 'awaiting_approval', mission: await getMission(opts.taskId) };
  }

  await sql`
    UPDATE task_steps SET status = 'done', output = ${opts.output}, finished_at = NOW()
    WHERE id = ${step.id}
  `;

  const nextIdx = idx + 1;
  const next = mission.steps.find((s: any) => s.step_index === nextIdx);

  if (!next) {
    await sql`
      UPDATE tasks SET status = 'done', result_summary = ${opts.output}, current_step = ${idx}, updated_at = NOW()
      WHERE id = ${opts.taskId}
    `;
    await notifyOperatorTelegram({
      kind: 'completed',
      agentName: 'Aegis Dispatcher',
      title: 'Missão concluída',
      detail: `${mission.task.title}\n\n${opts.output.slice(0, 1000)}`,
      taskId: opts.taskId,
    }).catch(() => {});
    return { status: 'done', mission: await getMission(opts.taskId) };
  }

  // Handoff: pass previous output as next input
  await sql`
    UPDATE task_steps SET status = 'ready', input = ${opts.output}, started_at = NOW()
    WHERE id = ${next.id}
  `;
  await sql`
    UPDATE tasks SET current_step = ${nextIdx}, assigned_agent_id = ${next.agent_id}, status = 'in_progress', updated_at = NOW()
    WHERE id = ${opts.taskId}
  `;

  await notifyOperatorTelegram({
    kind: 'progress',
    agentName: next.agent_name || 'next',
    title: 'Handoff',
    detail: `${mission.task.title}: ${step.agent_name || step.role} → ${next.agent_name || next.role}`,
    taskId: opts.taskId,
  }).catch(() => {});

  return { status: 'handed_off', nextStep: nextIdx, mission: await getMission(opts.taskId) };
}

export async function approveStep(taskId: string, approvedBy: string) {
  const sql = getSql();
  const mission = await getMission(taskId);
  if (!mission) throw new Error('Task not found');
  const idx = mission.task.current_step ?? 0;
  const step = mission.steps.find((s: any) => s.step_index === idx);
  if (!step) throw new Error('Step not found');

  await sql`
    UPDATE task_steps SET status = 'approved', approved_at = NOW(), approved_by = ${approvedBy}
    WHERE id = ${step.id}
  `;

  // Complete with existing output to advance pipeline
  return completeStep({
    taskId,
    stepIndex: idx,
    output: step.output || 'Aprovado pelo operador',
    agentName: step.agent_name,
  });
}

export async function rejectStep(taskId: string, reason: string, by: string) {
  const sql = getSql();
  const mission = await getMission(taskId);
  if (!mission) throw new Error('Task not found');
  const idx = mission.task.current_step ?? 0;
  const step = mission.steps.find((s: any) => s.step_index === idx);
  if (step) {
    await sql`
      UPDATE task_steps SET status = 'rejected', output = ${reason}, finished_at = NOW(), approved_by = ${by}
      WHERE id = ${step.id}
    `;
  }
  await sql`
    UPDATE tasks SET status = 'failed', result_summary = ${reason}, updated_at = NOW()
    WHERE id = ${taskId}
  `;
  await notifyOperatorTelegram({
    kind: 'failed',
    title: 'Missão rejeitada',
    detail: reason,
    taskId,
  }).catch(() => {});
  return getMission(taskId);
}
