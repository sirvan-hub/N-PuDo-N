import { DataSourceOptions } from 'typeorm';

const truthy = (value: string | undefined): boolean =>
  value === '1' || value?.toLowerCase() === 'true';

export function createDatabaseOptions(env: NodeJS.ProcessEnv = process.env): DataSourceOptions {
  const driver = (env.DB_TYPE || 'sqlite').toLowerCase();

  if (driver === 'postgres' || driver === 'postgresql') {
    const host = env.DB_HOST;
    const database = env.DB_NAME;
    const username = env.DB_USER;
    const password = env.DB_PASSWORD;

    if (!host || !database || !username || !password) {
      throw new Error('PostgreSQL requires DB_HOST, DB_NAME, DB_USER and DB_PASSWORD.');
    }

    if (truthy(env.TYPEORM_SYNCHRONIZE)) {
      throw new Error('TYPEORM_SYNCHRONIZE is forbidden for PostgreSQL. Use versioned migrations.');
    }

    return {
      type: 'postgres',
      host,
      port: Number(env.DB_PORT || 5432),
      database,
      username,
      password,
      ssl: truthy(env.DB_SSL) ? { rejectUnauthorized: !truthy(env.DB_SSL_REJECT_UNAUTHORIZED_FALSE) } : false,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      synchronize: false,
      migrationsRun: false,
      logging: false,
    };
  }

  if (driver !== 'sqlite') {
    throw new Error(`Unsupported DB_TYPE "${driver}". Supported values: sqlite, postgres.`);
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('SQLite is blocked in NODE_ENV=production; configure PostgreSQL explicitly.');
  }

  return {
    type: 'sqlite',
    database: env.SQLITE_DATABASE || 'dev.db',
    entities: [__dirname + '/**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    synchronize: env.SQLITE_SYNCHRONIZE === undefined ? true : truthy(env.SQLITE_SYNCHRONIZE),
    migrationsRun: false,
    logging: false,
  };
}
