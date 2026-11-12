import {createPilotAuthHandler} from './handler.mjs';

const rawOrigins=Deno.env.get('LUMO_ALLOWED_ORIGINS')||'';
const deployedOrigins=[
  'https://lumo-connected-pilot.vercel.app',
  'http://127.0.0.1:4173',
  'https://lumo-connected-pilot-o4z6ft2e8-williedark-6795.vercel.app',
  'https://lumo-connected-pilot-williedark-6795.vercel.app',
];
const allowedOrigins=[...new Set([...deployedOrigins,...rawOrigins.split(',').map(value=>value.trim()).filter(Boolean)])];
Deno.serve(createPilotAuthHandler({
  supabaseUrl:Deno.env.get('SUPABASE_URL')||'',
  serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',
  allowedOrigins,
}));
