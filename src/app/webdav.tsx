import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Folder,
  Pencil,
  Plus,
  Server,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react-native';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { modalAnimationType, useEinkOptimization } from '@/lib/motion';
import { useAppTheme, type AppColors } from '@/lib/theme';
import { listWebDav, type WebDavConfig } from '@/lib/webdav';
import { startWebDavImport, useWebDavImport } from '@/lib/webdavImportQueue';
import type { WebDavDirectory, WebDavEntry } from '@/types/reader';

const WEBDAV_DIRECTORIES_KEY = 'point-reader:webdav-directories';
const WEBDAV_SORT_KEY = 'point-reader:webdav-sort';

type WebDavSortState = {
  field: 'name' | 'modifiedAt';
  direction: 'asc' | 'desc';
};

const defaultWebDavSort: WebDavSortState = {
  field: 'name',
  direction: 'asc',
};

const webDavSortLabels: Record<WebDavSortState['field'], string> = {
  name: '文件名',
  modifiedAt: '添加时间',
};

type BrowseState = {
  directory: WebDavDirectory;
  href?: string;
  label: string;
  history: { href?: string; label: string }[];
};

export default function WebDavScreen() {
  const { width, height } = useWindowDimensions();
  const { colors } = useAppTheme();
  const einkOptimization = useEinkOptimization();
  const [directories, setDirectories] = useState<WebDavDirectory[]>([]);
  const [entries, setEntries] = useState<WebDavEntry[]>([]);
  const [selectedHrefs, setSelectedHrefs] = useState<string[]>([]);
  const [browseState, setBrowseState] = useState<BrowseState | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortMenuFrame, setSortMenuFrame] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [editingDirectory, setEditingDirectory] = useState<WebDavDirectory | null>(null);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<WebDavSortState>(defaultWebDavSort);
  const [form, setForm] = useState({ name: '', url: '', username: '', password: '' });
  const navigationRequestRef = useRef(0);
  const sortButtonRef = useRef<View>(null);
  const webDavImport = useWebDavImport();
  const importing = webDavImport.status === 'running';
  const selectedHrefSet = useMemo(() => new Set(selectedHrefs), [selectedHrefs]);

  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedHrefSet.has(entry.href)),
    [entries, selectedHrefSet]
  );
  const sortedEntries = useMemo(() => sortWebDavEntries(entries, sort), [entries, sort]);

  const loadDirectories = useCallback(async () => {
    const raw = await AsyncStorage.getItem(WEBDAV_DIRECTORIES_KEY);
    setDirectories(raw ? JSON.parse(raw) : []);
  }, []);

  useEffect(() => {
    loadDirectories();
  }, [loadDirectories]);

  useEffect(() => {
    let mounted = true;
    async function loadSort() {
      const raw = await AsyncStorage.getItem(WEBDAV_SORT_KEY);
      if (!mounted || !raw) return;
      setSort({ ...defaultWebDavSort, ...JSON.parse(raw) });
    }
    void loadSort();
    return () => {
      mounted = false;
    };
  }, []);

  const persistDirectories = async (nextDirectories: WebDavDirectory[]) => {
    setDirectories(nextDirectories);
    await AsyncStorage.setItem(WEBDAV_DIRECTORIES_KEY, JSON.stringify(nextDirectories));
  };

  const configFor = (directory: WebDavDirectory): WebDavConfig => ({
    url: directory.url,
    username: directory.username,
    password: directory.password,
  });

  const loadEntries = async (directory: WebDavDirectory, href?: string) => {
    const requestId = ++navigationRequestRef.current;
    setLoading(true);
    try {
      const nextEntries = await listWebDav(configFor(directory), href);
      if (requestId !== navigationRequestRef.current) return false;
      setEntries(nextEntries);
      setSelectedHrefs([]);
      return true;
    } catch (error) {
      if (requestId === navigationRequestRef.current) {
        Alert.alert('WebDAV', error instanceof Error ? error.message : '无法浏览目录');
      }
      return false;
    } finally {
      if (requestId === navigationRequestRef.current) {
        setLoading(false);
      }
    }
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
    setModalOpen(true);
  };

  const closeDirectoryModal = () => {
    setModalOpen(false);
    setEditingDirectory(null);
    setForm({ name: '', url: '', username: '', password: '' });
  };

  const saveDirectory = async () => {
    const url = form.url.trim();
    if (!url) {
      Alert.alert(editingDirectory ? '编辑目录' : '添加目录', '请输入 WebDAV 目录地址。');
      return;
    }

    const now = Date.now();
    const nextDirectory: WebDavDirectory = {
      id: editingDirectory?.id ?? `${now}-${Math.random().toString(36).slice(2)}`,
      name: form.name.trim() || directoryNameFromUrl(url),
      url: normalizeDirectoryUrl(url),
      username: form.username.trim() || undefined,
      password: form.password || undefined,
      createdAt: editingDirectory?.createdAt ?? now,
      updatedAt: now,
    };

    const nextDirectories = editingDirectory
      ? directories.map((directory) => (directory.id === editingDirectory.id ? nextDirectory : directory))
      : [nextDirectory, ...directories];
    await persistDirectories(nextDirectories);
    closeDirectoryModal();
  };

  const deleteDirectory = (directory: WebDavDirectory) => {
    Alert.alert('删除目录', `确定删除“${directory.name}”？这不会删除已经导入书架的书籍。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await persistDirectories(directories.filter((item) => item.id !== directory.id));
        },
      },
    ]);
  };

  const importSelection = async () => {
    if (!browseState || selectedEntries.length === 0) return;
    const entriesToImport = selectedEntries;
    const config = configFor(browseState.directory);
    setSelectedHrefs([]);
    void startWebDavImport(config, entriesToImport).catch(() => {});
  };

  const closeToHome = () => {
    router.dismissAll();
    router.replace('/');
  };

  const applySort = async (nextSort: WebDavSortState) => {
    setSort(nextSort);
    await AsyncStorage.setItem(WEBDAV_SORT_KEY, JSON.stringify(nextSort));
  };

  const openSortMenu = () => {
    sortButtonRef.current?.measureInWindow((x, y, frameWidth, frameHeight) => {
      setSortMenuFrame({ x, y, width: frameWidth, height: frameHeight });
      setSortOpen(true);
    });
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          accessibilityState={{ disabled: loading }}
          disabled={loading}
          onPress={goBack}
          style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.surface }, loading && styles.disabledControl]}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <View style={styles.titleCopy}>
          <Text style={[styles.title, { color: colors.text }]}>{browseState ? browseState.directory.name : 'WebDAV'}</Text>
          {browseState ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {browseState.label}
            </Text>
          ) : null}
        </View>
        {browseState ? (
          <View style={styles.browseActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭 WebDAV 浏览"
              disabled={loading}
              onPress={closeToHome}
              style={({ pressed }) => [
                styles.iconButton,
                { borderColor: colors.border, backgroundColor: colors.surface },
                loading && styles.disabledControl,
                pressed && styles.pressed,
              ]}>
              <X size={22} color={colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="导入所选内容"
              disabled={selectedEntries.length === 0 || importing || loading}
              onPress={importSelection}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: colors.text },
                (selectedEntries.length === 0 || loading) && styles.actionButtonDisabled,
                pressed && styles.pressed,
              ]}>
              {importing ? <ActivityIndicator color={colors.surface} /> : <Download size={20} color={colors.surface} />}
              <Text style={[styles.actionButtonText, { color: colors.surface }]}>导入</Text>
            </Pressable>
          </View>
        ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="添加目录"
              disabled={loading || importing}
              onPress={openAddDirectory}
              style={({ pressed }) => [
                styles.iconButton,
                { borderColor: colors.border, backgroundColor: colors.surface },
                (loading || importing) && styles.disabledControl,
                pressed && styles.pressed,
              ]}>
            <Plus size={24} color={colors.text} />
          </Pressable>
        )}
      </View>

      {browseState ? (
        <FlatList
          data={sortedEntries}
          keyExtractor={(item) => item.href}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.browserHeader}>
              <View style={styles.browserTitleRow}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>目录内容</Text>
                <View ref={sortButtonRef}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="排序"
                    disabled={loading}
                    onPress={openSortMenu}
                    style={({ pressed }) => [
                      styles.sortHeaderButton,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      loading && styles.disabledControl,
                      pressed && styles.pressed,
                    ]}>
                    <SlidersHorizontal size={20} color={colors.text} />
                  </Pressable>
                </View>
              </View>
              <Text style={[styles.browserMeta, { color: colors.textSecondary }]}>
                已选择 {selectedEntries.length} 项{importing ? `，导入中 ${webDavImport.completed}/${webDavImport.total}` : ''}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <EmptyState colors={colors} loading={loading} text={loading ? '正在读取目录...' : '这个目录里暂时没有内容。'} />
          }
          renderItem={({ item }) => (
            <WebDavEntryRow
              entry={item}
              colors={colors}
              selected={selectedHrefSet.has(item.href)}
              disabled={importing || loading}
              onToggle={() => toggleSelected(item.href)}
              onPress={() => openEntry(item)}
            />
          )}
        />
      ) : (
        <FlatList
          data={directories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          ListHeaderComponent={<Text style={[styles.sectionTitle, { color: colors.text }]}>我的目录</Text>}
          ListEmptyComponent={
            <EmptyState colors={colors} loading={false} text="右上角添加 WebDAV 目录后，可以在这里进入浏览并批量导入书籍。" />
          }
          renderItem={({ item }) => (
            <DirectoryCard
              directory={item}
              colors={colors}
              disabled={loading || importing}
              onPress={() => openDirectory(item)}
              onEdit={() => openEditDirectory(item)}
              onDelete={() => deleteDirectory(item)}
            />
          )}
        />
      )}

      {loading ? <DirectoryLoadingOverlay colors={colors} /> : null}

      <SortModal
        visible={sortOpen}
        colors={colors}
        einkOptimization={einkOptimization}
        sort={sort}
        frame={sortMenuFrame}
        screenWidth={width}
        screenHeight={height}
        onChange={applySort}
        onClose={() => setSortOpen(false)}
      />

      <DirectoryModal
        visible={modalOpen}
        colors={colors}
        einkOptimization={einkOptimization}
        editing={Boolean(editingDirectory)}
        form={form}
        onChange={setForm}
        onClose={closeDirectoryModal}
        onSave={saveDirectory}
      />
    </SafeAreaView>
  );
}

function DirectoryCard({
  directory,
  colors,
  disabled,
  onPress,
  onEdit,
  onDelete,
}: {
  directory: WebDavDirectory;
  colors: AppColors;
  disabled: boolean;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={[styles.directoryCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`浏览 ${directory.name}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.directoryMain, disabled && styles.disabledControl, pressed && styles.pressed]}>
        <View style={[styles.directoryIcon, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
          <Server size={24} color={colors.text} />
        </View>
        <View style={styles.directoryCopy}>
          <Text style={[styles.directoryName, { color: colors.text }]} numberOfLines={1}>
            {directory.name}
          </Text>
          <Text style={[styles.directoryUrl, { color: colors.textSecondary }]} numberOfLines={2}>
            {directory.url}
          </Text>
          <Text style={[styles.directoryMeta, { color: colors.accent }]}>{directory.username ? `账号 ${directory.username}` : '无账号'}</Text>
        </View>
      </Pressable>
      <View style={[styles.directoryActions, { borderLeftColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`编辑 ${directory.name}`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onEdit}
          style={({ pressed }) => [styles.cardIconButton, { backgroundColor: colors.surface }, disabled && styles.disabledControl, pressed && styles.pressed]}>
          <Pencil size={20} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`删除 ${directory.name}`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onDelete}
          style={({ pressed }) => [
            styles.cardIconButton,
            styles.dangerIconButton,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
            disabled && styles.disabledControl,
            pressed && styles.pressed,
          ]}>
          <Trash2 size={20} color={colors.danger} />
        </Pressable>
      </View>
    </View>
  );
}

function DirectoryLoadingOverlay({ colors }: { colors: AppColors }) {
  return (
    <View style={styles.loadingOverlay} pointerEvents="auto">
      <View style={[styles.loadingCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <ActivityIndicator color={colors.text} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>正在读取目录...</Text>
      </View>
    </View>
  );
}

function SortModal({
  visible,
  colors,
  einkOptimization,
  sort,
  frame,
  screenWidth,
  screenHeight,
  onChange,
  onClose,
}: {
  visible: boolean;
  colors: AppColors;
  einkOptimization: boolean;
  sort: WebDavSortState;
  frame: { x: number; y: number; width: number; height: number } | null;
  screenWidth: number;
  screenHeight: number;
  onChange: (sort: WebDavSortState) => void;
  onClose: () => void;
}) {
  const setField = (field: WebDavSortState['field']) => {
    if (field === sort.field) return;
    void onChange({ ...sort, field });
  };
  const setDirection = (direction: WebDavSortState['direction']) => {
    if (direction === sort.direction) return;
    void onChange({ ...sort, direction });
  };
  const menuWidth = 220;
  const top = frame ? frame.y + frame.height + Spacing.one : Spacing.six;
  const right = frame ? Math.max(Spacing.three, screenWidth - frame.x - frame.width) : Spacing.three;
  const maxHeight = Math.max(TouchTarget * 2, screenHeight - top - Spacing.three);

  return (
    <Modal visible={visible} transparent animationType={modalAnimationType(einkOptimization)} onRequestClose={onClose}>
      <View style={styles.sortModalLayer}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭排序" onPress={onClose} style={StyleSheet.absoluteFillObject} />
        <View style={[styles.sortCard, { width: menuWidth, top, right, maxHeight, borderColor: colors.text, backgroundColor: colors.surface }]}>
          <Text style={[styles.sortTitle, { color: colors.text }]}>排序</Text>
          {(['name', 'modifiedAt'] as const).map((field) => {
            const selected = field === sort.field;
            return (
              <Pressable
                key={field}
                accessibilityRole="button"
                accessibilityLabel={`按${webDavSortLabels[field]}排序`}
                accessibilityState={{ selected }}
                onPress={() => setField(field)}
                style={({ pressed }) => [
                  styles.sortOption,
                  selected && { backgroundColor: colors.text },
                  pressed && styles.pressed,
                ]}>
                <View style={styles.sortOptionIcon}>
                  {selected ? <Check size={18} color={colors.surface} strokeWidth={3} /> : null}
                </View>
                <Text style={[styles.sortOptionText, { color: colors.text }, selected && { color: colors.surface }]}>
                  {webDavSortLabels[field]}
                </Text>
              </Pressable>
            );
          })}
          <View style={[styles.sortSeparator, { backgroundColor: colors.border }]} />
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
                accessibilityState={{ selected }}
                onPress={() => setDirection(item.direction)}
                style={({ pressed }) => [
                  styles.sortOption,
                  selected && { backgroundColor: colors.text },
                  pressed && styles.pressed,
                ]}>
                <Icon size={18} color={selected ? colors.surface : colors.text} />
                <Text style={[styles.sortOptionText, { color: colors.text }, selected && { color: colors.surface }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

function WebDavEntryRow({
  entry,
  colors,
  selected,
  disabled,
  onToggle,
  onPress,
}: {
  entry: WebDavEntry;
  colors: AppColors;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  onPress: () => void;
}) {
  const meta = entryMetaText(entry);

  return (
    <View style={[styles.entry, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected, disabled }}
        accessibilityLabel={`选择 ${entry.name}`}
        disabled={disabled}
        onPress={onToggle}
        hitSlop={Spacing.one}
        style={styles.checkboxTouch}>
        <View style={[styles.checkboxBox, { borderColor: colors.text, backgroundColor: colors.surface }, selected && { backgroundColor: colors.text }]}>
          {selected ? <Check size={14} color={colors.surface} strokeWidth={3} /> : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={entry.type === 'directory' ? `进入 ${entry.name}` : entry.name}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.entryMain, pressed && styles.pressed]}>
        {entry.type === 'directory' ? (
          <Folder size={24} color={colors.text} />
        ) : (
          <FileText size={24} color={colors.textSecondary} />
        )}
        <View style={styles.entryCopy}>
          <AutoScrollText text={entry.name} textStyle={[styles.entryName, { color: colors.text }]} />
          {meta ? <Text style={[styles.entryMeta, { color: colors.textSecondary }]}>{meta}</Text> : null}
        </View>
        {entry.type === 'directory' ? <ChevronRight size={20} color={colors.textSecondary} /> : null}
      </Pressable>
    </View>
  );
}

function DirectoryModal({
  visible,
  editing,
  colors,
  einkOptimization,
  form,
  onChange,
  onClose,
  onSave,
}: {
  visible: boolean;
  editing: boolean;
  colors: AppColors;
  einkOptimization: boolean;
  form: { name: string; url: string; username: string; password: string };
  onChange: (form: { name: string; url: string; username: string; password: string }) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType={modalAnimationType(einkOptimization)} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { borderColor: colors.text, backgroundColor: colors.surface }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{editing ? '编辑目录' : '添加目录'}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="关闭" onPress={onClose} style={styles.modalClose}>
              <X size={22} color={colors.text} />
            </Pressable>
          </View>
          <LabeledInput
            colors={colors}
            label="目录名称"
            value={form.name}
            onChangeText={(name) => onChange({ ...form, name })}
            placeholder="我的 WebDAV"
          />
          <LabeledInput
            colors={colors}
            label="目录地址"
            value={form.url}
            onChangeText={(url) => onChange({ ...form, url })}
            placeholder="https://example.com/dav/books/"
          />
          <LabeledInput
            colors={colors}
            label="用户名"
            value={form.username}
            onChangeText={(username) => onChange({ ...form, username })}
            placeholder="可选"
          />
          <LabeledInput
            colors={colors}
            label="密码"
            value={form.password}
            onChangeText={(password) => onChange({ ...form, password })}
            placeholder="可选"
            secureTextEntry
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editing ? '保存修改' : '保存目录'}
            onPress={onSave}
            style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.text }, pressed && styles.pressed]}>
            <Text style={[styles.saveButtonText, { color: colors.surface }]}>{editing ? '保存修改' : '保存目录'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function LabeledInput({
  label,
  colors,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
}: {
  label: string;
  colors: AppColors;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { borderColor: colors.border, color: colors.text }]}
      />
    </View>
  );
}

function EmptyState({ loading, text, colors }: { loading: boolean; text: string; colors: AppColors }) {
  return (
    <View style={styles.empty}>
      {loading ? <ActivityIndicator color={colors.text} /> : null}
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

const AutoScrollText = memo(function AutoScrollText({
  text,
  textStyle,
}: {
  text: string;
  textStyle: TextStyle | TextStyle[];
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);
  const estimatedWidth = useMemo(() => estimateEntryNameWidth(text), [text]);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const contentWidth = Math.max(measuredWidth, estimatedWidth);
  const overflow = Math.max(0, contentWidth - containerWidth);

  useEffect(() => {
    translateX.stopAnimation();
    translateX.setValue(0);
    if (overflow <= 2) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(translateX, {
          toValue: -overflow,
          duration: Math.max(2600, overflow * 45),
          useNativeDriver: true,
        }),
        Animated.delay(900),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 1,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [overflow, translateX]);

  return (
    <View
      style={styles.autoTextViewport}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}>
      <Text
        numberOfLines={1}
        onTextLayout={(event) => {
          const lineWidth = event.nativeEvent.lines[0]?.width ?? 0;
          setMeasuredWidth(Math.ceil(lineWidth));
        }}
        style={[textStyle, styles.autoTextMeasure]}>
        {text}
      </Text>
      <Animated.Text
        numberOfLines={1}
        ellipsizeMode="clip"
        style={[
          textStyle,
          styles.autoTextContent,
          contentWidth > 0 && { width: contentWidth },
          { transform: [{ translateX }] },
        ]}>
        {text}
      </Animated.Text>
    </View>
  );
});

function directoryNameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const pathName = decodeURIComponent(parsed.pathname.replace(/\/$/, '').split('/').filter(Boolean).pop() ?? '');
    return pathName || parsed.hostname || 'WebDAV 目录';
  } catch {
    return 'WebDAV 目录';
  }
}

function normalizeDirectoryUrl(url: string) {
  return url.endsWith('/') ? url : `${url}/`;
}

function sortWebDavEntries(entries: WebDavEntry[], sort: WebDavSortState) {
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    if (sort.field === 'modifiedAt') {
      const left = sortableEntryTime(a.modifiedAt);
      const right = sortableEntryTime(b.modifiedAt);
      if (left !== right) return (left - right) * direction;
    }
    return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }) * direction;
  });
}

