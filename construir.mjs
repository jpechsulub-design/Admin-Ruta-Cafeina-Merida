// Genera index.html con el contenido cifrado.
// Uso:  RC_CLAVE="la contraseña" node construir.mjs
// Necesita fuente/datos.json (no se sube a GitHub, está en .gitignore) con
// { "competidores": [...], "cfg": {...} }.  La contraseña nunca se guarda en el repositorio.
import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';

const clave = process.env.RC_CLAVE || '';
if (clave.length < 12) { console.error('Define RC_CLAVE con una contraseña de 12 caracteres o más.'); process.exit(1); }
const datos = JSON.parse(fs.readFileSync('fuente/datos.json', 'utf8'));
const n = (datos.competidores || []).length;
const app = fs.readFileSync('plantilla/app.html', 'utf8')
  .replaceAll('{{N_COMP}}', String(n))
  .replaceAll('{{N_DIAS}}', String(n + 2))
  .replaceAll('{{ACTUALIZACION}}', (datos.cfg && datos.cfg.actualizacion) || '');

const N = 600000;
const b64 = (u8) => Buffer.from(u8).toString('base64');
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveKey']);
const llave = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: N, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, llave, new TextEncoder().encode(JSON.stringify({ app, datos })));
const carga = JSON.stringify({ v: 1, n: N, s: b64(salt), i: b64(iv), c: b64(new Uint8Array(cifrado)) });
fs.writeFileSync('index.html', fs.readFileSync('plantilla/index.html', 'utf8').replace('{{CARGA}}', carga));
console.log('index.html generado con', n, 'competidores.');
