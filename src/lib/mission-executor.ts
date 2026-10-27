import { getSql } from '@/lib/db';
import { completeStep, getMission } from '@/lib/dispatcher';
import { jarvisReply } from '@/lib/jarvis-brain';
import { deliverMissionAudit } from '@/lib/audit-report';
import { notifyOperatorTelegram } from '@/lib/fleet-notify';

/**
 * Executes a ready step on behalf of the assigned agent (bootstrap runner).
 * Real workers can replace this later by polling task_steps themselves.
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callAgentWithResilience(
  baseUrl: string,
  payload: Record<string, any>,
  agentName: string
): Promise<any> {
  const apiKey = process.env.AEGIS_API_KEY;
  if (!apiKey) {
    throw new Error('AEGIS_API_KEY não está definida nas variáveis de ambiente.');
  }

  // 1. Best-effort GET /api/health with 10s timeout to wake free-tier services
  try {
    const healthController = new AbortController();
    const healthTimeout = setTimeout(() => healthController.abort(), 10000);
    await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      signal: healthController.signal,
    }).catch(() => {});
    clearTimeout(healthTimeout);
  } catch {
    // Ignore health check failures
  }

  // 2. Call /api/agent/execute with timeout and retries
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
          // Do not retry 4xx errors
          throw new Error(
            `Falha na chamada para ${agentName} (${errDetail}).\n` +
              attemptLogs.join('\n')
          );
        }

        // 5xx error: throw to trigger retry if attempts remain
        throw new Error(errDetail);
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      clearTimeout(timer);
      const isAbort = err.name === 'AbortError';
      const errMsg = isAbort
        ? `Timeout de ${timeoutMs}ms excedido`
        : err.message || String(err);

      if (!attemptLogs.some((log) => log.includes(`Tentativa ${attempt}/`))) {
        attemptLogs.push(`Tentativa ${attempt}/${maxAttempts}: ${errMsg}`);
      }

      // If error is 4xx (non-retryable error rethrown above), stop immediately
      if (err.message && err.message.startsWith(`Falha na chamada para ${agentName}`)) {
        throw err;
      }

      // If attempts exhausted, fail
      if (attempt === maxAttempts) {
        throw new Error(
          `Falha na chamada para ${agentName} após ${maxAttempts} tentativas.\n` +
            attemptLogs.join('\n')
        );
      }

      // Wait backoff delay before retry
      const backoff = backoffDelays[attempt - 1] || 5000;
      await delay(backoff);
    }
  }
}

/**
 * Executes a ready step on behalf of the assigned agent (bootstrap runner).
 * Real workers can replace this later by polling task_steps themselves.
 */
