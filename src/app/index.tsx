import { useFocusEffect, router } from 'expo-router';
import { Image } from 'expo-image';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  ChevronLeft,
  CircleEllipsis,
  Cloud,
  FilePlus2,
  Folder,
  FolderPlus,
  Info,
  Plus,
  Search,
  Settings,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useEffectEvent, useReducer, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useToast } from '@/components/app-toast';
import { BookCard } from '@/components/book-card';
import { InkButton } from '@/components/ink-button';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { clearBooksGroup, createGroupForBooks, deleteBooks, getBook, listGroups, searchBooks, updateGroupName } from '@/lib/books';
import { importPickedBooks } from '@/lib/importBooks';
import { useTranslation, type I18nKey } from '@/lib/i18n';
import { clearLastReaderBookId, getLastReaderBookId } from '@/lib/lastReader';
import { INTERACTION_ANIMATION_MS, animateLayoutIfEnabled, modalAnimationType, useEinkOptimization } from '@/lib/motion';
import { loadSortState, saveSortState } from '@/lib/settings';
import { useAppTheme, type AppColors } from '@/lib/theme';
import { useWebDavImport, type WebDavImportSnapshot } from '@/lib/webdavImportQueue';
import type { Book, BookGroup, SortField, SortState } from '@/types/reader';

type FolderItem = BookGroup & { books: Book[] };
type ShelfItem = { type: 'book'; book: Book } | { type: 'folder'; folder: FolderItem } | { type: 'import' };

type ShelfScreenState = {
  books: Book[];
  groups: BookGroup[];
  activeGroupId: string | null;
  query: string;
  loading: boolean;
  importing: boolean;
  showImportOptions: boolean;
  renameGroupOpen: boolean;
  renameGroupName: string;
  sort: SortState;
  showSort: boolean;
  sortMenuFrame: { x: number; y: number; width: number; height: number } | null;
  selectedIds: string[];
  selectedFolderId: string | null;
};

const initialShelfScreenState: ShelfScreenState = {
  books: [],
  groups: [],
  activeGroupId: null,
  query: '',
  loading: true,
  importing: false,
  showImportOptions: false,
  renameGroupOpen: false,
  renameGroupName: '',
  sort: { field: 'title', direction: 'asc' },
  showSort: false,
  sortMenuFrame: null,
  selectedIds: [],
  selectedFolderId: null,
};

type ShelfScreenAction = Partial<ShelfScreenState> | ((state: ShelfScreenState) => Partial<ShelfScreenState>);

function shelfScreenReducer(state: ShelfScreenState, action: ShelfScreenAction): ShelfScreenState {
  return { ...state, ...(typeof action === 'function' ? action(state) : action) };
}

function resolveShelfStateAction<T>(action: React.SetStateAction<T>, current: T): T {
  return typeof action === 'function' ? (action as (value: T) => T)(current) : action;
}

function shelfItemKey(item: ShelfItem) {
  if (item.type === 'book') return item.book.id;
  if (item.type === 'folder') return `folder-${item.folder.id}`;
  return 'import-tile';
}

const sortLabels: Record<SortField, string> = {
  updatedAt: 'shelfSortRecent',
  title: 'shelfSortTitle',
  author: 'shelfSortAuthor',
  progress: 'shelfSortProgress',
};

const SORT_POPOVER_WIDTH = 156;

