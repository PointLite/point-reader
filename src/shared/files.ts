import { File } from 'expo-file-system';

export function deleteFileIfExists(uri?: string | null) {
  if (!uri) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}