export async function executeReadyStep(taskId: string, stepIndex?: number) {
  const mission = await getMission(taskId);
  if (!mission) throw new Error('Mission not found');

  const idx = stepIndex ?? Number(mission.task.current_step ?? 0);
  const step = mission.steps.find((s: any) => s.step_index === idx);
  if (!step) throw new Error('Step not found');

  if (step.status === 'awaiting_approval') {
    return { status: 'awaiting_approval', message: 'Precisa /approve' };
  }
  if (step.status === 'done') {
    return { status: 'done', message: 'Passo já concluído' };
  }
  if (step.status === 'failed' || step.status === 'rejected') {
    return { status: step.status, message: `Passo em estado terminal: ${step.status}` };
  }
  if (!['ready', 'approved', 'running', 'pending'].includes(step.status) && idx === 0) {
    // allow first step
  }
  if (step.status === 'pending' && idx > 0) {
    return { status: 'pending', message: 'Aguardando handoff anterior' };
  }

  const sql = getSql();
  await sql`
    UPDATE task_steps SET status = 'running', started_at = COALESCE(started_at, NOW())
    WHERE id = ${step.id}
  `;

  const input =
    step.input ||
    mission.task.description ||
    mission.task.title ||
    '';

  const agentLabel = step.agent_name || step.role;
  const execMode = step.execution_mode || 'simulated';
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
            input: input,
            command: 'plan_real_mission',
            mission_title: mission.task.title,
            mission_description: mission.task.description,
          },
          'Morpheus'
        );
        output = data.output || data.plan || `Plano REAL gerado pelo Morpheus para: ${mission.task.title}`;
      } else {
        const brain = await jarvisReply({
          userText: [
            `Você é o agente ${agentLabel} (orquestrador) numa missão Aegis.`,
            `Modo de execução do passo: ${execMode.toUpperCase()}.`,
            `Tarefa: ${mission.task.title}`,
            `Descrição: ${input}`,
            '',
            'Produza um PLANO curto em português:',
            '1) objetivo',
            '2) passos técnicos',
            '3) riscos',
            '4) o que o worker (Plutão) deve executar',
            '5) o que a síntese (Zarith) deve entregar no fim',
            'Seja objetivo (Telegram).',
          ].join('\n'),
        });
        output =
          brain?.text ||
          `Plano bootstrap (${agentLabel}): analisar "${mission.task.title}" e preparar execução para o worker.`;
      }
    } else if (step.role === 'worker' || /plutao|plutão/i.test(agentLabel)) {
      if (execMode === 'real') {
        // Call Plutao API for real execution
        const plutaoUrl = process.env.PLUTAO_API_URL || 'https://plutao-os.vercel.app';
        const data = await callAgentWithResilience(
          plutaoUrl,
          {
            task_id: taskId,
            step_index: idx,
            input: input,
            command: 'execute_real',
            mission_title: mission.task.title,
            mission_context: mission.task.description,
          },
          'Plutão'
        );
        output = data.output || data.result || `Execução REAL concluída pelo Plutão para: ${mission.task.title}`;
      } else {
        output = [
          `Proposta de execução SIMULADA (${agentLabel}):`,
          `- Missão: ${mission.task.title}`,
          `- Entrada do orquestrador:`,
          input.slice(0, 1500),
          '',
          'Ações pretendidas (simulação segura — sem write real):',
          '1. Validar contexto no Aegis',
          '2. Preparar mudanças / comandos',
          '3. Aguardar write-gate do operador',
          '',
          'Status: simulação concluída, pronto para aprovação.',
        ].join('\n');
      }
    } else {
      // Zarith / synthesis step
      if (execMode === 'real') {
        const zarithUrl = process.env.ZARITH_API_URL || 'https://zarith-api-server.onrender.com';
        const previousStepsContext = mission.steps
          .filter((s: any) => s.step_index < idx)
          .map(
            (s: any) =>
              `Passo ${s.step_index} [${s.agent_name || s.role}] (${(s.execution_mode || 'simulated').toUpperCase()}): ${s.output || '(sem output)'}`
          )
          .join('\n---\n');

        const data = await callAgentWithResilience(
          zarithUrl,
          {
            task_id: taskId,
            step_index: idx,
            input: input,
            command: 'synthesize_real',
            mission_title: mission.task.title,
            previous_steps: previousStepsContext,
          },
          'Zarith'
        );
        output = data.output || data.synthesis || `Síntese REAL gerada pelo Zarith para: ${mission.task.title}`;
      } else {
        const previousStepsContext = mission.steps
          .filter((s: any) => s.step_index < idx)
          .map(
            (s: any) =>
              `Passo ${s.step_index} [${s.agent_name || s.role}] (${(s.execution_mode || 'simulated').toUpperCase()}): ${s.output || '(sem output)'}`
          )
          .join('\n---\n');

        const brain = await jarvisReply({
          userText: [
            `Você é ${agentLabel} (síntese / relatório final da missão).`,
            `REGRA ABSOLUTA: Resuma SOMENTE o que foi registrado nos outputs dos passos anteriores. É ESTRITAMENTE PROIBIDO afirmar qualquer ação, gravação, script ou alteração que não esteja explicitamente descrita nos outputs fornecidos abaixo.`,
            `Missão: ${mission.task.title}`,
            `Histórico real de execução dos passos anteriores:`,
            previousStepsContext.slice(0, 4000),
            '',
            'Escreva uma síntese objetiva em português baseada EXCLUSIVAMENTE nos fatos acima, indicando o modo de execução (REAL ou SIMULADO) de cada passo.',
          ].join('\n'),
        });
        output =
          brain?.text ||
          `Síntese (${agentLabel}): missão "${mission.task.title}" processada. Resumo baseado exclusivamente no histórico registrado dos passos anteriores.`;
      }
    }

    // completeStep handles approval gate + handoff
    const result = await completeStep({
      taskId,
      stepIndex: idx,
      output,
      agentName: agentLabel,
    });

    return result;
  } catch (error: any) {
    const errorMsg = `Erro no passo ${idx} (${agentLabel}): ${error?.message || String(error)}`;
    console.error('[mission-executor]', errorMsg, error);

    await sql`
      UPDATE task_steps SET status = 'failed', output = ${errorMsg}, finished_at = NOW()
      WHERE id = ${step.id}
    `;
    await sql`
      UPDATE tasks SET status = 'failed', result_summary = ${errorMsg}, updated_at = NOW()
      WHERE id = ${taskId}
    `;

    await notifyOperatorTelegram({
      kind: 'failed',
      title: 'Falha na missão',
      detail: errorMsg,
      taskId,
    }).catch(() => {});

    // Deliver audit report on failure terminal state
    await deliverMissionAudit(taskId).catch((e) =>
      console.error('[audit-failed]', e)
    );

    return { status: 'failed', error: errorMsg, mission: await getMission(taskId) };
  }
}

/** Run all consecutive auto steps until gate or done */
export async function advanceMission(taskId: string, maxHops = 5) {
  const logs: unknown[] = [];
  for (let i = 0; i < maxHops; i++) {
    const mission = await getMission(taskId);
    if (!mission) break;
    if (
      mission.task.status === 'done' ||
      mission.task.status === 'failed' ||
      mission.task.status === 'rejected'
    ) {
      logs.push({ stop: mission.task.status });
      break;
    }
    const idx = Number(mission.task.current_step ?? 0);
    const step = mission.steps.find((s: any) => s.step_index === idx);
    if (!step) break;
    if (step.status === 'awaiting_approval') {
      logs.push({ stop: 'awaiting_approval', step: idx });
      break;
    }
    if (step.status === 'done') break;

    const r = await executeReadyStep(taskId, idx);
    logs.push(r);
    if (r.status === 'awaiting_approval' || r.status === 'done') break;
  }
  return { logs, mission: await getMission(taskId) };
}
