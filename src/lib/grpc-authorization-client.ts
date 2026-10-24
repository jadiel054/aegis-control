import 'server-only';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'node:path';

export type EvaluateAccessInput = {
  requestId: string;
  tenantId: string;
  principalId: string;
  action: string;
  resource: string;
};

export type EvaluateAccessOutput = {
  requestId: string;
  decision: 'ALLOW' | 'DENY' | 'DECISION_UNSPECIFIED';
  reason: string;
  policyId: string;
  policyRevision: string;
  evaluatedAt: string;
};

type WireEvaluateAccessOutput = Omit<EvaluateAccessOutput, 'decision'> & {
  decision: 'DECISION_ALLOW' | 'DECISION_DENY' | 'DECISION_UNSPECIFIED';
};

type AuthorizationClient = grpc.Client & {
  evaluateAccess(
    request: EvaluateAccessInput,
    metadata: grpc.Metadata,
    options: { deadline: Date },
    callback: (error: grpc.ServiceError | null, response?: WireEvaluateAccessOutput) => void,
  ): void;
};

let client: AuthorizationClient | undefined;

function getClient(): AuthorizationClient {
  const target = process.env.AEGIS_GRPC_TARGET;
  const token = process.env.AEGIS_GRPC_API_KEY;
  if (!target || !token || token.length < 32) {
    throw new Error('AEGIS_GRPC_TARGET and a 32-character AEGIS_GRPC_API_KEY are required');
  }
  if (client) return client;

  const protoPath = path.join(process.cwd(), 'api/proto/aegis/authorization/v1/authorization.proto');
  const definition = protoLoader.loadSync(protoPath, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(definition) as any;
  const ServiceClient = loaded.aegis.authorization.v1.AuthorizationService;
  const rootPem = process.env.AEGIS_GRPC_ROOT_CERT_PEM?.replace(/\\n/g, '\n');
  const credentials = grpc.credentials.createSsl(rootPem ? Buffer.from(rootPem) : undefined);
  client = new ServiceClient(target, credentials) as AuthorizationClient;
  return client;
}

export function evaluateAccess(input: EvaluateAccessInput): Promise<EvaluateAccessOutput> {
  const token = process.env.AEGIS_GRPC_API_KEY;
  const timeoutMs = Number(process.env.AEGIS_GRPC_TIMEOUT_MS ?? '1500');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000) {
    return Promise.reject(new Error('AEGIS_GRPC_TIMEOUT_MS must be between 100 and 10000'));
  }
  const metadata = new grpc.Metadata();
  metadata.set('authorization', `Bearer ${token}`);

  return new Promise((resolve, reject) => {
    getClient().evaluateAccess(input, metadata, { deadline: new Date(Date.now() + timeoutMs) }, (error, response) => {
      if (error) reject(error);
      else if (!response) reject(new Error('gRPC returned an empty response'));
      else resolve({
        ...response,
        decision: response.decision === 'DECISION_ALLOW'
          ? 'ALLOW'
          : response.decision === 'DECISION_DENY' ? 'DENY' : 'DECISION_UNSPECIFIED',
      });
    });
  });
}