function sortableEntryTime(modifiedAt?: string) {
  if (!modifiedAt) return Number.MAX_SAFE_INTEGER;
  const time = new Date(modifiedAt).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function estimateEntryNameWidth(text: string) {
  return Array.from(text).reduce((total, char) => {
    if (/[\u3000-\u9fff\uff00-\uffef]/.test(char)) return total + 17;
    if (/[A-Z0-9]/.test(char)) return total + 10;
    if (/[mwMW]/.test(char)) return total + 12;
    if (/[ilI.,;:'|!]/.test(char)) return total + 5;
    if (/\s/.test(char)) return total + 4;
    return total + 8;
  }, 0);
}

function entryMetaText(entry: WebDavEntry) {
  if (entry.type === 'directory') return formatEntryDate(entry.modifiedAt);
  return [fileTypeLabel(entry.name), formatFileSize(entry.size), formatEntryDate(entry.modifiedAt)]
    .filter(Boolean)
    .join(' · ');
}

function fileTypeLabel(name: string) {
  const ext = name.split('.').pop()?.trim().toUpperCase();
  if (!ext || ext === name.toUpperCase()) return '文件';
  if (ext === 'EPUB' || ext === 'TXT' || ext === 'PDF') return ext;
  return `${ext} 文件`;
}

function formatFileSize(size?: number) {
  if (!Number.isFinite(size) || typeof size !== 'number' || size < 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / 1024 / 1024).toFixed(size < 10 * 1024 * 1024 ? 2 : 1)} MB`;
}

function formatEntryDate(modifiedAt?: string) {
  if (!modifiedAt) return '';
  const date = new Date(modifiedAt);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours()}:${minutes}`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  topBar: {
    minHeight: 64,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  iconButton: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  titleCopy: {
    flex: 1,
  },
  title: {
    fontSize: 25,
    fontWeight: '900',
    color: Colors.light.text,
  },
  subtitle: {
    marginTop: Spacing.half,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.light.textSecondary,
  },
  browseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actionButton: {
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    backgroundColor: Colors.light.text,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  actionButtonDisabled: {
    opacity: 0.42,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.light.surface,
  },
  pressed: {
    opacity: 0.72,
  },
  disabledControl: {
    opacity: 0.48,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  loadingCard: {
    minWidth: 156,
    minHeight: 72,
    borderRadius: Radius.medium,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '800',
  },
  sortHeaderButton: {
    width: TouchTarget,
    height: TouchTarget,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortModalLayer: {
    flex: 1,
  },
  sortCard: {
    position: 'absolute',
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.text,
    backgroundColor: Colors.light.surface,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  sortTitle: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 18,
    fontWeight: '900',
    color: Colors.light.text,
  },
  sortOption: {
    minHeight: TouchTarget,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sortOptionIcon: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortOptionText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.light.text,
  },
  sortSeparator: {
    height: 1,
    marginVertical: Spacing.one,
    backgroundColor: Colors.light.border,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: Colors.light.text,
  },
  browserHeader: {
    gap: Spacing.one,
  },
  browserTitleRow: {
    minHeight: TouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  browserMeta: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.light.textSecondary,
  },
  directoryCard: {
    minHeight: 118,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  directoryMain: {
    flex: 1,
    minHeight: 118,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  directoryIcon: {
    width: 52,
    height: 52,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directoryCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  directoryName: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.light.text,
  },
  directoryUrl: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
  },
  directoryMeta: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.light.accent,
  },
  directoryActions: {
    width: 64,
    minHeight: 118,
    borderLeftWidth: 1,
    borderLeftColor: Colors.light.border,
  },
  cardIconButton: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.surface,
  },
  dangerIconButton: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  entry: {
    minHeight: 68,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.two,
  },
  checkboxTouch: {
    width: 44,
    minHeight: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: Colors.light.text,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxSelected: {
    backgroundColor: Colors.light.text,
  },
  entryMain: {
    flex: 1,
    minHeight: 68,
    paddingVertical: Spacing.two,
    paddingLeft: Spacing.one,
    paddingRight: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  entryCopy: {
    flex: 1,
    gap: Spacing.half,
  },
  autoTextViewport: {
    width: '100%',
    overflow: 'hidden',
  },
  autoTextMeasure: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    top: 0,
    zIndex: -1,
    flexShrink: 0,
    width: 10000,
  },
  autoTextContent: {
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  entryName: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.light.text,
  },
  entryMeta: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    color: Colors.light.textSecondary,
  },
  empty: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: Colors.light.textSecondary,
  },
  modalBackdrop: {
    flex: 1,
    padding: Spacing.three,
    backgroundColor: 'rgba(23,23,23,0.28)',
    justifyContent: 'center',
  },
  modalCard: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.text,
    backgroundColor: Colors.light.surface,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  modalHeader: {
    minHeight: TouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: Colors.light.text,
  },
  modalClose: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputGroup: {
    gap: Spacing.two,
  },
  label: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.light.text,
  },
  input: {
    minHeight: TouchTarget,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    color: Colors.light.text,
  },
  saveButton: {
    minHeight: TouchTarget,
    borderRadius: Radius.medium,
    backgroundColor: Colors.light.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.light.surface,
  },
});
