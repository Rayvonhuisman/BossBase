// Lokale "Supabase" op http://localhost:54321, zonder Docker.
//
//   /rest/v1/*       → echte PostgREST (55433) op een Postgres met de productiestructuur
//   /functions/v1/*  → echte Edge Function-code in Deno (router.ts, poort 54330)
//   /auth/v1/*       → NABOOTSING van Supabase Auth (GoTrue). Volgt de broncode:
//                       - wachtwoordlogin weigert een geblokkeerde gebruiker
//                         (internal/api/token.go: user.IsBanned → "User is banned")
//                       - refresh weigert geblokkeerd of zonder sessie
//                         (internal/tokens/service.go: IsBanned, "No Valid Session Found")
//                       - GET /user weigert een token waarvan de sessie weg is
//                         (internal/api/auth.go: session_not_found)
//   /storage/v1/*    → NABOOTSING van storage-api: voert de query uit met de rol
//                       en claims uit het JWT, zodat de echte Storage-policies gelden.
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const L = process.env.LOKAAL;
const SECRET = fs.readFileSync(`${L}/jwt_secret`, 'utf8').trim();  // eigen, lokaal gegenereerd geheim
const PSQL = '/opt/homebrew/opt/postgresql@17/bin/psql';

export function b64url(b) { return Buffer.from(b).toString('base64url'); }
export function jwt(claims, secret = SECRET) {
  const kop = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...claims }));
  const sig = crypto.createHmac('sha256', secret).update(`${kop}.${body}`).digest('base64url');
  return `${kop}.${body}.${sig}`;
}
function leesJwt(token) {
  const [k, b, s] = (token || '').split('.');
  if (!s) return null;
  const goed = crypto.createHmac('sha256', SECRET).update(`${k}.${b}`).digest('base64url');
  if (goed !== s) return null;
  const c = JSON.parse(Buffer.from(b, 'base64url'));
  if (c.exp && c.exp < Date.now() / 1000) return null;
  return c;
}
const dq = s => `$q$${String(s).replace(/\$q\$/g, '')}$q$`;
export function sql(query, claims = null) {
  const voor = claims
    ? `begin; set local role ${claims.role}; set local "request.jwt.claims" to '${JSON.stringify(claims).replace(/'/g, "''")}';`
    : 'begin;';
  const uit = execFileSync(PSQL, ['-h', L, '-p', '55432', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c',
    `${voor} ${query}; commit;`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const regels = uit.split('\n').filter(r => r && r !== 'BEGIN' && r !== 'COMMIT' && r !== 'SET' && !/^(DELETE|UPDATE|INSERT)/.test(r) && r !== '');
  return regels.filter(r => !/^[{\[]?$/.test(r) || r.length > 1);
}
const stuur = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
async function lees(req) { let d = ''; for await (const c of req) d += c; return d; }
function proxy(req, res, poort, pad, body) {
  const p = http.request({ host: '127.0.0.1', port: poort, path: pad, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${poort}` } }, r => {
    res.writeHead(r.statusCode, { ...CORS, ...r.headers }); r.pipe(res);
  });
  p.on('error', e => stuur(res, 502, { error: e.message }));
  p.end(body);
}
function nieuweSessie(userId, email) {
  const sid = crypto.randomUUID();
  const rt = crypto.randomBytes(16).toString('hex');
  sql(`insert into auth.sessions (id, user_id, created_at, updated_at) values ('${sid}', '${userId}', now(), now());
       insert into auth.refresh_tokens (token, user_id, session_id, revoked, created_at, updated_at, instance_id)
       values ('${rt}', '${userId}', '${sid}', false, now(), now(), '00000000-0000-0000-0000-000000000000')`);
  return { access_token: jwt({ sub: userId, role: 'authenticated', aud: 'authenticated', session_id: sid, email }),
           refresh_token: rt, token_type: 'bearer', expires_in: 3600, user: { id: userId, email } };
}
const gebruikerRij = (kolom, waarde) => {
  const r = sql(`select json_build_object('id', id, 'email', email, 'banned', coalesce(banned_until > now(), false))
                  from auth.users where ${kolom} = ${dq(waarde)}`);
  return r.length ? JSON.parse(r[0]) : null;
};

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'Access-Control-Expose-Headers': '*' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  if (req.method === 'OPTIONS' && !url.pathname.startsWith('/rest/v1/') && !url.pathname.startsWith('/functions/v1/')) { res.writeHead(204); return res.end(); }
  const body = await lees(req);
  const auth = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    if (url.pathname.startsWith('/rest/v1/')) return proxy(req, res, 55433, req.url.slice(8), body);
    if (url.pathname.startsWith('/functions/v1/')) return proxy(req, res, 54330, req.url, body);

    if (url.pathname === '/auth/v1/token') {
      const p = JSON.parse(body || '{}');
      if (url.searchParams.get('grant_type') === 'password') {
        const u = gebruikerRij('email', p.email);
        if (!u || p.password !== 'test-wachtwoord') return stuur(res, 400, { code: 'invalid_credentials', msg: 'Invalid login credentials' });
        if (u.banned) return stuur(res, 400, { code: 'user_banned', msg: 'User is banned' });
        return stuur(res, 200, nieuweSessie(u.id, u.email));
      }
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const r = sql(`select json_build_object('uid', t.user_id, 'sid', t.session_id,
                        'sessie', exists (select 1 from auth.sessions s where s.id = t.session_id))
                         from auth.refresh_tokens t where t.token = ${dq(p.refresh_token)} and not coalesce(t.revoked, false)`);
        if (!r.length) return stuur(res, 400, { code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
        const t = JSON.parse(r[0]);
        const u = gebruikerRij('id', t.uid);
        if (u.banned) return stuur(res, 400, { code: 'user_banned', msg: 'Invalid Refresh Token: User Banned' });
        if (!t.sessie) return stuur(res, 400, { code: 'session_not_found', msg: 'Invalid Refresh Token: No Valid Session Found' });
        sql(`update auth.refresh_tokens set revoked = true where token = ${dq(p.refresh_token)}`);
        return stuur(res, 200, nieuweSessie(u.id, u.email));
      }
    }
    if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
      const c = leesJwt(auth);
      if (!c) return stuur(res, 403, { code: 'bad_jwt', msg: 'invalid JWT' });
      const u = gebruikerRij('id', c.sub);
      if (!u) return stuur(res, 403, { code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' });
      if (c.session_id && !sql(`select 1 from auth.sessions where id = ${dq(c.session_id)}`).length) {
        return stuur(res, 403, { code: 'session_not_found', msg: 'Session from session_id claim in JWT does not exist' });
      }
      return stuur(res, 200, { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated' });
    }
    const adminDel = url.pathname.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/);
    if (adminDel && req.method === 'DELETE') {
      if (leesJwt(auth)?.role !== 'service_role') return stuur(res, 403, { msg: 'not admin' });
      sql(`delete from auth.users where id = ${dq(adminDel[1])}`);
      return stuur(res, 200, {});
    }
    if (url.pathname === '/auth/v1/logout') {
      const c = leesJwt(auth); if (c?.session_id) sql(`delete from auth.sessions where id = ${dq(c.session_id)}`);
      res.writeHead(204); return res.end();
    }

    // Storage: rol en claims uit het JWT, zoals storage-api.
    const claims = leesJwt(auth) || { role: 'anon' };
    const lijst = url.pathname.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
    if (lijst) {
      const p = JSON.parse(body || '{}');
      const r = sql(`select coalesce(json_agg(json_build_object('name', name)), '[]') from storage.objects
                      where bucket_id = ${dq(lijst[1])} and name like ${dq((p.prefix || '') + '%')}`, claims);
      return stuur(res, 200, JSON.parse(r[0] || '[]'));
    }
    const teken = url.pathname.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
    if (teken && req.method === 'POST') {
      // createSignedUrl: alleen als het object bestaat en de rol het mag zien.
      const p = JSON.parse(body || '{}');
      const r = sql(`select count(*) from storage.objects where bucket_id = ${dq(teken[1])} and name = ${dq(decodeURIComponent(teken[2]))}`, claims);
      if (r[0] !== '1') return stuur(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      return stuur(res, 200, { signedURL: `/object/sign/${teken[1]}/${teken[2]}?token=lokaal&geldig=${p.expiresIn}` });
    }
    const verwijder = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)$/);
    if (verwijder && req.method === 'DELETE') {
      const p = JSON.parse(body || '{}');
      const namen = (p.prefixes || []).map(dq).join(',') || "''";
      const r = sql(`with weg as (delete from storage.objects where bucket_id = ${dq(verwijder[1])} and name in (${namen}) returning name)
                     select coalesce(json_agg(json_build_object('name', name)), '[]') from weg`, claims);
      return stuur(res, 200, JSON.parse(r[0] || '[]'));
    }
    const getekendLezen = url.pathname.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
    if (getekendLezen && req.method === 'GET') {
      // Een ondertekende link openen: het document zelf (hier: zijn bucket en pad).
      const r = sql(`select count(*) from storage.objects where bucket_id = ${dq(getekendLezen[1])} and name = ${dq(decodeURIComponent(getekendLezen[2]))}`);
      if (r[0] !== '1') return stuur(res, 400, { statusCode: '404', error: 'not_found' });
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end(`document:${getekendLezen[1]}/${decodeURIComponent(getekendLezen[2])}`);
    }
    const lezen = url.pathname.match(/^\/storage\/v1\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/);
    if (lezen && req.method === 'GET') {
      const r = sql(`select count(*) from storage.objects where bucket_id = ${dq(lezen[1])} and name = ${dq(decodeURIComponent(lezen[2]))}`, claims);
      return r[0] === '1' ? (res.writeHead(200, { 'Content-Type': 'application/octet-stream' }), res.end('inhoud'))
                          : stuur(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    }
    stuur(res, 404, { error: `onbekend: ${req.method} ${url.pathname}` });
  } catch (e) {
    stuur(res, 500, { error: String(e.stderr || e.message).slice(0, 500) });
  }
});

if (process.argv[1].endsWith('gateway.mjs')) {
  server.listen(54321, () => console.log('gateway op http://localhost:54321'));
}
