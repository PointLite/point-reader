import { useFocusEffect, router } from 'expo-router';
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
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCard } from '@/components/book-card';
import { InkButton } from '@/components/ink-button';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { clearBooksGroup, createGroupForBooks, deleteBooks, getBook, listGroups, searchBooks, updateGroupName } from '@/lib/books';
import { importPickedBooks } from '@/lib/importBooks';
import { clearLastReaderBookId, getLastReaderBookId } from '@/lib/lastReader';
import { INTERACTION_ANIMATION_MS, animateLayoutIfEnabled, modalAnimationType, useEinkOptimization } from '@/lib/motion';
import { loadSortState, saveSortState } from '@/lib/settings';
import { useAppTheme, type AppColors } from '@/lib/theme';
import { useWebDavImport, type WebDavImportSnapshot } from '@/lib/webdavImportQueue';
import type { Book, BookGroup, SortField, SortState } from '@/types/reader';

type FolderItem = BookGroup & { books: Book[] };
type ShelfItem = { type: 'book'; book: Book } | { type: 'folder'; folder: FolderItem } | { type: 'import' };

const sortLabels: Record<SortField, string> = {
  updatedAt: '最近',
  title: '书名',
  author: '作者',
  progress: '进度',
};

const SORT_POPOVER_WIDTH = 156;

