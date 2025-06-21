
import type { Config } from 'drizzle-kit';

export default {
  schema: './database/schema.ts',
  out: './migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/maat_db',
  },
  verbose: true,
  strict: true,
} satisfies Config;
