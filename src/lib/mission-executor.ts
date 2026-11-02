import { getSql } from '@/lib/db';
import { completeStep, getMission } from '@/lib/dispatcher';
import { jarvisReply } from '@/lib/jarvis-brain';
import { deliverMissionAudit } from '@/lib/audit-report';
import { notifyOperatorTelegram } from '@/lib/fleet-notify';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callAgentWithResilience(
  baseUrl: string,
  payload: Record<string, unknown>,
  agentName: string
): Promise<Record<string, unknown>> {
  const apiKey = process.env.AEGIS_API_KEY;
  if (!apiKey) {
    throw new Error('AEGIS_API_KEY não está definida nas variáveis de ambiente.');
  }

  try {
    const healthController = new AbortController();
    const healthTimeout = setTimeout(() => healthController.abort(), 10000);
    const paths = ['/api/health', '/api/healthz', '/health'];
    await Promise.any(
      paths.map(async (path) => {
        const r = await fetch(`${baseUrl}${path}`, {
          method: 'GET',
          signal: healthController.signal,
        });
        if (!r.ok) throw new Error(String(r.status));
        return r;
      })
    ).catch(() => {});
    clearTimeout(healthTimeout);
  } catch {
    /* ignore */
  }

  const timeoutMs = Number(process.env.AGENT_TIMEOUT_MS) || 60000;
  const maxAttempts = 3;
  const backoffDelays = [2000, 5000];
  const attemptLogs: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/api/agent/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        const is4xx = response.status >= 400 && response.status < 500;
        const errDetail = `${agentName} API retornou HTTP ${response.status}`;
        attemptLogs.push(`Tentativa ${attempt}/${maxAttempts}: ${errDetail}`);

        if (is4xx) {
          throw new Error(
            `Falha na chamada para ${agentName} (${errDetail}).\n` +
              attemptLogs.join('\n')
          );
        }

        throw new Error(errDetail);
      }

      const data = (await response.json()) as Record<string, unknown>;
      return data;
    } catch (err: unknown) {
      clearTimeout(timer);
      const e = err as { name?: string; message?: string };
      const isAbort = e.name === 'AbortError';
      const errMsg = isAbort
        ? `Timeout de ${timeoutMs}ms excedido`
        : e.message || String(err);

      if (!attemptLogs.some((log) => log.includes(`Tentativa ${attempt}/`))) {
        attemptLogs.push(`Tentativa ${attempt}/${maxAttempts}: ${errMsg}`);
      }

      if (e.message && e.message.startsWith(`Falha na chamada para ${agentName}`)) {
        throw err;
      }

      if (attempt === maxAttempts) {
        throw new Error(
          `Falha na chamada para ${agentName} após ${maxAttempts} tentativas.\n` +
            attemptLogs.join('\n')
        );
      }

      const backoff = backoffDelays[attempt - 1] || 5000;
      await delay(backoff);
    }
  }

  throw new Error(`Falha na chamada para ${agentName}`);
}

async function llmFallback(prompt: string): Promise<string> {
  const reply = await jarvisReply({ userText: prompt });
  return reply?.text || prompt;
}

