import type { APIRoute } from 'astro';
import { handleContact } from '../../lib/contact/server.mjs';
export const prerender = false;
export const ALL: APIRoute = ({ request, clientAddress }) => handleContact(request, clientAddress);
