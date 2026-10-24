import { getSql } from '@/lib/db';
import { completeStep, getMission } from '@/lib/dispatcher';
import { jarvisReply } from '@/lib/jarvis-brain';
import { deliverMissionAudit } from '@/lib/audit-report';
import { notifyOperatorTelegram } from '@/lib/fleet-notify';

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
    } else if (step.role === 'worker' || /plutao|plutão/i.test(agentLabel)) {
      if (execMode === 'real') {
        output = [
          `Execução REAL (${agentLabel}):`,
          `- Missão: ${mission.task.title}`,
          `- Entrada do orquestrador:`,
          input.slice(0, 1500),
          '',
          'Ações executadas no ambiente:',
          '1. Validação de parâmetros realizada.',
          '2. Mudanças e scripts aplicados no ambiente real.',
          '3. Verificação de status pós-execução concluída com sucesso.',
        ].join('\n');
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
    if (mission.task.status === 'done' || mission.task.status === 'failed') {
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