export async function executeReadyStep(taskId: string, stepIndex?: number) {
  const mission = await getMission(taskId);
  if (!mission) throw new Error('Mission not found');

  const idx = stepIndex ?? Number(mission.task.current_step ?? 0);
  const step = mission.steps.find((s: { step_index: number }) => s.step_index === idx);
  if (!step) throw new Error('Step not found');

  if (step.status === 'awaiting_approval') {
    return { status: 'awaiting_approval', message: 'Precisa /approve' };
  }
  if (step.status === 'done') {
    return { status: 'done', message: 'Passo já concluído' };
  }
  if (step.status === 'pending' && idx > 0) {
    return { status: 'pending', message: 'Aguardando handoff anterior' };
  }
  // ready | approved | running ok to execute

  const sql = getSql();
  const wasApproved = step.status === 'approved';
  await sql`
    UPDATE task_steps SET status = 'running', started_at = COALESCE(started_at, NOW())
    WHERE id = ${step.id}
  `;

  const input =
    step.input ||
    mission.task.description ||
    mission.task.title ||
    '';

  const agentLabel = String(step.agent_name || step.role);
  const execMode = step.execution_mode || 'real';
  let output = '';

  try {
    if (step.role === 'orchestrator' || /morpheus/i.test(agentLabel)) {
      if (execMode === 'real') {
        const morpheusUrl = process.env.MORPHEUS_API_URL || 'https://morpheus-app-5bmx.onrender.com';
        const data = await callAgentWithResilience(
          morpheusUrl,
          {
            task_id: taskId,
            step_index: idx,
            input,
            command: 'plan_real_mission',
            mission_title: mission.task.title,
            mission_description: mission.task.description,
            mission_context: mission.task.description,
          },
          'Morpheus'
        );
        output = String(data.output || data.plan || JSON.stringify(data));
      } else {
        output = await llmFallback(
          `Planeje a missão "${mission.task.title}": ${input}`
        );
      }
    } else if (step.role === 'worker' || /plut[aã]o/i.test(agentLabel)) {
      if (execMode === 'real') {
        const plutaoUrl = process.env.PLUTAO_API_URL || 'https://plutao-os.vercel.app';
        const payload: Record<string, unknown> = {
          task_id: taskId,
          step_index: idx,
          input,
          command: 'execute_real',
          mission_title: mission.task.title,
          mission_context: input,
        };
        // After operator write-gate: allow real MCP/connector writes on Plutão
        if (wasApproved || step.approved_by) {
          payload.approved = true;
          payload.approved_by = step.approved_by || 'operator';
          payload.gate = 'approved';
        }
        const data = await callAgentWithResilience(plutaoUrl, payload, 'Plutao');
        output = String(data.output || JSON.stringify(data));
        if (!wasApproved && (data.gated || data.status === 'awaiting_approval')) {
          await sql`
            UPDATE task_steps
            SET status = 'awaiting_approval', output = ${output}, finished_at = NOW()
            WHERE id = ${step.id}
          `;
          await notifyOperatorTelegram({
            kind: 'need_confirm',
            agentName: agentLabel,
            title: mission.task.title,
            detail: output.slice(0, 1500),
            taskId,
          }).catch(() => {});
          return { status: 'awaiting_approval', output };
        }
      } else {
        output = await llmFallback(`Execute o passo worker: ${input}`);
      }
    } else if (/zarith/i.test(agentLabel) || step.role === 'llm_agent' || step.role === 'synthesizer') {
      if (execMode === 'real') {
        const zarithUrl = process.env.ZARITH_API_URL || 'https://zarith-api.onrender.com';
        const prev = mission.steps
          .filter((s: { step_index: number; output?: string }) => s.step_index < idx && s.output)
          .map((s: { agent_name?: string; role?: string; output?: string }) =>
            `### ${s.agent_name || s.role}\n${s.output}`
          )
          .join('\n\n');
        const data = await callAgentWithResilience(
          zarithUrl,
          {
            task_id: taskId,
            step_index: idx,
            input,
            command: 'synthesize_real',
            mission_title: mission.task.title,
            previous_steps: prev,
            mission_context: prev || input,
          },
          'Zarith'
        );
        output = String(data.output || data.synthesis || JSON.stringify(data));
      } else {
        output = await llmFallback(`Sintetize resultados: ${input}`);
      }
    } else {
      output = await llmFallback(`Execute passo ${agentLabel}: ${input}`);
    }

    await completeStep({ taskId, stepIndex: idx, output, agentName: agentLabel });
    return { status: 'done', output };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await sql`
      UPDATE task_steps SET status = 'failed', output = ${msg}, finished_at = NOW()
      WHERE id = ${step.id}
    `;
    await notifyOperatorTelegram({
      kind: 'failed',
      agentName: agentLabel,
      title: mission.task.title,
      detail: msg,
      taskId,
    }).catch(() => {});
    throw err;
  }
}

export async function advanceMission(taskId: string) {
  const logs: string[] = [];
  for (let i = 0; i < 8; i++) {
    const mission = await getMission(taskId);
    if (!mission) throw new Error('Mission not found');
    const idx = Number(mission.task.current_step ?? 0);
    const step = mission.steps.find((s: { step_index: number }) => s.step_index === idx);
    if (!step) break;
    if (step.status === 'awaiting_approval') {
      logs.push(`step ${idx}: awaiting_approval`);
      break;
    }
    if (step.status === 'done') {
      logs.push(`step ${idx}: already done`);
      break;
    }
    if (step.status === 'pending' && idx > 0) {
      logs.push(`step ${idx}: pending`);
      break;
    }
    logs.push(`step ${idx}: executing ${step.agent_name || step.role} (${step.status})`);
    const r = await executeReadyStep(taskId, idx);
    logs.push(`step ${idx}: ${r.status}`);
    if (r.status === 'awaiting_approval') break;

    const after = await getMission(taskId);
    if (!after) break;
    if (after.task?.status === 'done' || after.task?.status === 'completed') break;
    const next = after.steps?.find((s: { step_index: number }) => s.step_index === idx + 1);
    if (!next) break;
  }
  try {
    await deliverMissionAudit(taskId);
  } catch {
    /* optional */
  }
  return { logs, mission: await getMission(taskId) };
}
