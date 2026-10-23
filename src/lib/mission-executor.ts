import { getSql } from '@/lib/db';
import { completeStep, getMission } from '@/lib/dispatcher';
import { jarvisReply } from '@/lib/jarvis-brain';

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
  let output = '';

  try {
    if (step.role === 'orchestrator' || /morpheus/i.test(agentLabel)) {
      const brain = await jarvisReply({
        userText: [
          `Você é o agente ${agentLabel} (orquestrador) numa missão Aegis.`,
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
      // Worker steps usually need approval before destructive work
      output = [
        `Proposta de execução (${agentLabel}):`,
        `- Missão: ${mission.task.title}`,
        `- Entrada do orquestrador:`,
        input.slice(0, 1500),
        '',
        'Ações pretendidas (simulação segura — sem write real ainda):',
        '1. Validar contexto no Aegis',
        '2. Preparar mudanças / comandos',
        '3. Aguardar write-gate do operador',
        '',
        'Status: pronto para aprovação.',
      ].join('\n');
    } else {
      const brain = await jarvisReply({
        userText: [
          `Você é ${agentLabel} (síntese / relatório final).`,
          `Missão: ${mission.task.title}`,
          `Material acumulado:`,
          input.slice(0, 3000),
          '',
          'Escreva um resumo final em português: o que foi feito, onde parou, próximos passos.',
        ].join('\n'),
      });
      output =
        brain?.text ||
        `Síntese (${agentLabel}): missão "${mission.task.title}" processada. Material recebido e consolidado.`;
    }
  } catch (e: any) {
    output = `Execução parcial (${agentLabel}): ${e.message}\n\nContexto: ${input.slice(0, 500)}`;
  }

  // completeStep handles approval gate + handoff
  const result = await completeStep({
    taskId,
    stepIndex: idx,
    output,
    agentName: agentLabel,
  });

  return result;
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
