import test from 'node:test';
import assert from 'node:assert/strict';

interface AgentTarget {
  name: string;
  urlEnv: string;
  command: string;
}

const AGENTS: AgentTarget[] = [
  {
    name: 'Morpheus',
    urlEnv: 'MORPHEUS_API_URL',
    command: 'plan_real_mission',
  },
  {
    name: 'Plutão',
    urlEnv: 'PLUTAO_API_URL',
    command: 'execute_real',
  },
  {
    name: 'Zarith',
    urlEnv: 'ZARITH_API_URL',
    command: 'synthesize_real',
  },
];

for (const agent of AGENTS) {
  test(`Contract test for ${agent.name} /api/agent/execute`, async (t) => {
    const url = process.env[agent.urlEnv];
    if (!url) {
      t.skip(`Variável de ambiente ${agent.urlEnv} não definida.`);
      return;
    }

    const apiKey = process.env.AEGIS_API_KEY || 'test-key';
    const endpoint = `${url.replace(/\/$/, '')}/api/agent/execute`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          task_id: 'contract-test',
          step_index: 0,
          command: agent.command,
          input: 'Ping de teste de contrato',
        }),
      });
    } catch (err: any) {
      assert.fail(`Erro de rede ao conectar com ${agent.name} em ${endpoint}: ${err.message}`);
    }

    if (response.status === 404) {
      assert.fail(
        `Rota não encontrada (HTTP 404) ao enviar ping para ${agent.name} no endpoint: ${endpoint}`
      );
    }

    assert.equal(
      response.status,
      200,
      `Esperado HTTP 200 de ${agent.name} (${endpoint}), recebido HTTP ${response.status}`
    );

    const body = await response.json().catch(() => null);
    assert.ok(body, `Resposta de ${agent.name} não é um JSON válido`);
    assert.equal(
      typeof body.success,
      'boolean',
      `Resposta de ${agent.name} deve conter a propriedade boolean 'success'`
    );
    assert.equal(
      typeof body.output,
      'string',
      `Resposta de ${agent.name} deve conter a propriedade string 'output'`
    );
  });
}
