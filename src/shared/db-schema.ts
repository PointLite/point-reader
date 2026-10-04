import type { SQLiteDatabase } from 'expo-sqlite';

export async function initializeDatabase(db: Pick<SQLiteDatabase, 'execAsync' | 'getAllAsync'>) {
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
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(books)');
  for (const column of ['currentLocation', 'groupId']) {
    if (!columns.some((item) => item.name === column)) {
      await db.execAsync(`ALTER TABLE books ADD COLUMN ${column} TEXT`);
    }
  }
}
