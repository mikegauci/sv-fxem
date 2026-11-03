import { handleContact } from "@/lib/contact/server.mjs";
import { clientAddress, trustedRequest } from "@/lib/security/request.mjs";

// Contact form (Mailjet). GET issues the form token, POST sends.
async function handle(request: Request) {
  return handleContact(trustedRequest(request), clientAddress(request));
}

export { handle as GET, handle as POST };
