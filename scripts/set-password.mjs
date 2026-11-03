// Sets a CMS user's password from the terminal (for the first admin, before
// anyone can sign in). The password is typed at a hidden prompt and sent
// straight to Supabase; it is never printed or stored.
//   node --env-file=.env.local scripts/set-password.mjs mikegauci@gmail.com
import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];
if (!email) throw Error('Usage: node --env-file=.env.local scripts/set-password.mjs <email>');
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: key } = process.env;
if (!url || !key) throw Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local.');

function hidden(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) return reject(Error('Run this in an interactive terminal.'));
    process.stdout.write(question);
    input.setRawMode(true); input.resume(); input.setEncoding('utf8');
    let value = '';
    const onData = char => {
      if (char === '\u0003') { process.stdout.write('\n'); process.exit(130); }
      if (char === '\r' || char === '\n') {
        input.setRawMode(false); input.pause(); input.off('data', onData);
        process.stdout.write('\n'); resolve(value);
      } else if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
      else value += char;
    };
    input.on('data', onData);
  });
}

const db = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await db.from('profiles').select('id, role').eq('email', email).maybeSingle();
if (error) throw error;
if (!data) throw Error(`No account for ${email}.`);

const password = await hidden('New password: ');
if (password.length < 8) throw Error('Use at least 8 characters.');
if (password !== await hidden('Repeat password: ')) throw Error('The passwords do not match.');

const result = await db.auth.admin.updateUserById(data.id, { password });
if (result.error) throw result.error;
console.log(`Password set for ${email} (${data.role}). Sign in at /admin/login/.`);