export default function ShelfScreen() {
  const { width, height } = useWindowDimensions();
  const { colors } = useAppTheme();
  const einkOptimization = useEinkOptimization();
  const [books, setBooks] = useState<Book[]>([]);
  const [groups, setGroups] = useState<BookGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [showImportOptions, setShowImportOptions] = useState(false);
  const [renameGroupOpen, setRenameGroupOpen] = useState(false);
  const [renameGroupName, setRenameGroupName] = useState('');
  const [sort, setSort] = useState<SortState>({ field: 'title', direction: 'asc' });
  const [showSort, setShowSort] = useState(false);
  const [sortMenuFrame, setSortMenuFrame] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const moreButtonRef = useRef<View>(null);
  const queryRef = useRef('');
  const sortRef = useRef<SortState>({ field: 'title', direction: 'asc' });
  const handledWebDavImportRef = useRef(0);
  const hasLoadedShelfRef = useRef(false);
  const refreshRequestRef = useRef(0);
  const restoredLastReaderRef = useRef(false);
  const importSheetProgress = useRef(new Animated.Value(0)).current;
  const importSheetAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const webDavImport = useWebDavImport();

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const gridGap = Spacing.three;
  const horizontalPadding = Spacing.three * 2;
  const bookWidth = Math.floor((width - horizontalPadding - gridGap * 2) / 3);
  const activeGroup = useMemo(
    () => groups.find((group) => group.id === activeGroupId) ?? null,
    [activeGroupId, groups]
  );
  const booksByGroupId = useMemo(() => {
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
  }, [books]);
  const folders = useMemo<FolderItem[]>(
    () =>
      groups
        .map((group) => ({
          ...group,
          books: booksByGroupId.get(group.id) ?? [],
        }))
        .filter((group) => group.books.length > 0),
    [booksByGroupId, groups]
  );
  const folderSelection = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  );
  const selectionMode = selectedIds.length > 0 || Boolean(folderSelection);
  const bookSelectionMode = selectedIds.length > 0;
  const hasListHeader = Boolean(activeGroup) || webDavImport.status !== 'idle';
  const shelfItems: ShelfItem[] = useMemo(() => {
    if (activeGroupId) {
      return books
        .filter((book) => book.groupId === activeGroupId)
        .map((book) => ({ type: 'book' as const, book }));
    }

    const rootBooks = books
      .filter((book) => !book.groupId)
      .map((book) => ({ type: 'book' as const, book }));
    return [
      ...folders.map((folder) => ({ type: 'folder' as const, folder })),
      ...rootBooks,
      { type: 'import' },
    ];
  }, [activeGroupId, books, folders]);

  const refresh = useCallback(async (options?: { showLoading?: boolean }) => {
    const requestId = refreshRequestRef.current + 1;
    refreshRequestRef.current = requestId;
    const shouldShowLoading = options?.showLoading ?? !hasLoadedShelfRef.current;
    if (shouldShowLoading) {
      setLoading(true);
    }
    const nextSort = await loadSortState();
    if (refreshRequestRef.current !== requestId) return;
    sortRef.current = nextSort;
    setSort(nextSort);
    const [nextBooks, nextGroups] = await Promise.all([searchBooks(queryRef.current, nextSort), listGroups()]);
    if (refreshRequestRef.current !== requestId) return;
    setBooks(nextBooks);
    setGroups(nextGroups);
    hasLoadedShelfRef.current = true;
    if (shouldShowLoading) {
      setLoading(false);
    }
  }, []);

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
      const lastBookId = await getLastReaderBookId();
      if (!mounted || !lastBookId) return;
      const lastBook = await getBook(lastBookId);
      if (!mounted) return;
      if (!lastBook) {
        await clearLastReaderBookId(lastBookId);
        return;
      }
      router.replace({ pathname: '/reader/[bookId]', params: { bookId: lastBook.id, entry: 'restore' } });
    }
    void restoreLastReader();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (webDavImport.status !== 'success') return;
    if (handledWebDavImportRef.current === webDavImport.updatedAt) return;
    handledWebDavImportRef.current = webDavImport.updatedAt;
    void refresh();
  }, [refresh, webDavImport.status, webDavImport.updatedAt]);

  useEffect(() => {
    return () => {
      importSheetAnimationRef.current?.stop();
    };
  }, []);

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
    sortRef.current = next;
    setSort(next);
    await saveSortState(next);
    setBooks(await searchBooks(queryRef.current, next));
  };

  const setSortField = async (field: SortField) => {
    if (field === sort.field) return;
    await applySort({ ...sort, field });
  };

  const setSortDirection = async (direction: SortState['direction']) => {
    if (direction === sort.direction) return;
    await applySort({ ...sort, direction });
  };

  const runLocalImport = useCallback(async () => {
    setImporting(true);
    try {
      await importPickedBooks();
      await refresh();
    } catch (error) {
      Alert.alert('导入失败', error instanceof Error ? error.message : '无法打开文件选择器');
    } finally {
      setImporting(false);
    }
  }, [refresh]);

  const closeImportOptions = useCallback(
    (afterClose?: () => void) => {
      if (!showImportOptions) {
        afterClose?.();
        return;
      }
      if (einkOptimization) {
        importSheetAnimationRef.current?.stop();
        importSheetProgress.setValue(1);
        setShowImportOptions(false);
        afterClose?.();
        return;
      }
      importSheetAnimationRef.current?.stop();
      const animation = Animated.timing(importSheetProgress, {
        toValue: 0,
        duration: INTERACTION_ANIMATION_MS,
        useNativeDriver: true,
      });
      importSheetAnimationRef.current = animation;
      animation.start(() => {
        importSheetAnimationRef.current = null;
        setShowImportOptions(false);
        afterClose?.();
      });
    },
    [einkOptimization, importSheetProgress, showImportOptions]
  );

  const onImport = () => {
    animateLayoutIfEnabled(einkOptimization);
    closeImportOptions(() => {
      void runLocalImport();
    });
  };

  const openImportOptions = useCallback(() => {
    importSheetAnimationRef.current?.stop();
    importSheetProgress.setValue(einkOptimization ? 1 : 0);
    setShowImportOptions(true);
    if (einkOptimization) return;
    requestAnimationFrame(() => {
      const animation = Animated.timing(importSheetProgress, {
        toValue: 1,
        duration: INTERACTION_ANIMATION_MS,
        useNativeDriver: true,
      });
      importSheetAnimationRef.current = animation;
      animation.start(() => {
        importSheetAnimationRef.current = null;
      });
    });
  }, [einkOptimization, importSheetProgress]);

  const toggleSelected = useCallback((id: string) => {
    animateLayoutIfEnabled(einkOptimization);
    setSelectedFolderId(null);
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }, [einkOptimization]);

  const selectFolder = useCallback((groupId: string) => {
    animateLayoutIfEnabled(einkOptimization);
    setSelectedIds([]);
    setSelectedFolderId((current) => (current === groupId ? null : groupId));
  }, [einkOptimization]);

  const enterGroup = useCallback((groupId: string) => {
    setSelectedIds([]);
    setSelectedFolderId(null);
    setActiveGroupId(groupId);
  }, []);

  const leaveGroup = useCallback(() => {
    setSelectedIds([]);
    setSelectedFolderId(null);
    setActiveGroupId(null);
  }, []);

  const createGroupSelection = () => {
    if (selectedCount < 2) return;
    Alert.alert('创建文件夹', `将已选 ${selectedCount} 本书归类到一个文件夹中？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '创建',
        onPress: async () => {
          const nextGroup = await createGroupForBooks(selectedIds);
          setSelectedIds([]);
          setActiveGroupId(null);
          await refresh();
          setActiveGroupId(nextGroup.id);
        },
      },
    ]);
  };

  const ungroupSelection = () => {
    if (!activeGroupId || selectedCount < 1) return;
    Alert.alert('取消分组', `将已选 ${selectedCount} 本书移出当前文件夹？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '移出',
        onPress: async () => {
          await clearBooksGroup(selectedIds);
          setSelectedIds([]);
          await refresh();
        },
      },
    ]);
  };

  const ungroupSelectedFolder = () => {
    if (!folderSelection) return;
    Alert.alert('取消分组', `将“${folderSelection.name}”中的 ${folderSelection.books.length} 本书移出文件夹？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '移出',
        onPress: async () => {
          await clearBooksGroup(folderSelection.books.map((book) => book.id));
          setSelectedFolderId(null);
          await refresh();
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
    await updateGroupName(activeGroup.id, renameGroupName);
    setRenameGroupOpen(false);
    await refresh();
  };

  const deleteSelection = () => {
    Alert.alert('删除书籍', `确定删除已选 ${selectedCount} 本书？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteBooks(selectedIds);
          setSelectedIds([]);
          await refresh();
        },
      },
    ]);
  };

  const updateQuery = useCallback(async (text: string) => {
    queryRef.current = text;
    setQuery(text);
    setBooks(await searchBooks(text, sortRef.current));
  }, []);

  const keyExtractor = useCallback((item: ShelfItem) => {
    if (item.type === 'book') return item.book.id;
    if (item.type === 'folder') return `folder-${item.folder.id}`;
    return 'import-tile';
  }, []);

  const renderShelfItem = useCallback(
    ({ item }: { item: ShelfItem }) =>
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
      ),
    [bookSelectionMode, bookWidth, colors, enterGroup, importing, openImportOptions, selectFolder, selectedFolderId, selectedIdSet, selectionMode, toggleSelected]
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ShelfHeader
        colors={colors}
        query={query}
        bookCount={books.length}
        moreButtonRef={moreButtonRef}
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
          keyExtractor={keyExtractor}
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
        <View style={[styles.selectionSheet, { borderColor: colors.text, backgroundColor: colors.surface }]}>
          <Text style={[styles.selectionTitle, { color: colors.text }]}>
            {folderSelection ? `已选择 1 个文件夹` : `已选择 ${selectedCount} 本`}
          </Text>
          <View style={styles.sheetActions}>
            {folderSelection ? (
              <InkButton colors={colors} label="取消分组" icon={FolderPlus} onPress={ungroupSelectedFolder} />
            ) : (
              <>
                <InkButton
                  colors={colors}
                  label={activeGroupId ? '取消分组' : '分组'}
                  icon={FolderPlus}
                  disabled={activeGroupId ? selectedCount < 1 : selectedCount < 2}
                  onPress={activeGroupId ? ungroupSelection : createGroupSelection}
                />
                <InkButton
                  colors={colors}
                  label="详情"
                  icon={Info}
                  disabled={selectedCount !== 1}
                  onPress={() => router.push({ pathname: '/book/[bookId]', params: { bookId: selectedIds[0] } })}
                />
                <InkButton colors={colors} label="删除" icon={Trash2} variant="danger" onPress={deleteSelection} />
              </>
            )}
          </View>
        </View>
      ) : null}

      <Modal visible={showSort} transparent animationType={modalAnimationType(einkOptimization)} onRequestClose={() => setShowSort(false)}>
        <View style={styles.sortModalLayer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭排序菜单"
            onPress={() => setShowSort(false)}
            style={StyleSheet.absoluteFillObject}
          />
          <View
            style={[
              styles.sortPopover,
              { borderColor: colors.text, backgroundColor: colors.surface },
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
                  accessibilityLabel={`按${sortLabels[field]}排序`}
                  onPress={() => setSortField(field)}
                  style={({ pressed }) => [
                    styles.sortMenuItem,
                    selected && [styles.sortMenuItemSelected, { backgroundColor: colors.text }],
                    pressed && styles.sortMenuItemPressed,
                  ]}>
                  <View style={styles.sortMenuIconSlot}>
                    {selected ? <Check size={18} color={colors.surface} strokeWidth={3} /> : null}
                  </View>
                  <Text style={[styles.sortMenuText, { color: colors.text }, selected && { color: colors.surface }]}>
                    {sortLabels[field]}
                  </Text>
                </Pressable>
              );
            })}
            <View style={[styles.sortMenuSeparator, { backgroundColor: colors.border }]} />
            {([
              { direction: 'asc', label: '升序', icon: ArrowDownAZ },
              { direction: 'desc', label: '降序', icon: ArrowUpAZ },
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
                    selected && [styles.sortMenuItemSelected, { backgroundColor: colors.text }],
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
            accessibilityLabel="关闭导入方式"
            onPress={() => closeImportOptions()}
            style={StyleSheet.absoluteFillObject}
          />
          <Animated.View
            style={[
              styles.importSheet,
              { borderColor: colors.border, backgroundColor: colors.surface },
              {
                transform: [
                  {
                    translateY: importSheetProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [360, 0],
                    }),
                  },
                ],
              },
            ]}>
            <Text style={[styles.importSheetTitle, { color: colors.text }]}>添加书籍</Text>
            <Text style={[styles.importSheetHint, { color: colors.textSecondary }]}>选择导入来源</Text>
            <View style={styles.importActions}>
              <ImportAction
                colors={colors}
                icon={FilePlus2}
                title="本地文件"
                description="从设备中选择 EPUB、TXT 或 PDF"
                onPress={onImport}
              />
              <ImportAction
                colors={colors}
                icon={Cloud}
                title="WebDAV"
                description="浏览已保存的 WebDAV 目录"
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
            accessibilityLabel="关闭重命名"
            onPress={() => setRenameGroupOpen(false)}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[styles.renameCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.renameTitle, { color: colors.text }]}>修改文件夹名称</Text>
            <TextInput
              accessibilityLabel="文件夹名称"
              value={renameGroupName}
              onChangeText={setRenameGroupName}
              autoFocus
              selectTextOnFocus
              style={[styles.renameInput, { borderColor: colors.border, color: colors.text }]}
            />
            <View style={styles.renameActions}>
              <InkButton colors={colors} label="取消" variant="quiet" onPress={() => setRenameGroupOpen(false)} />
              <InkButton colors={colors} label="保存" variant="primary" disabled={!renameGroupName.trim()} onPress={saveRenameGroup} />
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
            accessibilityLabel="返回书架"
            onPress={onBack}
            style={({ pressed }) => [styles.groupBackButton, pressed && styles.sortMenuItemPressed]}>
            <ChevronLeft size={22} color={colors.text} strokeWidth={2.4} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="修改文件夹名称"
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
  const progress = state.total > 0 ? Math.min(1, state.completed / state.total) : 0;
  const progressLabel = state.total > 0 ? `${state.completed}/${state.total}` : '准备中';
  const title =
    state.status === 'running'
      ? 'WebDAV 正在导入'
      : state.status === 'success'
        ? 'WebDAV 导入完成'
        : 'WebDAV 导入失败';
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
        <Text style={[styles.webDavImportResult, { color: colors.textSecondary }]}>{state.imported} 本</Text>
      )}
      <View style={[styles.webDavImportTrack, { backgroundColor: colors.backgroundElement }]}>
        <View style={[styles.webDavImportFill, { backgroundColor: colors.text, width: `${progress * 100}%` }]} />
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
  const previews = folder.books.slice(0, 9);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${folder.name}，${folder.books.length} 本书`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.folderCard, { width }, pressed && styles.sortMenuItemPressed]}>
      <View
        style={[
          styles.folderCover,
          { height: width * 1.44, borderColor: selected ? colors.text : colors.border, backgroundColor: colors.surface },
          selected && styles.folderCoverSelected,
        ]}>
        <View style={[styles.folderTab, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]} />
        <View style={styles.folderPreviewGrid}>
          {previews.map((book) => (
            <View key={book.id} style={[styles.folderPreview, { borderColor: colors.border, backgroundColor: colors.background }]}>
              {book.coverUri ? (
                <Image source={{ uri: book.coverUri }} style={styles.folderPreviewImage} resizeMode="cover" />
              ) : (
                <Folder size={14} color={colors.textSecondary} strokeWidth={2} />
              )}
            </View>
          ))}
        </View>
        {selected ? (
          <View style={[styles.folderSelectedBadge, { backgroundColor: colors.text }]}>
            <Check size={18} color={colors.surface} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <View style={styles.meta}>
        <Text style={[styles.folderTitle, { color: colors.text }]} numberOfLines={2}>
          {folder.name}
        </Text>
        <Text style={[styles.folderCount, { color: colors.textSecondary }]}>{folder.books.length} 本书</Text>
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

const ShelfHeader = memo(function ShelfHeader({
  colors,
  query,
  bookCount,
  moreButtonRef,
  onChangeQuery,
  onToggleSortMenu,
}: {
  colors: AppColors;
  query: string;
  bookCount: number;
  moreButtonRef: React.RefObject<View | null>;
  onChangeQuery: (text: string) => void;
  onToggleSortMenu: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.topControls}>
        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Search size={20} color={colors.textSecondary} strokeWidth={2.2} />
          <TextInput
            accessibilityLabel="搜索书籍"
            placeholder={`在 ${bookCount} 本书籍中搜索...`}
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={onChangeQuery}
            style={[styles.searchInput, { color: colors.text }]}
          />
        </View>
        <View ref={moreButtonRef} style={styles.moreMenuAnchor}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="排序"
            onPress={onToggleSortMenu}
            style={[styles.headerIconButton, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <CircleEllipsis size={24} color={colors.text} strokeWidth={2.2} />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="设置"
          onPress={() => router.push('/settings')}
          style={[styles.headerIconButton, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Settings size={24} color={colors.text} strokeWidth={2.2} />
        </Pressable>
      </View>
    </View>
  );
});

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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="导入书籍"
      disabled={importing}
      onPress={onPress}
      style={({ pressed }) => [
        styles.importTile,
        { borderColor: colors.border, backgroundColor: colors.surface },
        {
          width,
          height: width * 1.44,
          opacity: importing ? 0.45 : pressed ? 0.65 : 1,
        },
      ]}>
      <Plus size={42} color={colors.textSecondary} strokeWidth={1.8} />
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
    paddingTop: Spacing.three,
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
    minHeight: 58,
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
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
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
    fontWeight: '900',
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
    backgroundColor: Colors.light.text,
  },
  listWithSheet: {
    paddingBottom: 144,
  },
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
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
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flex: 1,
    minHeight: 52,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.three,
    paddingRight: Spacing.three,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    fontSize: 18,
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
    borderColor: Colors.light.text,
    backgroundColor: Colors.light.surface,
    paddingVertical: Spacing.one,
    zIndex: 40,
    elevation: 6,
  },
  sortMenuItem: {
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sortMenuItemSelected: {
    backgroundColor: Colors.light.text,
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
    backgroundColor: 'rgba(0,0,0,0.18)',
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
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
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
    backgroundColor: Colors.light.background,
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
    fontWeight: '900',
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
    backgroundColor: 'rgba(0,0,0,0.18)',
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
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
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
    backgroundColor: Colors.light.surface,
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
    backgroundColor: Colors.light.text,
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
    fontWeight: '900',
    color: Colors.light.text,
  },
  folderCount: {
    fontSize: 15,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
  selectionSheet: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.text,
    backgroundColor: Colors.light.surface,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  selectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.light.text,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
