#!/usr/bin/env node
/**
 * `pnpm demo` : lance Tandhim en mode démo (fausses données réalistes, sans compte, sans mot de
 * passe, aucune source externe), avec une base séparée dans data/demo/.
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const enfant = spawn('pnpm', ['dev'], {
  cwd: racine,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, TANDHIM_DEMO: '1', DATA_DIR: join(racine, 'data', 'demo') },
});
enfant.on('exit', (code) => process.exit(code ?? 0));
