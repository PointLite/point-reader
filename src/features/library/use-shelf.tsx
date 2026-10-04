import { BookCard } from '@/features/library/book-card';
import { importPickedBooks } from '@/features/library/import';
import {
  clearBooksGroup,
  createGroupForBooks,
  deleteBooks,
  getBook,
  listGroups,
  searchBooks,
  updateGroupName,
} from '@/features/library/repository';
import { FolderCard, ImportTile } from '@/features/library/shelf-components';
import { type FolderItem, type ShelfItem } from '@/features/library/shelf-model';
import type { Book, BookGroup, SortField, SortState } from '@/features/library/types';
import { clearLastReaderBookId, getLastReaderBookId } from '@/features/reader/last-reader';
import { loadSortState, saveSortState } from '@/features/settings/store';
import { useWebDavImport } from '@/features/webdav/import-queue';
import { useTranslation } from '@/shared/i18n/index';
import { INTERACTION_ANIMATION_MS, animateLayoutIfEnabled, useEinkOptimization } from '@/shared/theme/motion';
import { useAppTheme } from '@/shared/theme/theme';
import { Spacing } from '@/shared/theme/tokens';
import { useToast } from '@/shared/ui/app-toast';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Alert, View, useWindowDimensions } from 'react-native';
import { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export function useShelfScreenController() {
  const { width, height } = useWindowDimensions();
  const { t, language } = useTranslation();
  const showToast = useToast();
  const { colors } = useAppTheme();
  const einkOptimization = useEinkOptimization();
  const [books, setBooks] = useState<Book[]>([]);
  const [groups, setGroups] = useState<BookGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [query, setQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [importing, setImporting] = useState<boolean>(false);
  const [showImportOptions, setShowImportOptions] = useState<boolean>(false);
  const [renameGroupOpen, setRenameGroupOpen] = useState<boolean>(false);
  const [renameGroupName, setRenameGroupName] = useState<string>('');
  const [sort, setSort] = useState<SortState>({ field: 'title', direction: 'asc' });
  const [showSort, setShowSort] = useState<boolean>(false);
  const [sortMenuFrame, setSortMenuFrame] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const moreButtonRef = useRef<View>(null);
  const queryRef = useRef('');
  const sortRef = useRef<SortState>({ field: 'title', direction: 'asc' });
  const handledWebDavImportRef = useRef(0);
  const hasLoadedShelfRef = useRef(false);
  const refreshRequestRef = useRef(0);
  const restoredLastReaderRef = useRef(false);
  const importSheetProgress = useSharedValue(0);
  const importSheetCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webDavImport = useWebDavImport();
  const importSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: 360 * (1 - importSheetProgress.get()) }],
  }));
  const clearImportSheetCloseTimer = useEffectEvent(() => {
    const closeTimer = importSheetCloseTimerRef.current;
    if (closeTimer) clearTimeout(closeTimer);
    importSheetCloseTimerRef.current = null;
  });

  const selectedIdSet = new Set(selectedIds);
  const gridGap = Spacing.three;
  const horizontalPadding = Spacing.three * 2;
  const bookWidth = Math.floor((width - horizontalPadding - gridGap * 2) / 3);
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null;
  const booksByGroupId = (() => {
    const next = new Map<string, Book[]>();
    for (const book of books) {
      if (!book.groupId) continue;
      const groupBooks = next.get(book.groupId);
      if (groupBooks) {
        groupBooks.push(book);
      } else {
        next.set(book.groupId, [book]);
      }
    }
    return next;
  })();
  const folders = (() => {
    const next: FolderItem[] = [];
    for (const group of groups) {
      const groupBooks = booksByGroupId.get(group.id) ?? [];
      if (groupBooks.length > 0) {
        next.push({
          ...group,
          books: groupBooks,
        });
      }
    }
    return next;
  })();
  const folderSelection = folders.find((folder) => folder.id === selectedFolderId) ?? null;
  const selectionMode = selectedIds.length > 0 || Boolean(folderSelection);
  const bookSelectionMode = selectedIds.length > 0;
  const hasListHeader = Boolean(activeGroup) || webDavImport.status !== 'idle';
  const shelfItems: ShelfItem[] = (() => {
    if (activeGroupId) {
      const activeBooks: ShelfItem[] = [];
      for (const book of books) {
        if (book.groupId === activeGroupId) {
          activeBooks.push({ type: 'book', book });
        }
      }
      return activeBooks;
    }

    const rootBooks: ShelfItem[] = [];
    for (const book of books) {
      if (!book.groupId) {
        rootBooks.push({ type: 'book', book });
      }
    }
    return [
      ...folders.map((folder) => ({ type: 'folder' as const, folder })),
      ...rootBooks,
      { type: 'import' },
    ];
  })();

  const refresh = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const requestId = refreshRequestRef.current + 1;
      refreshRequestRef.current = requestId;
      const shouldShowLoading = options?.showLoading ?? !hasLoadedShelfRef.current;
      if (shouldShowLoading) {
        setLoading(true);
      }
      try {
        const nextSort = await loadSortState();
        if (refreshRequestRef.current === requestId) {
          sortRef.current = nextSort;
          setSort(nextSort);
          const [nextBooks, nextGroups] = await Promise.all([
            searchBooks(queryRef.current, nextSort),
            listGroups(),
          ]);
          if (refreshRequestRef.current === requestId) {
            setBooks(nextBooks);
            setGroups(nextGroups);
            hasLoadedShelfRef.current = true;
          }
        }
      } catch (error) {
        if (refreshRequestRef.current === requestId) {
          showToast(error instanceof Error ? error.message : t('operationFailed'));
        }
      }
      if (refreshRequestRef.current === requestId && shouldShowLoading) {
        setLoading(false);
      }
    },
    [showToast, t]
  );

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    if (restoredLastReaderRef.current) return;
    restoredLastReaderRef.current = true;
    let mounted = true;
    async function restoreLastReader() {
      try {
        const lastBookId = await getLastReaderBookId();
        if (!mounted || !lastBookId) return;
        const lastBook = await getBook(lastBookId);
        if (!mounted) return;
        if (!lastBook) {
          await clearLastReaderBookId(lastBookId);
          return;
        }
        router.replace({ pathname: '/reader/[bookId]', params: { bookId: lastBook.id, entry: 'restore' } });
      } catch (error) {
        if (mounted) {
          showToast(error instanceof Error ? error.message : t('operationFailed'));
        }
      }
    }
    void restoreLastReader();
    return () => {
      mounted = false;
    };
  }, [showToast, t]);

  useEffect(() => {
    if (webDavImport.status !== 'success') return;
    if (handledWebDavImportRef.current === webDavImport.updatedAt) return;
    handledWebDavImportRef.current = webDavImport.updatedAt;
    void refresh();
  }, [refresh, webDavImport.status, webDavImport.updatedAt]);

  useEffect(() => {
    if (webDavImport.status !== 'error' || !webDavImport.message) return;
    if (handledWebDavImportRef.current === webDavImport.updatedAt) return;
    handledWebDavImportRef.current = webDavImport.updatedAt;
    showToast(webDavImport.message);
  }, [showToast, webDavImport.message, webDavImport.status, webDavImport.updatedAt]);

  useEffect(() => {
    return () => {
      clearImportSheetCloseTimer();
      cancelAnimation(importSheetProgress);
    };
  }, [importSheetProgress]);

  const selectedCount = selectedIds.length;

  const toggleSortMenu = () => {
    animateLayoutIfEnabled(einkOptimization);
    if (showSort) {
      setShowSort(false);
      return;
    }

    moreButtonRef.current?.measureInWindow((x, y, frameWidth, frameHeight) => {
      setSortMenuFrame({ x, y, width: frameWidth, height: frameHeight });
      setShowSort(true);
    });
  };

  const applySort = async (next: SortState) => {
    try {
      sortRef.current = next;
      setSort(next);
      await saveSortState(next);
      setBooks(await searchBooks(queryRef.current, next));
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('operationFailed'));
    }
  };

  const setSortField = async (field: SortField) => {
    if (field === sort.field) return;
    await applySort({ ...sort, field });
  };

  const setSortDirection = async (direction: SortState['direction']) => {
    if (direction === sort.direction) return;
    await applySort({ ...sort, direction });
  };

  const runLocalImport = async () => {
    setImporting(true);
    try {
      await importPickedBooks();
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('importFilePickerFailed'));
    }
    setImporting(false);
  };

  const closeImportOptions = (afterClose?: () => void) => {
    if (!showImportOptions) {
      afterClose?.();
      return;
    }
    if (importSheetCloseTimerRef.current) {
      clearTimeout(importSheetCloseTimerRef.current);
      importSheetCloseTimerRef.current = null;
    }
    if (einkOptimization) {
      cancelAnimation(importSheetProgress);
      importSheetProgress.set(1);
      setShowImportOptions(false);
      afterClose?.();
      return;
    }
    cancelAnimation(importSheetProgress);
    importSheetProgress.set(withTiming(0, { duration: INTERACTION_ANIMATION_MS }));
    importSheetCloseTimerRef.current = setTimeout(() => {
      importSheetCloseTimerRef.current = null;
      setShowImportOptions(false);
      afterClose?.();
    }, INTERACTION_ANIMATION_MS);
  };

  const onImport = () => {
    animateLayoutIfEnabled(einkOptimization);
    closeImportOptions(() => {
      void runLocalImport();
    });
  };

  const openImportOptions = () => {
    if (importSheetCloseTimerRef.current) {
      clearTimeout(importSheetCloseTimerRef.current);
      importSheetCloseTimerRef.current = null;
    }
    cancelAnimation(importSheetProgress);
    importSheetProgress.set(einkOptimization ? 1 : 0);
    setShowImportOptions(true);
    if (einkOptimization) return;
    requestAnimationFrame(() => {
      importSheetProgress.set(withTiming(1, { duration: INTERACTION_ANIMATION_MS }));
    });
  };

  const toggleSelected = (id: string) => {
    animateLayoutIfEnabled(einkOptimization);
    setSelectedFolderId(null);
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const selectFolder = (groupId: string) => {
    animateLayoutIfEnabled(einkOptimization);
    setSelectedIds([]);
    setSelectedFolderId((current) => (current === groupId ? null : groupId));
  };

  const enterGroup = (groupId: string) => {
    setSelectedIds([]);
    setSelectedFolderId(null);
    setActiveGroupId(groupId);
  };

  const leaveGroup = () => {
    setSelectedIds([]);
    setSelectedFolderId(null);
    setActiveGroupId(null);
  };

  const createGroupSelection = () => {
    if (selectedCount < 2) return;
    Alert.alert(t('createFolder'), t('createFolderMessage', { count: selectedCount }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('create'),
        onPress: async () => {
          try {
            const dateLabel = new Date().toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN', {
              month: 'numeric',
              day: 'numeric',
            });
            const nextGroup = await createGroupForBooks(
              selectedIds,
              t('defaultFolderName', { date: dateLabel })
            );
            setSelectedIds([]);
            setActiveGroupId(null);
            await refresh();
            setActiveGroupId(nextGroup.id);
          } catch (error) {
            showToast(error instanceof Error ? error.message : t('operationFailed'));
          }
        },
      },
    ]);
  };

  const ungroupSelection = () => {
    if (!activeGroupId || selectedCount < 1) return;
    Alert.alert(t('ungroup'), t('ungroupBooksMessage', { count: selectedCount }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('moveOut'),
        onPress: async () => {
          try {
            await clearBooksGroup(selectedIds);
            setSelectedIds([]);
            await refresh();
          } catch (error) {
            showToast(error instanceof Error ? error.message : t('operationFailed'));
          }
        },
      },
    ]);
  };

  const ungroupSelectedFolder = () => {
    if (!folderSelection) return;
    Alert.alert(
      t('ungroup'),
      t('ungroupFolderMessage', { name: folderSelection.name, count: folderSelection.books.length }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('moveOut'),
          onPress: async () => {
            try {
              await clearBooksGroup(folderSelection.books.map((book) => book.id));
              setSelectedFolderId(null);
              await refresh();
            } catch (error) {
              showToast(error instanceof Error ? error.message : t('operationFailed'));
            }
          },
        },
      ]
    );
  };

  const openRenameGroup = () => {
    if (!activeGroup) return;
    setRenameGroupName(activeGroup.name);
    setRenameGroupOpen(true);
  };

  const saveRenameGroup = async () => {
    if (!activeGroup) return;
    try {
      await updateGroupName(activeGroup.id, renameGroupName);
      setRenameGroupOpen(false);
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('operationFailed'));
    }
  };

  const deleteSelection = () => {
    Alert.alert(t('deleteBooks'), t('deleteBooksMessage', { count: selectedCount }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBooks(selectedIds);
            setSelectedIds([]);
            await refresh();
          } catch (error) {
            showToast(error instanceof Error ? error.message : t('operationFailed'));
          }
        },
      },
    ]);
  };

  const updateQuery = async (text: string) => {
    queryRef.current = text;
    setQuery(text);
    try {
      setBooks(await searchBooks(text, sortRef.current));
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('operationFailed'));
    }
  };

  const renderShelfItem = ({ item }: { item: ShelfItem }) =>
    item.type === 'import' ? (
      <ImportTile width={bookWidth} importing={importing} colors={colors} onPress={openImportOptions} />
    ) : item.type === 'folder' ? (
      <FolderCard
        folder={item.folder}
        width={bookWidth}
        colors={colors}
        selected={selectedFolderId === item.folder.id}
        onPress={() => enterGroup(item.folder.id)}
        onLongPress={() => selectFolder(item.folder.id)}
      />
    ) : (
      <BookCard
        book={item.book}
        width={bookWidth}
        colors={colors}
        selected={selectedIdSet.has(item.book.id)}
        selectionMode={bookSelectionMode}
        onLongPress={() => toggleSelected(item.book.id)}
        onPress={() => {
          if (selectionMode) {
            toggleSelected(item.book.id);
          } else {
            router.push({ pathname: '/reader/[bookId]', params: { bookId: item.book.id } });
          }
        }}
      />
    );

  return {
    activeGroup,
    activeGroupId,
    books,
    closeImportOptions,
    colors,
    createGroupSelection,
    deleteSelection,
    einkOptimization,
    folderSelection,
    gridGap,
    hasListHeader,
    height,
    importSheetStyle,
    leaveGroup,
    loading,
    moreButtonRef,
    onImport,
    openRenameGroup,
    query,
    renameGroupName,
    renameGroupOpen,
    renderShelfItem,
    saveRenameGroup,
    selectedCount,
    selectedIds,
    selectionMode,
    setRenameGroupName,
    setRenameGroupOpen,
    setShowSort,
    setSortDirection,
    setSortField,
    shelfItems,
    showImportOptions,
    showSort,
    sort,
    sortMenuFrame,
    t,
    toggleSortMenu,
    ungroupSelectedFolder,
    ungroupSelection,
    updateQuery,
    webDavImport,
    width,
  };
}
