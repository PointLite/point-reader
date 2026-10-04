import { ImportAction, ShelfHeader, ShelfListHeader } from '@/features/library/shelf-components';
import { shelfItemKey, sortLabels } from '@/features/library/shelf-model';
import { styles } from '@/features/library/shelf-styles';
import type { SortField } from '@/features/library/types';
import { useShelfScreenController } from '@/features/library/use-shelf';
import { type I18nKey } from '@/shared/i18n/index';
import { modalAnimationType } from '@/shared/theme/motion';
import { Spacing, TouchTarget } from '@/shared/theme/tokens';
import { InkButton } from '@/shared/ui/ink-button';
import { router } from 'expo-router';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  Cloud,
  FilePlus2,
  FolderPlus,
  Info,
  Trash2,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

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
        <View
          style={[styles.selectionSheet, { borderColor: colors.accent, backgroundColor: colors.surface }]}>
          <Text style={[styles.selectionTitle, { color: colors.text }]}>
            {folderSelection ? t('selectedFolder') : t('selectedBooks', { count: selectedCount })}
          </Text>
          <View style={styles.sheetActions}>
            {folderSelection ? (
              <InkButton
                colors={colors}
                label={t('ungroup')}
                icon={FolderPlus}
                onPress={ungroupSelectedFolder}
              />
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
                  onPress={() =>
                    router.push({ pathname: '/book/[bookId]', params: { bookId: selectedIds[0] } })
                  }
                />
                <InkButton
                  colors={colors}
                  label={t('delete')}
                  icon={Trash2}
                  variant="danger"
                  onPress={deleteSelection}
                />
              </>
            )}
          </View>
        </View>
      ) : null}

      <Modal
        visible={showSort}
        transparent
        animationType={modalAnimationType(einkOptimization)}
        onRequestClose={() => setShowSort(false)}>
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
                maxHeight: Math.max(
                  TouchTarget * 2,
                  height - (sortMenuFrame ? sortMenuFrame.y + sortMenuFrame.height : 0) - Spacing.four
                ),
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
                  <Text
                    style={[
                      styles.sortMenuText,
                      { color: colors.text },
                      selected && { color: colors.surface },
                    ]}>
                    {t(sortLabels[field] as I18nKey)}
                  </Text>
                </Pressable>
              );
            })}
            <View style={[styles.sortMenuSeparator, { backgroundColor: colors.border }]} />
            {(
              [
                { direction: 'asc', label: t('ascending'), icon: ArrowDownAZ },
                { direction: 'desc', label: t('descending'), icon: ArrowUpAZ },
              ] as const
            ).map((item) => {
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
                  <Text
                    style={[
                      styles.sortMenuText,
                      { color: colors.text },
                      selected && { color: colors.surface },
                    ]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showImportOptions}
        transparent
        animationType="none"
        onRequestClose={() => closeImportOptions()}>
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
            <Text style={[styles.importSheetHint, { color: colors.textSecondary }]}>
              {t('chooseImportSource')}
            </Text>
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

      <Modal
        visible={renameGroupOpen}
        transparent
        animationType={modalAnimationType(einkOptimization)}
        onRequestClose={() => setRenameGroupOpen(false)}>
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
              <InkButton
                colors={colors}
                label={t('cancel')}
                variant="quiet"
                onPress={() => setRenameGroupOpen(false)}
              />
              <InkButton
                colors={colors}
                label={t('save')}
                variant="primary"
                disabled={!renameGroupName.trim()}
                onPress={saveRenameGroup}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
