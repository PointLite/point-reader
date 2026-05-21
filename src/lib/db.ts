import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

let dbPromise: Promise<SQLiteDatabase> | null = null;

export async function getDb() {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync('point-reader.db');
  }

  const db = await dbPromise;
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      format TEXT NOT NULL,
      coverUri TEXT,
      fileUri TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      progress REAL NOT NULL DEFAULT 0,
      currentChapter INTEGER NOT NULL DEFAULT 0,
      currentOffset REAL NOT NULL DEFAULT 0,
      currentLocation TEXT,
      groupId TEXT
    );
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
  `);
  await ensureColumn(db, 'books', 'currentLocation', 'TEXT');
  await ensureColumn(db, 'books', 'groupId', 'TEXT');

  return db;
}

async function ensureColumn(
  db: SQLiteDatabase,
  table: string,
  column: string,
  definition: string
) {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
