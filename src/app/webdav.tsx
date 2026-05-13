import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Folder,
  Pencil,
  Plus,
  Server,
  Trash2,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { importWebDavEntries, listWebDav, type WebDavConfig } from '@/lib/webdav';
import type { WebDavDirectory, WebDavEntry } from '@/types/reader';

const WEBDAV_DIRECTORIES_KEY = 'point-reader:webdav-directories';

type BrowseState = {
  directory: WebDavDirectory;
  href?: string;
  label: string;
  history: { href?: string; label: string }[];
};

export default function WebDavScreen() {
  const [directories, setDirectories] = useState<WebDavDirectory[]>([]);
  const [entries, setEntries] = useState<WebDavEntry[]>([]);
  const [selectedHrefs, setSelectedHrefs] = useState<string[]>([]);
  const [browseState, setBrowseState] = useState<BrowseState | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDirectory, setEditingDirectory] = useState<WebDavDirectory | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ completed: number; total: number } | null>(null);
  const [form, setForm] = useState({ name: '', url: '', username: '', password: '' });

  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedHrefs.includes(entry.href)),
    [entries, selectedHrefs]
  );

  const loadDirectories = useCallback(async () => {
    const raw = await AsyncStorage.getItem(WEBDAV_DIRECTORIES_KEY);
    setDirectories(raw ? JSON.parse(raw) : []);
  }, []);

  useEffect(() => {
    loadDirectories();
  }, [loadDirectories]);

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
    setLoading(true);
    setSelectedHrefs([]);
    try {
      setEntries(await listWebDav(configFor(directory), href));
    } catch (error) {
      Alert.alert('WebDAV', error instanceof Error ? error.message : '无法浏览目录');
    } finally {
      setLoading(false);
    }
  };

  const openDirectory = async (directory: WebDavDirectory) => {
    const nextState = { directory, href: undefined, label: directory.name, history: [] };
    setBrowseState(nextState);
    await loadEntries(directory);
  };

  const openEntry = async (entry: WebDavEntry) => {
    if (!browseState) return;
    if (entry.type === 'file') return;

    setBrowseState({
      directory: browseState.directory,
      href: entry.href,
      label: entry.name,
      history: [...browseState.history, { href: browseState.href, label: browseState.label }],
    });
    await loadEntries(browseState.directory, entry.href);
  };

  const goBack = async () => {
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
    setBrowseState({
      directory: browseState.directory,
      href: previous.href,
      label: previous.label,
      history: nextHistory,
    });
    await loadEntries(browseState.directory, previous.href);
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
    setImporting(true);
    setImportProgress({ completed: 0, total: selectedEntries.length });
    try {
      const books = await importWebDavEntries(configFor(browseState.directory), selectedEntries, (completed, total) => {
        setImportProgress({ completed, total });
      });
      Alert.alert('导入完成', books.length ? `已导入 ${books.length} 本书。` : '未找到可导入的 EPUB、TXT 或 PDF 文件。');
      setSelectedHrefs([]);
    } catch (error) {
      Alert.alert('导入失败', error instanceof Error ? error.message : '无法导入所选内容');
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={goBack} style={styles.iconButton}>
          <ChevronLeft size={24} color={Colors.light.text} />
        </Pressable>
        <View style={styles.titleCopy}>
          <Text style={styles.title}>{browseState ? browseState.directory.name : 'WebDAV'}</Text>
          {browseState ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {browseState.label}
            </Text>
          ) : null}
        </View>
        {browseState ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="导入所选内容"
            disabled={selectedEntries.length === 0 || importing}
            onPress={importSelection}
            style={({ pressed }) => [
              styles.actionButton,
              selectedEntries.length === 0 && styles.actionButtonDisabled,
              pressed && styles.pressed,
            ]}>
            {importing ? <ActivityIndicator color={Colors.light.surface} /> : <Download size={20} color={Colors.light.surface} />}
            <Text style={styles.actionButtonText}>导入</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="添加目录"
            onPress={openAddDirectory}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <Plus size={24} color={Colors.light.text} />
          </Pressable>
        )}
      </View>

      {browseState ? (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.href}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.browserHeader}>
              <Text style={styles.sectionTitle}>目录内容</Text>
              <Text style={styles.browserMeta}>
                已选择 {selectedEntries.length} 项{importProgress ? `，已导入 ${importProgress.completed}/${importProgress.total}` : ''}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <EmptyState loading={loading} text={loading ? '正在读取目录...' : '这个目录里暂时没有内容。'} />
          }
          renderItem={({ item }) => (
            <WebDavEntryRow
              entry={item}
              selected={selectedHrefs.includes(item.href)}
              disabled={importing}
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
          ListHeaderComponent={<Text style={styles.sectionTitle}>我的目录</Text>}
          ListEmptyComponent={
            <EmptyState loading={false} text="右上角添加 WebDAV 目录后，可以在这里进入浏览并批量导入书籍。" />
          }
          renderItem={({ item }) => (
            <DirectoryCard
              directory={item}
              onPress={() => openDirectory(item)}
              onEdit={() => openEditDirectory(item)}
              onDelete={() => deleteDirectory(item)}
            />
          )}
        />
      )}

      <DirectoryModal
        visible={modalOpen}
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
  onPress,
  onEdit,
  onDelete,
}: {
  directory: WebDavDirectory;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.directoryCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`浏览 ${directory.name}`}
        onPress={onPress}
        style={({ pressed }) => [styles.directoryMain, pressed && styles.pressed]}>
        <View style={styles.directoryIcon}>
          <Server size={24} color={Colors.light.text} />
        </View>
        <View style={styles.directoryCopy}>
          <Text style={styles.directoryName} numberOfLines={1}>
            {directory.name}
          </Text>
          <Text style={styles.directoryUrl} numberOfLines={2}>
            {directory.url}
          </Text>
          <Text style={styles.directoryMeta}>{directory.username ? `账号 ${directory.username}` : '无账号'}</Text>
        </View>
      </Pressable>
      <View style={styles.directoryActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`编辑 ${directory.name}`}
          onPress={onEdit}
          style={({ pressed }) => [styles.cardIconButton, pressed && styles.pressed]}>
          <Pencil size={20} color={Colors.light.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`删除 ${directory.name}`}
          onPress={onDelete}
          style={({ pressed }) => [styles.cardIconButton, styles.dangerIconButton, pressed && styles.pressed]}>
          <Trash2 size={20} color={Colors.light.danger} />
        </Pressable>
      </View>
    </View>
  );
}

