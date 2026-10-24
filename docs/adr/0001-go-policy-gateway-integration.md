# ADR 0001: Integração do policy gateway Go com Aegis Control

- **Status:** Proposta — requer confirmação do consumidor gRPC e do destino operacional antes de ativar tráfego.
- **Data:** 2026-10-24
- **Contexto:** PR #9 adicionou `pkg/cache` e `pkg/gateway`, mas o repositório atual é um aplicativo Next.js implantado no Vercel. Não há servidor gRPC, entrypoint Go, cliente do gateway nem chamadas de produção para esses pacotes.

## Problema

A worker pool e o cache Go são estado em memória de longa duração. Colocá-los dentro de uma função serverless Next.js criaria instâncias e caches independentes, sem garantia de persistência ou coordenação. Por outro lado, operar um serviço Go separado sem consumidor gRPC real adicionaria custo e complexidade sem benefício comprovado.

## Decisão proposta

1. Manter Next.js como plano de controle: painel, autenticação de operadores, APIs de administração e persistência das políticas no Neon.
2. Não importar nem tentar executar a worker pool Go dentro das rotas serverless do Next.js.
3. Se houver um consumidor que realmente precise de gRPC, executar o gateway como serviço Go persistente separado. O serviço deverá ter entrypoint próprio, servidor/protobuf, health checks, configuração de workers e deployment independente. Nenhum provedor de hospedagem é escolhido por esta ADR.
4. Para sincronização inicial, preferir snapshots de política versionados fornecidos por uma interface interna autenticada do plano de controle, em vez de distribuir credenciais amplas do Neon ao serviço Go. A frequência de atualização e mecanismo para revogações urgentes deverão ser definidos por requisito de latência.
5. Se nenhum consumidor gRPC for identificado, não ativar nem operar o serviço Go; decidir se a autorização deve ser implementada no runtime TypeScript atual e manter o pacote Go como protótipo até essa decisão.
6. Não encaminhar tráfego de produção ao gateway até que o contrato de validade da política offline, autenticação serviço-a-serviço, observabilidade e rollback estejam definidos.

Esta ADR é uma proposta para revisão. Ela não afirma que a integração já existe nem seleciona a hospedagem final.

## Fluxo proposto se o serviço Go for adotado

```text
Operador / agente
      │ HTTPS
      ▼
Next.js — plano de controle
      ├── autentica e audita mudanças
      ├── persiste políticas no Neon
      └── expõe snapshot versionado por endpoint interno autenticado
                         │ HTTPS privado / credencial de serviço
                         ▼
Go — serviço persistente de decisão
      ├── valida versão e validade do snapshot
      ├── publica cópia imutável na cache local
      ├── responde ao consumidor por gRPC
      └── expõe health/readiness e métricas operacionais
```

## Contratos que ainda precisam ser aprovados

- **Identidade da decisão:** `tenant_id`, principal, ação e recurso, não apenas um `policy_id` opaco.
- **Resposta:** permitir/negar, motivo, versão da política e instante da avaliação, sem expor detalhes desnecessários ao chamador.
- **Frescor offline:** idade máxima de uma política `Allow`; após o limite ou em ausência de versão confiável, negar por padrão. O limite numérico é decisão de produto/segurança e não é inventado nesta ADR.
- **Atualização:** intervalo de polling e/ou notificação de revogação, com reconciliação para recuperar eventos perdidos.
- **Autenticação:** credencial serviço-a-serviço com rotação, escopo mínimo e armazenamento server-side; separar de API keys de agentes.
- **Operação:** limites de fila, timeouts, política de shutdown, health/readiness, métricas, canário e rollback.

## Alternativas consideradas

### Implementar o gateway diretamente no Next.js/TypeScript

**Vantagens:** menos serviços, sem chamada gRPC adicional, compatível com o deployment atual.
**Desvantagens:** não fornece um serviço gRPC/worker pool persistente; pode ser a escolha correta se o consumidor for apenas o próprio app ou seus endpoints HTTP.

### Integrar a pool Go dentro de uma rota Next.js serverless

**Rejeitada:** não há garantia de processo persistente, estado/cache compartilhados ou lifecycle confiável entre invocações.

### Criar imediatamente um serviço Go sem consumidor identificado

**Adiada:** o código não teria caminho de produção demonstrável e o serviço adicionaria superfície operacional sem requisito confirmado.

## Consequências

- O pacote Go permanece uma biblioteca/fundação até existir entrypoint e consumidor real.
- Uma adoção gRPC exige deployment persistente independente e operação adicional.
- A separação de planos reduz acoplamento entre Vercel/Next.js e o runtime Go, mas exige contrato de snapshots e autenticação entre serviços.
- A implementação de cache/worker pool deve ser endurecida e testada antes da exposição ao tráfego.

## Critérios para encerrar esta ADR

- [ ] Consumidor e protocolo de integração identificados.
- [ ] Escolha entre serviço Go persistente e autorização TypeScript aprovada.
- [ ] Host/runtime e responsável operacional definidos, se Go for escolhido.
- [ ] Contrato de política e janela offline aprovados.
- [ ] Plano de autenticação, observabilidade, canário e rollback aprovado.
