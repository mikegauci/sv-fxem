import { handleCurrentDesk } from "@/lib/currentdesk/server.mjs";
import { clientAddress, trustedRequest } from "@/lib/security/request.mjs";

// CurrentDesk live/demo/partner registration. GET returns the form token and
// dictionaries, POST registers.
async function handle(
  request: Request,
  { params }: RouteContext<"/api/currentdesk/[kind]">,
) {
  const { kind } = await params;
  return handleCurrentDesk(
    trustedRequest(request),
    kind,
    clientAddress(request),
  );
}

export { handle as GET, handle as POST };