function WebDavEntryRow({
  entry,
  selected,
  disabled,
  onToggle,
  onPress,
}: {
  entry: WebDavEntry;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  onPress: () => void;
}) {
  return (
    <View style={styles.entry}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected, disabled }}
        accessibilityLabel={`选择 ${entry.name}`}
        disabled={disabled}
        onPress={onToggle}
        hitSlop={Spacing.one}
        style={styles.checkboxTouch}>
        <View style={[styles.checkboxBox, selected && styles.checkboxBoxSelected]}>
          {selected ? <Check size={14} color={Colors.light.surface} strokeWidth={3} /> : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={entry.type === 'directory' ? `进入 ${entry.name}` : entry.name}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.entryMain, pressed && styles.pressed]}>
        {entry.type === 'directory' ? (
          <Folder size={24} color={Colors.light.text} />
        ) : (
          <FileText size={24} color={Colors.light.textSecondary} />
        )}
        <View style={styles.entryCopy}>
          <Text style={styles.entryName} numberOfLines={1}>
            {entry.name}
          </Text>
        </View>
        {entry.type === 'directory' ? <ChevronRight size={20} color={Colors.light.textSecondary} /> : null}
      </Pressable>
    </View>
  );
}

function DirectoryModal({
  visible,
  editing,
  form,
  onChange,
  onClose,
  onSave,
}: {
  visible: boolean;
  editing: boolean;
  form: { name: string; url: string; username: string; password: string };
  onChange: (form: { name: string; url: string; username: string; password: string }) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editing ? '编辑目录' : '添加目录'}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="关闭" onPress={onClose} style={styles.modalClose}>
              <X size={22} color={Colors.light.text} />
            </Pressable>
          </View>
          <LabeledInput
            label="目录名称"
            value={form.name}
            onChangeText={(name) => onChange({ ...form, name })}
            placeholder="我的 WebDAV"
          />
          <LabeledInput
            label="目录地址"
            value={form.url}
            onChangeText={(url) => onChange({ ...form, url })}
            placeholder="https://example.com/dav/books/"
          />
          <LabeledInput
            label="用户名"
            value={form.username}
            onChangeText={(username) => onChange({ ...form, username })}
            placeholder="可选"
          />
          <LabeledInput
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
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
            <Text style={styles.saveButtonText}>{editing ? '保存修改' : '保存目录'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.light.textSecondary}
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
    </View>
  );
}

function EmptyState({ loading, text }: { loading: boolean; text: string }) {
  return (
    <View style={styles.empty}>
      {loading ? <ActivityIndicator color={Colors.light.text} /> : null}
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

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
  },
  entryName: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.light.text,
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
