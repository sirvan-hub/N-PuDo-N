const configuredDriver = (process.env.DB_TYPE || 'sqlite').toLowerCase();
const isPostgres = configuredDriver === 'postgres' || configuredDriver === 'postgresql';

/** Column types selected at runtime so local SQLite and PostgreSQL share entities. */
export const databaseUuidColumnType = isPostgres ? 'uuid' : 'varchar';
export const databaseDateColumnType = isPostgres ? 'timestamptz' : 'datetime';
export const databaseJsonColumnType = isPostgres ? 'jsonb' : 'simple-json';
