import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { initializeDatabase } from '../src/shared/db-schema';

function adapter(database: DatabaseSync) {
  return {
    execAsync: async (sql: string) => {
      database.exec(sql);
    },
    getAllAsync: async <T>(sql: string): Promise<T[]> => database.prepare(sql).all() as T[],
  };
}

test('migration upgrades the original SQLite schema without losing books or progress', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`CREATE TABLE books (
    id TEXT PRIMARY KEY, title TEXT, author TEXT, format TEXT, coverUri TEXT, fileUri TEXT,
    createdAt INTEGER, updatedAt INTEGER, progress REAL, currentChapter INTEGER, currentOffset REAL
  ); INSERT INTO books VALUES ('legacy','Title','Author','epub',NULL,'file:///old/Documents/books/legacy.epub',1,2,0.65,3,0.25);`);
  await initializeDatabase(adapter(database));
  await initializeDatabase(adapter(database));
  const row = database.prepare('SELECT * FROM books').get();
  assert.equal(row?.id, 'legacy');
  assert.equal(row?.progress, 0.65);
  assert.equal(row?.currentChapter, 3);
  assert.equal(row?.currentOffset, 0.25);
  assert.equal(row?.currentLocation, null);
  assert.equal(row?.groupId, null);
  database.close();
});

test('fresh SQLite schema stores the same book and folder columns', async () => {
  const database = new DatabaseSync(':memory:');
  await initializeDatabase(adapter(database));
  database.exec("INSERT INTO groups VALUES ('folder','Books',1)");
  assert.equal(database.prepare('SELECT name FROM groups').get()?.name, 'Books');
  const columns = database
    .prepare('PRAGMA table_info(books)')
    .all()
    .map((row) => row.name);
  assert.deepEqual(columns, [
    'id',
    'title',
    'author',
    'format',
    'coverUri',
    'fileUri',
    'createdAt',
    'updatedAt',
    'progress',
    'currentChapter',
    'currentOffset',
    'currentLocation',
    'groupId',
  ]);
  database.close();
});
