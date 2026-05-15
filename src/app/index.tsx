import { useFocusEffect, router } from 'expo-router';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  CircleEllipsis,
  FolderPlus,
  Info,
  Plus,
  Search,
  Settings,
  Trash2,
} from 'lucide-react-native';
import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
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
  const [books, setBooks] = useState<Book[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [sort, setSort] = useState<SortState>({ field: 'title', direction: 'asc' });
  const [showSort, setShowSort] = useState(false);
  const [sortMenuFrame, setSortMenuFrame] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const moreButtonRef = useRef<View>(null);
  const queryRef = useRef('');
  const sortRef = useRef<SortState>({ field: 'title', direction: 'asc' });

  const selectionMode = selectedIds.length > 0;
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

  const onImport = async () => {
    setImporting(true);
    try {
      await importPickedBooks();
      await refresh();
    } finally {
      setImporting(false);
    }
  };

  const openImportOptions = () => {
    Alert.alert('导入书籍', '选择导入方式', [
      { text: '本地文件', onPress: onImport },
      { text: 'WebDAV', onPress: () => router.push('/webdav') },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
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

  return (
    <SafeAreaView style={styles.screen}>
      <ShelfHeader
        query={query}
        bookCount={books.length}
        moreButtonRef={moreButtonRef}
        onChangeQuery={updateQuery}
        onToggleSortMenu={toggleSortMenu}
      />
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.light.text} />
        </View>
      ) : (
        <FlatList
          data={shelfItems}
          keyExtractor={(item) => (item.type === 'book' ? item.book.id : 'import-tile')}
          numColumns={3}
          columnWrapperStyle={[styles.gridRow, { gap: gridGap }]}
          contentContainerStyle={[styles.gridContent, selectionMode && styles.listWithSheet]}
          renderItem={({ item }) => (
            item.type === 'import' ? (
              <ImportTile width={bookWidth} importing={importing} onPress={openImportOptions} />
            ) : (
              <BookCard
                book={item.book}
                width={bookWidth}
                selected={selectedIds.includes(item.book.id)}
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
            )
          )}
        />
      )}

      {selectionMode ? (
        <View style={styles.selectionSheet}>
          <Text style={styles.selectionTitle}>已选择 {selectedCount} 本</Text>
          <View style={styles.sheetActions}>
            <InkButton label="分组" icon={FolderPlus} onPress={() => Alert.alert('分组', '第一版会保留分组入口，数据结构已准备。')} />
            <InkButton
              label="详情"
              icon={Info}
              disabled={selectedCount !== 1}
              onPress={() => router.push({ pathname: '/book/[bookId]', params: { bookId: selectedIds[0] } })}
            />
            <InkButton label="删除" icon={Trash2} variant="danger" onPress={deleteSelection} />
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
                    selected && styles.sortMenuItemSelected,
                    pressed && styles.sortMenuItemPressed,
                  ]}>
                  <View style={styles.sortMenuIconSlot}>
                    {selected ? <Check size={18} color={Colors.light.surface} strokeWidth={3} /> : null}
                  </View>
                  <Text style={[styles.sortMenuText, selected && styles.sortMenuTextSelected]}>
                    {sortLabels[field]}
                  </Text>
                </Pressable>
              );
            })}
            <View style={styles.sortMenuSeparator} />
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
                    selected && styles.sortMenuItemSelected,
                    pressed && styles.sortMenuItemPressed,
                  ]}>
                  <Icon size={18} color={selected ? Colors.light.surface : Colors.light.text} />
                  <Text style={[styles.sortMenuText, selected && styles.sortMenuTextSelected]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const ShelfHeader = memo(function ShelfHeader({
  query,
  bookCount,
  moreButtonRef,
  onChangeQuery,
  onToggleSortMenu,
}: {
  query: string;
  bookCount: number;
  moreButtonRef: React.RefObject<View | null>;
  onChangeQuery: (text: string) => void;
  onToggleSortMenu: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.topControls}>
        <View style={styles.searchBox}>
          <Search size={20} color={Colors.light.textSecondary} strokeWidth={2.2} />
          <TextInput
            accessibilityLabel="搜索书籍"
            placeholder={`在 ${bookCount} 本书籍中搜索...`}
            placeholderTextColor={Colors.light.textSecondary}
            value={query}
            onChangeText={onChangeQuery}
            style={styles.searchInput}
          />
        </View>
        <View ref={moreButtonRef} style={styles.moreMenuAnchor}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="排序"
            onPress={onToggleSortMenu}
            style={styles.headerIconButton}>
            <CircleEllipsis size={24} color={Colors.light.text} strokeWidth={2.2} />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="设置"
          onPress={() => router.push('/settings')}
          style={styles.headerIconButton}>
          <Settings size={24} color={Colors.light.text} strokeWidth={2.2} />
        </Pressable>
      </View>
    </View>
  );
});

function ImportTile({
  width,
  importing,
  onPress,
}: {
  width: number;
  importing: boolean;
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
        {
          width,
          height: width * 1.44,
          opacity: importing ? 0.45 : pressed ? 0.65 : 1,
        },
      ]}>
      <Plus size={42} color={Colors.light.textSecondary} strokeWidth={1.8} />
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
