import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { initializeDatabase } from './db-schema';

let dbPromise: Promise<SQLiteDatabase> | undefined;

export function getDb() {
  if (!dbPromise) {
    // All callers await schema creation and migrations, not just opening the file.
    dbPromise = openDatabaseAsync('point-reader.db')
      .then(async (db) => {
        try {
          await initializeDatabase(db);
          return db;
        } catch (error) {
          await db.closeAsync();
          throw error;
        }
      })
      .catch((error) => {
        dbPromise = undefined;
        throw error;
      });
  }
  return dbPromise;
}
