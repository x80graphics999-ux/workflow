// Vercel uses Postgres: writes a copy of schema.prisma with the provider switched,
// so schema.prisma stays the single source for local (SQLite) and hosted installs.
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./schema.prisma', import.meta.url), 'utf8');
const schema = source.replace('provider = "sqlite"', 'provider = "postgresql"');
if (schema === source) throw new Error('Could not find the SQLite provider in schema.prisma');
fs.mkdirSync(new URL('./postgres/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./postgres/schema.prisma', import.meta.url), schema);
