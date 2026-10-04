import { DirectoryLoadingOverlay, WebDavMainList, WebDavTopBar } from '@/features/webdav/browser-components';
import { styles } from '@/features/webdav/browser-styles';
import { DirectoryModal } from '@/features/webdav/directory-modal';
import { SortModal } from '@/features/webdav/sort-modal';
import { useWebDavScreenController } from '@/features/webdav/use-browser';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export function closeToHome() {
  router.dismissAll();
  router.replace('/');
}

export default function WebDavScreen() {
  const {
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
  } = useWebDavScreenController();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <WebDavTopBar
        colors={colors}
        browseState={browseState}
        loading={loading}
        importing={importing}
        selectedCount={selectedEntries.length}
        onBack={goBack}
        onAddDirectory={openAddDirectory}
        onImportSelection={importSelection}
      />

      <WebDavMainList
        colors={colors}
        browseState={browseState}
        loading={loading}
        importing={importing}
        importState={webDavImport}
        selectedCount={selectedEntries.length}
        selectedHrefSet={selectedHrefSet}
        sortedEntries={sortedEntries}
        directories={directories}
        sortButtonRef={sortButtonRef}
        onOpenSort={openSortMenu}
        onToggleEntry={toggleSelected}
        onOpenEntry={openEntry}
        onOpenDirectory={openDirectory}
        onEditDirectory={openEditDirectory}
        onDeleteDirectory={deleteDirectory}
      />

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
        urlInvalid={urlInputInvalid}
        onChange={(nextForm) => {
          setForm(nextForm);
          if (nextForm.url.trim()) setUrlInputInvalid(false);
        }}
        onClose={closeDirectoryModal}
        onSave={saveDirectory}
      />
    </SafeAreaView>
  );
}
