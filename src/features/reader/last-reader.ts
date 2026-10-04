import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_READER_BOOK_KEY = 'point-reader:last-reader-book-id';

export async function getLastReaderBookId() {
  return AsyncStorage.getItem(LAST_READER_BOOK_KEY);
}

export async function setLastReaderBookId(bookId: string) {
  await AsyncStorage.setItem(LAST_READER_BOOK_KEY, bookId);
}

export async function clearLastReaderBookId(bookId?: string | null) {
  if (!bookId) {
    await AsyncStorage.removeItem(LAST_READER_BOOK_KEY);
    return;
  }
  const current = await getLastReaderBookId();
  if (current === bookId) {
    await AsyncStorage.removeItem(LAST_READER_BOOK_KEY);
  }
}
