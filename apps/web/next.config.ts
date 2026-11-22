import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const nextConfig: NextConfig = {
  // Image Docker légère : seul le serveur autonome est copié.
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // Les paquets du monorepo sont en TypeScript source.
  transpilePackages: ['@tandhim/core', '@tandhim/db'],
  // Module natif : chargé tel quel par Node, pas empaqueté.
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
