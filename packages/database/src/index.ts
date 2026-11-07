import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import * as fs from 'fs';
import * as path from 'path';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DatabaseEngine {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  isEmbedded: boolean;
  close(): Promise<void>;
}

let singletonDb: DatabaseEngine | null = null;

/**
 * Returns an initialized PostgreSQL connection.
 * - In Dokploy / Docker production: connects to PostgreSQL 16 + pgvector via DATABASE_URL.
 * - When USE_EMBEDDED_DB=true or PostgreSQL container is unreachable in bare-metal dev/test:
 *   boots an embedded persistent PostgreSQL instance (PGlite + pgvector extension) stored on disk
 *   and automatically applies the reproducible Prisma SQL migration.
 */
export async function getDb(): Promise<DatabaseEngine> {
  if (singletonDb) return singletonDb;

  const useEmbedded = process.env.USE_EMBEDDED_DB === 'true' || !process.env.DATABASE_URL;

  if (!useEmbedded && process.env.DATABASE_URL) {
    try {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 2500,
      });
      await pool.query('SELECT 1');
      singletonDb = {
        isEmbedded: false,
        async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
          const res = await pool.query(sql, params);
          return { rows: res.rows as T[], rowCount: res.rowCount ?? res.rows.length };
        },
        async exec(sql: string): Promise<void> {
          await pool.query(sql);
        },
        async close(): Promise<void> {
          await pool.end();
          singletonDb = null;
        },
      };
      await ensureSchemaMigrated(singletonDb);
      return singletonDb;
    } catch (err) {
      if (process.env.NODE_ENV === 'production' && process.env.STRICT_DOCKER_DB === 'true') {
        throw err;
      }
    }
  }

  // Boot Embedded Persistent PostgreSQL + pgvector (PGlite)
  const dataDir = path.resolve(
    process.cwd(),
    process.env.EMBEDDED_DB_PATH || path.join(__dirname, '../../../.local-data/pgdata')
  );
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });

  const pg = await PGlite.create({
    dataDir,
    extensions: { vector },
  });

  singletonDb = {
    isEmbedded: true,
    async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
      const res = await pg.query(sql, params);
      return { rows: (res.rows as T[]) || [], rowCount: res.affectedRows ?? res.rows.length };
    },
    async exec(sql: string): Promise<void> {
      await pg.exec(sql);
    },
    async close(): Promise<void> {
      await pg.close();
      singletonDb = null;
    },
  };

  await ensureSchemaMigrated(singletonDb);
  return singletonDb;
}

async function ensureSchemaMigrated(db: DatabaseEngine): Promise<void> {
  const check = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'User'
    ) as exists;`
  );

  if (!check.rows[0]?.exists) {
    const migrationPath = path.resolve(
      __dirname,
      '../prisma/migrations/20261106000000_init/migration.sql'
    );
    let sql = fs.readFileSync(migrationPath, 'utf-8');
    if (db.isEmbedded) {
      // PGlite supports vector extension natively; uuid-ossp is not needed since we generate UUIDv4 in SQL/app
      sql = sql.replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '');
    }
    await db.exec(sql);
  }
}

export * from './seed';
