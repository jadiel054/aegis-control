# ADR 0001: Integração do policy gateway Go com Aegis Control

- **Status:** Aceita para a fundação v1; produção continua desabilitada até cumprir os bloqueios listados abaixo.
- **Data:** 2026-10-24
- **Contexto:** A PR #9 adicionou `pkg/cache` e `pkg/gateway`; a PR #10 endureceu esses componentes. O aplicativo Next.js está no Vercel, enquanto o gateway Go precisa de um processo persistente separado.

## Decisões v1

1. Next.js permanece como plano de controle e fonte das políticas no Neon. O serviço Go não recebe credenciais do banco.
2. A tabela `authorization_policies` define regras de correspondência **exata** por `tenant_id`, `principal_id`, `action` e `resource`. Wildcards e herança não fazem parte da v1. A combinação é única; ausência de regra, snapshot ausente/expirado e regra fora da validade resultam em `DENY`.
3. O snapshot é servido por `GET /api/internal/policies/snapshot`, protegido por `AEGIS_GATEWAY_SYNC_SECRET`, separado da API key global de agentes. A revisão é um SHA-256 do conteúdo ordenado. O snapshot vence após 30 segundos por padrão; `AEGIS_POLICY_SNAPSHOT_TTL_SECONDS` permite configurar de 1 a 3600 segundos. O serviço Go consulta a cada 10 segundos por padrão e não autoriza usando snapshot expirado.
4. O primeiro consumidor do RPC no Next.js é somente a rota diagnóstica `POST /api/admin/authorization/evaluate`, protegida por `AEGIS_AUTHORIZATION_DIAGNOSTIC_KEY`, uma credencial server-to-server que nunca vai ao browser. Ela permite validar o contrato, mas **não autoriza operações de agentes**. A identidade enviada nessa rota é fornecida pelo chamador confiável.
5. O servidor gRPC exige TLS com certificado e chave configurados. A autenticação RPC usa `AEGIS_GRPC_API_KEY`, distinta de `AEGIS_API_KEY` e da credencial de sincronização do snapshot. O client Node.js usa a mesma definição Protobuf e credencial server-side.
6. Nenhum servidor é implantado por esta ADR/PR e nenhum tráfego de produção é encaminhado ao gateway. Nenhum provedor de hospedagem é escolhido.

## Fluxo v1 implementado

```text
Caller administrativo confiável
      │ HTTPS + segredo diagnóstico
      ▼
Next.js ─────── Neon.authorization_policies
   │  ▲                 │
   │  │ gRPC/TLS        │ snapshot HTTPS + segredo dedicado
   ▼  │                 ▼
rota diagnóstica      serviço Go persistente
                         ├── valida e publica snapshot imutável
                         ├── avalia correspondência exata
                         └── expõe health/readiness gRPC
```

## Contrato gRPC

O schema está em `api/proto/aegis/authorization/v1/authorization.proto`; o RPC `EvaluateAccess` recebe `request_id`, tenant, principal, ação e recurso. A resposta contém `ALLOW` ou `DENY`, motivo, ID da regra, revisão e instante da decisão. Recusas de política são respostas normais; autenticação inválida e problemas operacionais são erros gRPC. O consumidor deve falhar fechado em qualquer erro RPC.

## Limitações assumidas

- A v1 não inclui UI nem endpoints para criar/editar regras; a migration cria a fonte de dados e nenhum `ALLOW` é inserido automaticamente. A gestão de políticas ainda precisa de um fluxo administrativo auditável.
- O aplicativo atual usa uma API key compartilhada por agentes e tem uma sessão de painel que não é apropriada como controle de acesso para esta nova rota. Portanto, a rota exige segredo server-to-server dedicado e não aceita chamadas de agentes; identidade por agente continua sem prova confiável.
- O TTL padrão de 30 segundos é configurável e conservador para a fundação, mas precisa de aprovação de segurança/produto antes de produção, considerando o impacto de revogações.
- TLS, rotação de segredos, rede privada, métricas operacionais, canário e rollback precisam ser definidos no ambiente de implantação escolhido.

## Bloqueios antes de produção

- [ ] Definir autenticação individual de agente/serviço e vincular o principal ao caller autenticado, sem aceitar identidade arbitrária do body.
- [ ] Aprovar formalmente o TTL máximo de política offline e o intervalo de sincronização.
- [ ] Criar fluxo administrativo auditável para gerenciar políticas e testar migrações no banco de produção.
- [ ] Escolher o host/runtime persistente, responsável operacional, certificados e rotação dos dois segredos de serviço.
- [ ] Adicionar observabilidade, teste de integração implantado, modo sombra, canário e plano de rollback.
