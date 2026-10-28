import { handleCurrentDesk } from '../../../lib/currentdesk/server.mjs';
import type { APIRoute } from 'astro';
export const prerender = false;
export const ALL: APIRoute = ({ request, params, clientAddress }) => handleCurrentDesk(request, params.kind, clientAddress);
