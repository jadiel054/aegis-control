import type { ConnectRouter } from '@connectrpc/connect';
import { AuthorizationService } from '@/gen/aegis/authorization/v1/authorization_connect';
import { evaluateAccess } from '@/lib/authorization/service';

export default (router: ConnectRouter) => {
  router.service(AuthorizationService, {
    evaluateAccess: (request, context) => evaluateAccess(request, context),
  });
};
