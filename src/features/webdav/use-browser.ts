import {
  WEBDAV_DIRECTORIES_KEY,
  WEBDAV_SORT_KEY,
  defaultWebDavSort,
  emptyDirectoryForm,
  normalizeDirectoryUrl,
  sortWebDavEntries,
  type BrowseState,
  type WebDavSortState,
} from '@/features/webdav/browser-model';
import { listWebDav, type WebDavConfig } from '@/features/webdav/client';
import { startWebDavImport, useWebDavImport } from '@/features/webdav/import-queue';
import type { WebDavDirectory, WebDavEntry } from '@/features/webdav/types';
import { useTranslation } from '@/shared/i18n/index';
import { useEinkOptimization } from '@/shared/theme/motion';
import { useAppTheme } from '@/shared/theme/theme';
import { useToast } from '@/shared/ui/app-toast';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, View, useWindowDimensions } from 'react-native';

function configFor(directory: WebDavDirectory): WebDavConfig {
  return {
    url: directory.url,
    username: directory.username,
    password: directory.password,
  };
}

export function useWebDavScreenController() {
  const { width, height } = useWindowDimensions();
  const { t } = useTranslation();
  const showToast = useToast();
  const { colors } = useAppTheme();
  const einkOptimization = useEinkOptimization();
  const [directories, setDirectories] = useState<WebDavDirectory[]>([]);
  const [entries, setEntries] = useState<WebDavEntry[]>([]);
  const [selectedHrefs, setSelectedHrefs] = useState<string[]>([]);
  const [browseState, setBrowseState] = useState<BrowseState | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [sortOpen, setSortOpen] = useState<boolean>(false);
  const [sortMenuFrame, setSortMenuFrame] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [editingDirectory, setEditingDirectory] = useState<WebDavDirectory | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [sort, setSort] = useState<WebDavSortState>(defaultWebDavSort);
  const [form, setForm] = useState<{ name: string; url: string; username: string; password: string }>(
    emptyDirectoryForm
  );
  const [urlInputInvalid, setUrlInputInvalid] = useState<boolean>(false);
  const navigationRequestRef = useRef(0);
  const sortButtonRef = useRef<View>(null);
  const webDavImport = useWebDavImport();
  const importing = webDavImport.status === 'running';
  const selectedHrefSet = new Set(selectedHrefs);

  const selectedEntries = entries.filter((entry) => selectedHrefSet.has(entry.href));
  const sortedEntries = sortWebDavEntries(entries, sort);

  useEffect(() => {
    async function loadDirectories() {
      try {
        const raw = await AsyncStorage.getItem(WEBDAV_DIRECTORIES_KEY);
        setDirectories(raw ? JSON.parse(raw) : []);
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('operationFailed'));
      }
    }
    const timer = setTimeout(() => {
      void loadDirectories();
    }, 0);
    return () => clearTimeout(timer);
  }, [showToast, t]);

  useEffect(() => {
    let mounted = true;
    async function loadSort() {
      try {
        const raw = await AsyncStorage.getItem(WEBDAV_SORT_KEY);
        if (!mounted || !raw) return;
        setSort({ ...defaultWebDavSort, ...JSON.parse(raw) });
      } catch (error) {
        if (mounted) {
          showToast(error instanceof Error ? error.message : t('operationFailed'));
        }
      }
    }
    void loadSort();
    return () => {
      mounted = false;
    };
  }, [showToast, t]);

  const persistDirectories = async (nextDirectories: WebDavDirectory[]) => {
    setDirectories(nextDirectories);
    await AsyncStorage.setItem(WEBDAV_DIRECTORIES_KEY, JSON.stringify(nextDirectories));
  };

  const loadEntries = async (directory: WebDavDirectory, href?: string) => {
    const requestId = ++navigationRequestRef.current;
    setLoading(true);
    let loaded = false;
    try {
      const nextEntries = await listWebDav(configFor(directory), href);
      if (requestId === navigationRequestRef.current) {
        setEntries(nextEntries);
        setSelectedHrefs([]);
        loaded = true;
      }
    } catch (error) {
      if (requestId === navigationRequestRef.current) {
        showToast(error instanceof Error ? error.message : t('webdavBrowseFailed'));
      }
    }
    if (requestId === navigationRequestRef.current) {
      setLoading(false);
    }
    return loaded;
  };

  const openDirectory = async (directory: WebDavDirectory) => {
    if (loading || importing) return;
    const nextState = { directory, href: undefined, label: directory.name, history: [] };
    const loaded = await loadEntries(directory);
    if (loaded) setBrowseState(nextState);
  };

  const openEntry = async (entry: WebDavEntry) => {
    if (loading || importing) return;
    if (!browseState) return;
    if (entry.type === 'file') return;

    const nextState = {
      directory: browseState.directory,
      href: entry.href,
      label: entry.name,
      history: [...browseState.history, { href: browseState.href, label: browseState.label }],
    };
    const loaded = await loadEntries(browseState.directory, entry.href);
    if (loaded) setBrowseState(nextState);
  };

  const goBack = async () => {
    if (loading) return;
    if (!browseState) {
      router.back();
      return;
    }

    const previous = browseState.history.at(-1);
    if (!previous) {
      setBrowseState(null);
      setEntries([]);
      setSelectedHrefs([]);
      return;
    }

    const nextHistory = browseState.history.slice(0, -1);
    const nextState = {
      directory: browseState.directory,
      href: previous.href,
      label: previous.label,
      history: nextHistory,
    };
    const loaded = await loadEntries(browseState.directory, previous.href);
    if (loaded) setBrowseState(nextState);
  };

  const toggleSelected = (href: string) => {
    setSelectedHrefs((current) =>
      current.includes(href) ? current.filter((item) => item !== href) : [...current, href]
    );
  };

  const openAddDirectory = () => {
    setEditingDirectory(null);
    setForm({ name: '', url: '', username: '', password: '' });
    setUrlInputInvalid(false);
    setModalOpen(true);
  };

  const openEditDirectory = (directory: WebDavDirectory) => {
    setEditingDirectory(directory);
    setForm({
      name: directory.name,
      url: directory.url,
      username: directory.username ?? '',
      password: directory.password ?? '',
    });
    setUrlInputInvalid(false);
    setModalOpen(true);
  };

  const closeDirectoryModal = () => {
    setModalOpen(false);
    setEditingDirectory(null);
    setForm({ name: '', url: '', username: '', password: '' });
    setUrlInputInvalid(false);
  };

  const saveDirectory = async () => {
    const url = form.url.trim();
    if (!url) {
      setUrlInputInvalid(true);
      return;
    }
    setUrlInputInvalid(false);

    const now = Date.now();
    const nextDirectory: WebDavDirectory = {
      id: editingDirectory?.id ?? `${now}-${Math.random().toString(36).slice(2)}`,
      name: form.name.trim() || t('directoryNamePlaceholder'),
      url: normalizeDirectoryUrl(url),
      username: form.username.trim() || undefined,
      password: form.password || undefined,
      createdAt: editingDirectory?.createdAt ?? now,
      updatedAt: now,
    };

    const nextDirectories = editingDirectory
      ? directories.map((directory) => (directory.id === editingDirectory.id ? nextDirectory : directory))
      : [nextDirectory, ...directories];
    try {
      await persistDirectories(nextDirectories);
      closeDirectoryModal();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('operationFailed'));
    }
  };

  const deleteDirectory = (directory: WebDavDirectory) => {
    Alert.alert(t('deleteDirectory'), t('deleteDirectoryMessage', { name: directory.name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await persistDirectories(directories.filter((item) => item.id !== directory.id));
          } catch (error) {
            showToast(error instanceof Error ? error.message : t('operationFailed'));
          }
        },
      },
    ]);
  };

  const importSelection = async () => {
    if (!browseState || selectedEntries.length === 0) return;
    const entriesToImport = selectedEntries;
    const config = configFor(browseState.directory);
    setSelectedHrefs([]);
    void startWebDavImport(config, entriesToImport).catch((error) => {
      showToast(error instanceof Error ? error.message : t('importFailedShort'));
    });
  };

  const applySort = async (nextSort: WebDavSortState) => {
    try {
      setSort(nextSort);
      await AsyncStorage.setItem(WEBDAV_SORT_KEY, JSON.stringify(nextSort));
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('operationFailed'));
    }
  };

  const openSortMenu = () => {
    sortButtonRef.current?.measureInWindow((x, y, frameWidth, frameHeight) => {
      setSortMenuFrame({ x, y, width: frameWidth, height: frameHeight });
      setSortOpen(true);
    });
  };

  return {
    width,
    height,
    colors,
    einkOptimization,
    directories,
    browseState,
    modalOpen,
    sortOpen,
    sortMenuFrame,
    editingDirectory,
    loading,
    sort,
    form,
    urlInputInvalid,
    sortButtonRef,
    webDavImport,
    importing,
    selectedHrefSet,
    selectedEntries,
    sortedEntries,
    goBack,
    toggleSelected,
    openAddDirectory,
    openEditDirectory,
    closeDirectoryModal,
    saveDirectory,
    deleteDirectory,
    importSelection,
    applySort,
    openSortMenu,
    openDirectory,
    openEntry,
    setSortOpen,
    setForm,
    setUrlInputInvalid,
  };
}
