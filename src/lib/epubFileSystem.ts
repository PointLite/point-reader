import { useCallback, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

export function useLegacyEpubFileSystem() {
  const [file, setFile] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [size, setSize] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const downloadFile = useCallback(async (fromUrl: string, toFile: string) => {
    const target = `${FileSystem.documentDirectory ?? ''}${toFile}`;
    const downloadResumable = FileSystem.createDownloadResumable(
      fromUrl,
      target,
      { cache: true },
      (downloadProgress) => {
        const expected = downloadProgress.totalBytesExpectedToWrite || 1;
        setProgress(Math.round((downloadProgress.totalBytesWritten / expected) * 100));
      }
    );

    setDownloading(true);
    try {
      const result = await downloadResumable.downloadAsync();
      if (!result) throw new Error('Download failed');
      if (result.headers['Content-Length']) {
        setSize(Number(result.headers['Content-Length']));
      }
      setSuccess(true);
      setError(null);
      setFile(result.uri);
      return { uri: result.uri, mimeType: result.mimeType ?? null };
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Error downloading file');
      return { uri: null, mimeType: null };
    } finally {
      setDownloading(false);
    }
  }, []);

  const getFileInfo = useCallback(async (fileUri: string) => {
    const info = await FileSystem.getInfoAsync(fileUri);
    return {
      uri: info.uri,
      exists: info.exists,
      isDirectory: info.exists ? info.isDirectory : false,
      size: info.exists ? info.size : undefined,
    };
  }, []);

  return {
    file,
    progress,
    downloading,
    size,
    error,
    success,
    documentDirectory: FileSystem.documentDirectory,
    cacheDirectory: FileSystem.cacheDirectory,
    bundleDirectory: FileSystem.bundleDirectory ?? undefined,
    readAsStringAsync: FileSystem.readAsStringAsync,
    writeAsStringAsync: FileSystem.writeAsStringAsync,
    deleteAsync: FileSystem.deleteAsync,
    downloadFile,
    getFileInfo,
  };
}