function useShelfScreenController() {
  const { width, height } = useWindowDimensions();
  const { t, language } = useTranslation();
  const showToast = useToast();
  const { colors } = useAppTheme();
  const einkOptimization = useEinkOptimization();
  const [screenState, setScreenState] = useReducer(shelfScreenReducer, initialShelfScreenState);
  const {
    books,
    groups,
    activeGroupId,
    query,
    loading,
    importing,
    showImportOptions,
    renameGroupOpen,
    renameGroupName,
    sort,
    showSort,
    sortMenuFrame,
    selectedIds,
    selectedFolderId,
  } = screenState;
  const setBooks = (value: React.SetStateAction<Book[]>) =>
    setScreenState((current) => ({ books: resolveShelfStateAction(value, current.books) }));
  const setGroups = (value: React.SetStateAction<BookGroup[]>) =>
    setScreenState((current) => ({ groups: resolveShelfStateAction(value, current.groups) }));
  const setActiveGroupId = (value: React.SetStateAction<string | null>) =>
    setScreenState((current) => ({ activeGroupId: resolveShelfStateAction(value, current.activeGroupId) }));
  const setQuery = (query: string) => setScreenState({ query });
  const setLoading = (loading: boolean) => setScreenState({ loading });
  const setImporting = (importing: boolean) => setScreenState({ importing });
  const setShowImportOptions = (showImportOptions: boolean) => setScreenState({ showImportOptions });
  const setRenameGroupOpen = (renameGroupOpen: boolean) => setScreenState({ renameGroupOpen });
  const setRenameGroupName = (renameGroupName: string) => setScreenState({ renameGroupName });
  const setSort = (sort: SortState) => setScreenState({ sort });
  const setShowSort = (showSort: boolean) => setScreenState({ showSort });
  const setSortMenuFrame = (sortMenuFrame: ShelfScreenState['sortMenuFrame']) => setScreenState({ sortMenuFrame });
  const setSelectedIds = (value: React.SetStateAction<string[]>) =>
    setScreenState((current) => ({ selectedIds: resolveShelfStateAction(value, current.selectedIds) }));
  const setSelectedFolderId = (value: React.SetStateAction<string | null>) =>
    setScreenState((current) => ({ selectedFolderId: resolveShelfStateAction(value, current.selectedFolderId) }));
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

  const refresh = useCallback(async (options?: { showLoading?: boolean }) => {
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
        const [nextBooks, nextGroups] = await Promise.all([searchBooks(queryRef.current, nextSort), listGroups()]);
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
  }, [showToast, t]);

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
            const dateLabel = new Date().toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN', { month: 'numeric', day: 'numeric' });
            const nextGroup = await createGroupForBooks(selectedIds, t('defaultFolderName', { date: dateLabel }));
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
    Alert.alert(t('ungroup'), t('ungroupFolderMessage', { name: folderSelection.name, count: folderSelection.books.length }), [
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
    ]);
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

export default function ShelfScreen() {
  const controller = useShelfScreenController();
  const {
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
  } = controller;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ShelfHeader
        colors={colors}
        query={query}
        bookCount={books.length}
        moreButtonRef={moreButtonRef}
        t={t}
        onChangeQuery={updateQuery}
        onToggleSortMenu={toggleSortMenu}
      />
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <FlatList
          data={shelfItems}
          keyExtractor={shelfItemKey}
          numColumns={3}
          columnWrapperStyle={[styles.gridRow, { gap: gridGap }]}
          contentContainerStyle={[styles.gridContent, selectionMode && styles.listWithSheet]}
          ListHeaderComponent={
            hasListHeader ? (
              <ShelfListHeader
                colors={colors}
                activeGroup={activeGroup}
                webDavImport={webDavImport}
                onBack={leaveGroup}
                onRename={openRenameGroup}
              />
            ) : undefined
          }
          renderItem={renderShelfItem}
        />
      )}

      {selectionMode ? (
        <View style={[styles.selectionSheet, { borderColor: colors.accent, backgroundColor: colors.surface }]}>
          <Text style={[styles.selectionTitle, { color: colors.text }]}>
            {folderSelection ? t('selectedFolder') : t('selectedBooks', { count: selectedCount })}
          </Text>
          <View style={styles.sheetActions}>
            {folderSelection ? (
              <InkButton colors={colors} label={t('ungroup')} icon={FolderPlus} onPress={ungroupSelectedFolder} />
            ) : (
              <>
                <InkButton
                  colors={colors}
                  label={activeGroupId ? t('ungroup') : t('group')}
                  icon={FolderPlus}
                  disabled={activeGroupId ? selectedCount < 1 : selectedCount < 2}
                  onPress={activeGroupId ? ungroupSelection : createGroupSelection}
                />
                <InkButton
                  colors={colors}
                  label={t('details')}
                  icon={Info}
                  disabled={selectedCount !== 1}
                  onPress={() => router.push({ pathname: '/book/[bookId]', params: { bookId: selectedIds[0] } })}
                />
                <InkButton colors={colors} label={t('delete')} icon={Trash2} variant="danger" onPress={deleteSelection} />
              </>
            )}
          </View>
        </View>
      ) : null}

      <Modal visible={showSort} transparent animationType={modalAnimationType(einkOptimization)} onRequestClose={() => setShowSort(false)}>
        <View style={styles.sortModalLayer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('closeSortMenu')}
            onPress={() => setShowSort(false)}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.sortPopover,
              { borderColor: colors.border, backgroundColor: colors.surface },
              {
                top: sortMenuFrame ? sortMenuFrame.y + sortMenuFrame.height + Spacing.one : Spacing.six,
                right: sortMenuFrame
                  ? Math.max(Spacing.three, width - sortMenuFrame.x - sortMenuFrame.width)
                  : Spacing.three,
                maxHeight: Math.max(TouchTarget * 2, height - (sortMenuFrame ? sortMenuFrame.y + sortMenuFrame.height : 0) - Spacing.four),
              },
            ]}>
            {(Object.keys(sortLabels) as SortField[]).map((field) => {
              const selected = field === sort.field;
              return (
                <Pressable
                  key={field}
                  accessibilityRole="button"
                  accessibilityLabel={t('sortBy', { label: t(sortLabels[field] as I18nKey) })}
                  onPress={() => setSortField(field)}
                  style={({ pressed }) => [
                    styles.sortMenuItem,
                    selected && [styles.sortMenuItemSelected, { backgroundColor: colors.accent }],
                    pressed && styles.sortMenuItemPressed,
                  ]}>
                  <View style={styles.sortMenuIconSlot}>
                    {selected ? <Check size={18} color={colors.surface} strokeWidth={3} /> : null}
                  </View>
                  <Text style={[styles.sortMenuText, { color: colors.text }, selected && { color: colors.surface }]}>
                    {t(sortLabels[field] as I18nKey)}
                  </Text>
                </Pressable>
              );
            })}
            <View style={[styles.sortMenuSeparator, { backgroundColor: colors.border }]} />
            {([
              { direction: 'asc', label: t('ascending'), icon: ArrowDownAZ },
              { direction: 'desc', label: t('descending'), icon: ArrowUpAZ },
            ] as const).map((item) => {
              const selected = item.direction === sort.direction;
              const Icon = item.icon;
              return (
                <Pressable
                  key={item.direction}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  onPress={() => setSortDirection(item.direction)}
                  style={({ pressed }) => [
                    styles.sortMenuItem,
                    selected && [styles.sortMenuItemSelected, { backgroundColor: colors.accent }],
                    pressed && styles.sortMenuItemPressed,
                  ]}>
                  <Icon size={18} color={selected ? colors.surface : colors.text} />
                  <Text style={[styles.sortMenuText, { color: colors.text }, selected && { color: colors.surface }]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>

      <Modal visible={showImportOptions} transparent animationType="none" onRequestClose={() => closeImportOptions()}>
        <View style={styles.importModalLayer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('closeImportOptions')}
            onPress={() => closeImportOptions()}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            style={[
              styles.importSheet,
              { borderColor: colors.border, backgroundColor: colors.surface },
              importSheetStyle,
            ]}>
            <Text style={[styles.importSheetTitle, { color: colors.text }]}>{t('addBooks')}</Text>
            <Text style={[styles.importSheetHint, { color: colors.textSecondary }]}>{t('chooseImportSource')}</Text>
            <View style={styles.importActions}>
              <ImportAction
                colors={colors}
                icon={FilePlus2}
                title={t('localFiles')}
                description={t('localFilesDesc')}
                onPress={onImport}
              />
              <ImportAction
                colors={colors}
                icon={Cloud}
                title="WebDAV"
                description={t('webdavDesc')}
                onPress={() => {
                  closeImportOptions(() => router.push('/webdav'));
                }}
              />
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={renameGroupOpen} transparent animationType={modalAnimationType(einkOptimization)} onRequestClose={() => setRenameGroupOpen(false)}>
        <View style={styles.renameModalLayer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('renameFolder')}
            onPress={() => setRenameGroupOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.renameCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.renameTitle, { color: colors.text }]}>{t('renameFolder')}</Text>
            <TextInput
              accessibilityLabel={t('folderName')}
              value={renameGroupName}
              onChangeText={setRenameGroupName}
              autoFocus
              selectTextOnFocus
              style={[styles.renameInput, { borderColor: colors.border, color: colors.text }]}
            />
            <View style={styles.renameActions}>
              <InkButton colors={colors} label={t('cancel')} variant="quiet" onPress={() => setRenameGroupOpen(false)} />
              <InkButton colors={colors} label={t('save')} variant="primary" disabled={!renameGroupName.trim()} onPress={saveRenameGroup} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ShelfListHeader({
  colors,
  activeGroup,
  webDavImport,
  onBack,
  onRename,
}: {
  colors: AppColors;
  activeGroup: BookGroup | null;
  webDavImport: WebDavImportSnapshot;
  onBack: () => void;
  onRename: () => void;
}) {
  const { t } = useTranslation();
  if (!activeGroup && webDavImport.status === 'idle') return null;

  return (
    <View style={styles.listHeaderStack}>
      {webDavImport.status === 'idle' ? null : (
        <WebDavImportProgressRow colors={colors} state={webDavImport} />
      )}
      {activeGroup ? (
        <View style={[styles.groupHeader, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('backToShelf')}
            onPress={onBack}
            style={({ pressed }) => [styles.groupBackButton, pressed && styles.sortMenuItemPressed]}>
            <ChevronLeft size={22} color={colors.text} strokeWidth={2.4} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('renameFolder')}
            onPress={onRename}
            style={({ pressed }) => [styles.groupHeaderCopy, pressed && styles.sortMenuItemPressed]}>
            <Text style={[styles.groupHeaderTitle, { color: colors.text }]} numberOfLines={1}>
              {activeGroup.name}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function WebDavImportProgressRow({
  colors,
  state,
}: {
  colors: AppColors;
  state: WebDavImportSnapshot;
}) {
  const { t } = useTranslation();
  const progress = state.total > 0 ? Math.min(1, state.completed / state.total) : 0;
  const progressLabel = state.total > 0 ? `${state.completed}/${state.total}` : t('preparing');
  const title =
    state.status === 'running'
      ? t('webdavImporting')
      : state.status === 'success'
        ? t('webdavImportSuccess')
        : t('webdavImportFailed');
  const detail = state.message ?? progressLabel;

  return (
    <View style={[styles.webDavImportRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.webDavImportCopy}>
        <Text style={[styles.webDavImportTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.webDavImportMeta, { color: colors.textSecondary }]} numberOfLines={1}>
          {state.status === 'running' ? progressLabel : detail}
        </Text>
      </View>
      {state.status === 'running' ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <Text style={[styles.webDavImportResult, { color: colors.textSecondary }]}>{t('importedBooks', { count: state.imported })}</Text>
      )}
      <View style={[styles.webDavImportTrack, { backgroundColor: colors.backgroundElement }]}>
        <View style={[styles.webDavImportFill, { backgroundColor: colors.accent, width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

function FolderCard({
  folder,
  width,
  colors,
  selected,
  onPress,
  onLongPress,
}: {
  folder: FolderItem;
  width: number;
  colors: AppColors;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { t } = useTranslation();
  const previews = folder.books.slice(0, 9);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${folder.name}, ${t('booksCount', { count: folder.books.length })}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.folderCard, { width }, pressed && styles.sortMenuItemPressed]}>
      <View
        style={[
          styles.folderCover,
          { height: width * 1.44, borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.surface },
          selected && styles.folderCoverSelected,
        ]}>
        <View style={[styles.folderTab, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]} />
        <View style={styles.folderPreviewGrid}>
          {previews.map((book) => (
            <View key={book.id} style={[styles.folderPreview, { borderColor: colors.border, backgroundColor: colors.background }]}>
              {book.coverUri ? (
                <Image source={{ uri: book.coverUri }} style={styles.folderPreviewImage} contentFit="cover" />
              ) : (
                <Folder size={14} color={colors.textSecondary} strokeWidth={2} />
              )}
            </View>
          ))}
        </View>
        {selected ? (
          <View style={[styles.folderSelectedBadge, { backgroundColor: colors.accent }]}>
            <Check size={18} color={colors.surface} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <View style={styles.meta}>
        <Text style={[styles.folderTitle, { color: colors.text }]} numberOfLines={2}>
          {folder.name}
        </Text>
        <Text style={[styles.folderCount, { color: colors.textSecondary }]}>{t('booksCount', { count: folder.books.length })}</Text>
      </View>
    </Pressable>
  );
}

function ImportAction({
  colors,
  icon: Icon,
  title,
  description,
  onPress,
}: {
  colors: AppColors;
  icon: LucideIcon;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.importAction,
        { borderColor: colors.border, backgroundColor: colors.background },
        pressed && styles.sortMenuItemPressed,
      ]}>
      <View style={[styles.importActionIcon, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Icon size={24} color={colors.text} strokeWidth={2.2} />
      </View>
      <View style={styles.importActionCopy}>
        <Text style={[styles.importActionTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.importActionDescription, { color: colors.textSecondary }]}>{description}</Text>
      </View>
    </Pressable>
  );
}

function ShelfHeader({
  colors,
  query,
  bookCount,
  moreButtonRef,
  t,
  onChangeQuery,
  onToggleSortMenu,
}: {
  colors: AppColors;
  query: string;
  bookCount: number;
  moreButtonRef: React.RefObject<View | null>;
  t: ReturnType<typeof useTranslation>['t'];
  onChangeQuery: (text: string) => void;
  onToggleSortMenu: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.topControls}>
        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Search size={20} color={colors.textSecondary} strokeWidth={2.2} />
          <TextInput
            accessibilityLabel={t('searchBooks')}
            placeholder={t('searchBooksPlaceholder', { count: bookCount })}
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={onChangeQuery}
            style={[styles.searchInput, { color: colors.text }]}
          />
        </View>
        <View ref={moreButtonRef} style={styles.moreMenuAnchor}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('sort')}
            onPress={onToggleSortMenu}
            style={[styles.headerIconButton, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <CircleEllipsis size={24} color={colors.text} strokeWidth={2.2} />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings')}
          onPress={() => router.push('/settings')}
          style={[styles.headerIconButton, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Settings size={24} color={colors.text} strokeWidth={2.2} />
        </Pressable>
      </View>
    </View>
  );
}

function ImportTile({
  width,
  importing,
  colors,
  onPress,
}: {
  width: number;
  importing: boolean;
  colors: AppColors;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('importBooks')}
      disabled={importing}
      onPress={onPress}
      style={({ pressed }) => [
        styles.importTile,
        { borderColor: colors.border, backgroundColor: colors.surfaceMuted },
        {
          width,
          height: width * 1.44,
          opacity: importing ? 0.45 : pressed ? 0.65 : 1,
        },
      ]}>
      <Plus size={42} color={colors.text} strokeWidth={1.8} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
  },
  gridRow: {
    alignItems: 'flex-start',
  },
  listHeaderStack: {
    gap: Spacing.two,
  },
  groupHeader: {
    minHeight: 56,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  groupBackButton: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupHeaderCopy: {
    flex: 1,
    minHeight: TouchTarget,
    justifyContent: 'center',
  },
  groupHeaderTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    color: Colors.light.text,
  },
  webDavImportRow: {
    minHeight: 58,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    overflow: 'hidden',
  },
  webDavImportCopy: {
    flex: 1,
    gap: 2,
  },
  webDavImportTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    color: Colors.light.text,
  },
  webDavImportMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: Colors.light.textSecondary,
  },
  webDavImportResult: {
    minWidth: 42,
    textAlign: 'right',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: Colors.light.textSecondary,
  },
  webDavImportTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: Colors.light.backgroundElement,
  },
  webDavImportFill: {
    height: 3,
    backgroundColor: Colors.light.accent,
  },
  listWithSheet: {
    paddingBottom: 144,
  },
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    zIndex: 20,
  },
  topControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    overflow: 'visible',
  },
  headerIconButton: {
    width: TouchTarget,
    height: TouchTarget,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flex: 1,
    minHeight: 52,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.three,
    paddingRight: Spacing.three,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    fontSize: 16,
    color: Colors.light.text,
    paddingHorizontal: Spacing.two,
  },
  moreMenuAnchor: {
    position: 'relative',
    zIndex: 30,
  },
  sortModalLayer: {
    flex: 1,
  },
  sortPopover: {
    position: 'absolute',
    width: SORT_POPOVER_WIDTH,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingVertical: Spacing.one,
    zIndex: 40,
    boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
  },
  sortMenuItem: {
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sortMenuItemSelected: {
    backgroundColor: Colors.light.accent,
  },
  sortMenuItemPressed: {
    opacity: 0.72,
  },
  sortMenuIconSlot: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortMenuSeparator: {
    height: 1,
    marginVertical: Spacing.one,
    backgroundColor: Colors.light.border,
  },
  sortMenuText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.light.text,
  },
  sortMenuTextSelected: {
    color: Colors.light.surface,
  },
  importModalLayer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,25,35,0.22)',
  },
  importSheet: {
    marginHorizontal: 0,
    marginBottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  importSheetTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
    color: Colors.light.text,
  },
  importSheetHint: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    marginBottom: Spacing.one,
  },
  importActions: {
    gap: Spacing.two,
  },
  importAction: {
    minHeight: 74,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surfaceMuted,
    padding: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  importActionIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importActionCopy: {
    flex: 1,
    gap: 2,
  },
  importActionTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    color: Colors.light.text,
  },
  importActionDescription: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  renameModalLayer: {
    flex: 1,
    padding: Spacing.three,
    backgroundColor: 'rgba(20,25,35,0.22)',
    justifyContent: 'center',
  },
  renameCard: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  renameTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
    color: Colors.light.text,
  },
  renameInput: {
    minHeight: TouchTarget,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: Spacing.three,
    fontSize: 17,
    fontWeight: '700',
    color: Colors.light.text,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  importTile: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderCard: {
    gap: Spacing.two,
  },
  folderCover: {
    width: '100%',
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surfaceMuted,
    padding: Spacing.two,
    overflow: 'hidden',
  },
  folderCoverSelected: {
    borderWidth: 3,
  },
  folderTab: {
    position: 'absolute',
    top: -1,
    left: Spacing.two,
    width: '52%',
    height: 18,
    borderTopLeftRadius: Radius.small,
    borderTopRightRadius: Radius.small,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundElement,
  },
  folderPreviewGrid: {
    flex: 1,
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    gap: 4,
  },
  folderPreview: {
    width: '30%',
    aspectRatio: 0.72,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  folderPreviewImage: {
    width: '100%',
    height: '100%',
  },
  folderSelectedBadge: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.light.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    gap: Spacing.one,
  },
  folderTitle: {
    minHeight: 40,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    color: Colors.light.text,
  },
  folderCount: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: Colors.light.textSecondary,
  },
  selectionSheet: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  selectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.light.text,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
