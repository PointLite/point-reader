import { useFocusEffect, router } from 'expo-router';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  CircleEllipsis,
  Cloud,
  FilePlus2,
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
  FlatList,
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
import { deleteBooks, searchBooks } from '@/lib/books';
import { importPickedBooks } from '@/lib/importBooks';
import { loadSortState, saveSortState } from '@/lib/settings';
import { useAppTheme, type AppColors } from '@/lib/theme';
import { useWebDavImport, type WebDavImportSnapshot } from '@/lib/webdavImportQueue';
import type { Book, SortField, SortState } from '@/types/reader';

type ShelfItem = { type: 'book'; book: Book } | { type: 'import' };

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
  const [books, setBooks] = useState<Book[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [showImportOptions, setShowImportOptions] = useState(false);
  const [sort, setSort] = useState<SortState>({ field: 'title', direction: 'asc' });
  const [showSort, setShowSort] = useState(false);
  const [sortMenuFrame, setSortMenuFrame] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const moreButtonRef = useRef<View>(null);
  const queryRef = useRef('');
  const sortRef = useRef<SortState>({ field: 'title', direction: 'asc' });
  const handledWebDavImportRef = useRef(0);
  const webDavImport = useWebDavImport();

  const selectionMode = selectedIds.length > 0;
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const gridGap = Spacing.three;
  const horizontalPadding = Spacing.three * 2;
  const bookWidth = Math.floor((width - horizontalPadding - gridGap * 2) / 3);
  const shelfItems: ShelfItem[] = useMemo(
    () => [
      ...books.map((book) => ({ type: 'book' as const, book })),
      { type: 'import' },
    ],
    [books]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    const nextSort = await loadSortState();
    sortRef.current = nextSort;
    setSort(nextSort);
    setBooks(await searchBooks(queryRef.current, nextSort));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    if (webDavImport.status !== 'success') return;
    if (handledWebDavImportRef.current === webDavImport.updatedAt) return;
    handledWebDavImportRef.current = webDavImport.updatedAt;
    void refresh();
  }, [refresh, webDavImport.status, webDavImport.updatedAt]);

  const selectedCount = selectedIds.length;

  const toggleSortMenu = () => {
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

  const onImport = () => {
    setShowImportOptions(false);
    setTimeout(() => {
      void runLocalImport();
    }, 260);
  };

  const openImportOptions = useCallback(() => {
    setShowImportOptions(true);
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }, []);

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

  const keyExtractor = useCallback((item: ShelfItem) => (item.type === 'book' ? item.book.id : 'import-tile'), []);

  const renderShelfItem = useCallback(
    ({ item }: { item: ShelfItem }) =>
      item.type === 'import' ? (
        <ImportTile width={bookWidth} importing={importing} colors={colors} onPress={openImportOptions} />
      ) : (
        <BookCard
          book={item.book}
          width={bookWidth}
          colors={colors}
          selected={selectedIdSet.has(item.book.id)}
          selectionMode={selectionMode}
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
    [bookWidth, colors, importing, openImportOptions, selectedIdSet, selectionMode, toggleSelected]
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
            webDavImport.status === 'idle' ? null : (
              <WebDavImportProgressRow colors={colors} state={webDavImport} />
            )
          }
          renderItem={renderShelfItem}
        />
      )}

      {selectionMode ? (
        <View style={[styles.selectionSheet, { borderColor: colors.text, backgroundColor: colors.surface }]}>
          <Text style={[styles.selectionTitle, { color: colors.text }]}>已选择 {selectedCount} 本</Text>
          <View style={styles.sheetActions}>
            <InkButton colors={colors} label="分组" icon={FolderPlus} onPress={() => Alert.alert('分组', '第一版会保留分组入口，数据结构已准备。')} />
            <InkButton
              colors={colors}
              label="详情"
              icon={Info}
              disabled={selectedCount !== 1}
              onPress={() => router.push({ pathname: '/book/[bookId]', params: { bookId: selectedIds[0] } })}
            />
            <InkButton colors={colors} label="删除" icon={Trash2} variant="danger" onPress={deleteSelection} />
          </View>
        </View>
      ) : null}

      <Modal visible={showSort} transparent animationType="none" onRequestClose={() => setShowSort(false)}>
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

      <Modal visible={showImportOptions} transparent animationType="fade" onRequestClose={() => setShowImportOptions(false)}>
        <View style={styles.importModalLayer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭导入方式"
            onPress={() => setShowImportOptions(false)}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[styles.importSheet, { borderColor: colors.border, backgroundColor: colors.surface }]}>
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
                  setShowImportOptions(false);
                  router.push('/webdav');
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
  importTile: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
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
