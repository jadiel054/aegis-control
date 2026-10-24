# ConnectRPC no Vercel

A autorização unary do Aegis pode ser executada no Next.js/Vercel usando ConnectRPC sobre HTTP/1.1 + JSON. O arquivo `api/proto/aegis/authorization/v1/authorization.proto` continua sendo o contrato oficial.

## Geração

Instale as dependências com `npm install` e regenere os artefatos com:

```bash
npm run proto:generate
```

A saída fica em `src/gen/` e contém as mensagens Protobuf e o descritor ConnectRPC.

## Endpoint

O adaptador oficial do ConnectRPC para Next.js 14 usa o Pages Router:

```text
POST /api/aegis.authorization.v1.AuthorizationService/EvaluateAccess
```

A rota executa em Node.js, não no Edge Runtime. O protocolo Connect aceita JSON sobre HTTP/1.1. Exemplo:

```bash
curl -X POST "$AEGIS_BASE_URL/api/aegis.authorization.v1.AuthorizationService/EvaluateAccess" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AEGIS_AUTHORIZATION_DIAGNOSTIC_KEY" \
  --data '{
    "requestId": "req-123",
    "tenantId": "tenant-a",
    "principalId": "agent-01",
    "action": "mission.execute",
    "resource": "mission/42"
  }'
```

A credencial é server-to-server e não deve ser enviada ao browser ou distribuída para agentes enquanto a identidade individual não estiver implementada.

## Decisão

A implementação mantém correspondência exata por tenant, principal, ação e recurso. Política ausente, desabilitada, fora da validade ou com efeito `DENY` retorna uma resposta normal com decisão `DENY`. Falha no Neon, configuração ausente ou snapshot inválido retorna erro operacional; nunca retorna `ALLOW` por fallback.

O cache de cinco segundos é apenas oportunístico e vive na instância quente da função. Ele é descartável: cold start, restart ou scale-out podem criar um cache diferente. O Neon permanece a fonte de verdade.

## Variáveis

A rota usa:

```text
DATABASE_URL
AEGIS_AUTHORIZATION_DIAGNOSTIC_KEY
```

A chave deve ter pelo menos 32 caracteres. A tabela precisa existir por meio da migration `db/migrations/002_authorization_policies.sql`.

## Compatibilidade futura

O servidor Go, o código gRPC e o `.proto` permanecem no repositório. Quando houver uma infraestrutura persistente, o mesmo contrato poderá ser servido por ConnectRPC/Go ou gRPC nativo sem alterar a semântica da decisão.


## Testes

Os casos de decisão ficam em `tests/fixtures/authorization-policy-cases.json` e são consumidos pelos testes do cache Go e do evaluator TypeScript, para manter a semântica de `ALLOW`/`DENY` alinhada.

```bash
npm ci
npm test
go test ./...
```

`npm test` executa o contrato Protobuf e a suíte do evaluator TypeScript. `go test ./...` executa os testes Go, incluindo os mesmos fixtures compartilhados.
