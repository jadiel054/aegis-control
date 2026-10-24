import { nextJsApiRouter } from '@connectrpc/connect-next';
import routes from '../../connect';

export const runtime = 'nodejs';

const { handler, config } = nextJsApiRouter({
  routes,
  grpc: false,
  grpcWeb: true,
  connect: true,
});

export { handler as default, config };
