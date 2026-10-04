import { ImagePreviewModal } from '@/features/reader/components/image-preview-modal';
import { PdfPane } from '@/features/reader/components/pdf-pane';
import { BatteryBadge, disabledToolColor, PageTurnButtons } from '@/features/reader/components/reader-chrome';
import { ProgressToolIcon, ReaderSheet } from '@/features/reader/components/reader-sheet';
import { TapTextPane, TextScrollPane } from '@/features/reader/components/text-pane';
import { styles } from '@/features/reader/reader-styles';
import { TEXT_BLOCK_INCREMENT } from '@/features/reader/text';
import { useReaderScreenController } from '@/features/reader/use-reader';
import { animateLayoutIfEnabled } from '@/shared/theme/motion';
import { StatusBar } from 'expo-status-bar';
import { List, Sun, Type, X } from 'lucide-react-native';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EpubPane } from './components/epub-pane';

export default function ReaderScreen() {
  const controller = useReaderScreenController();
  const {
    backgroundColor,
    battery,
    book,
    chapters,
    closeReader,
    closeToolbar,
    currentChapterHref,
    currentChapterIndex,
    currentChapterTitle,
    disabledReaderSheets,
    displayProgress,
    epubHtmlBook,
    epubPaneRef,
    epubReaderKey,
    fontToolDisabled,
    foregroundColor,
    guardProgressForStyleChange,
    handleEpubProgress,
    handlePagedEpubTap,
    openImagePreview,
    pdfPaneRef,
    previewImageUri,
    progressText,
    readerChromeColors,
    readerIsDark,
    rebuildEpubReader,
    resolveSheetChapterIndex,
    scheduleProgressSave,
    seekToProgress,
    selectChapter,
    setPreviewImageUri,
    setRenderedBlockCount,
    setSheet,
    settings,
    sheetChapters,
    showReaderPageButtons,
    systemColorScheme,
    t,
    textBlocks,
    textScrollRequest,
    textTurnRequest,
    textWindowStart,
    themeToolDisabled,
    time,
    toggleToolbar,
    toolbarBorder,
    toolbarIconActiveColor,
    toolbarIconColor,
    toolbarOpen,
    toolbarSurface,
    updateSettings,
    visibleSheet,
    visibleTextBlocks,
  } = controller;

  if (!book) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor }]}>
        <View style={styles.centeredLoader}>
          <ActivityIndicator color={foregroundColor} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor }]}>
      <StatusBar hidden={!settings.alwaysShowStatusBar} style={readerIsDark ? 'light' : 'dark'} />
      <View style={[styles.readerTop, { backgroundColor }]}>
        <Text style={[styles.chapterTitle, { color: foregroundColor }]} numberOfLines={1}>
          {currentChapterTitle}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('closeReader')}
          disabled={!toolbarOpen}
          pointerEvents={toolbarOpen ? 'auto' : 'none'}
          onPress={closeReader}
          style={[styles.readerCloseButton, !toolbarOpen && styles.readerCloseButtonHidden]}>
          <X size={22} color={foregroundColor} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={styles.readerBody}>
        {book.format === 'epub' ? (
          epubHtmlBook ? (
            <EpubPane
              ref={epubPaneRef}
              key={`${book.id}:${epubReaderKey}:${settings.mode}`}
              mode={settings.mode}
              book={epubHtmlBook}
              settings={settings}
              systemColorScheme={systemColorScheme}
              initialIndex={currentChapterIndex}
              initialOffset={book.currentOffset}
              initialProgress={book.progress}
              onTap={settings.mode === 'scroll' ? toggleToolbar : handlePagedEpubTap}
              onImagePress={openImagePreview}
              onRecoverRequired={rebuildEpubReader}
              onProgress={handleEpubProgress}
            />
          ) : (
            <View style={styles.centeredLoader}>
              <ActivityIndicator color={foregroundColor} />
            </View>
          )
        ) : book.format === 'pdf' ? (
          <PdfPane
            ref={pdfPaneRef}
            key={book.id}
            book={book}
            colors={readerChromeColors}
            onProgress={scheduleProgressSave}
            onToggleToolbar={toggleToolbar}
          />
        ) : settings.mode === 'scroll' ? (
          <TextScrollPane
            blocks={visibleTextBlocks}
            totalBlocks={textBlocks.length}
            totalChapters={chapters.length}
            initialBlockIndex={Math.min(
              Math.max(0, Math.floor(book.currentOffset) - textWindowStart),
              Math.max(0, visibleTextBlocks.length - 1)
            )}
            scrollRequest={textScrollRequest}
            settings={settings}
            foregroundColor={foregroundColor}
            onLoadMore={() =>
              setRenderedBlockCount((count) =>
                Math.min(Math.max(count, textWindowStart) + TEXT_BLOCK_INCREMENT, textBlocks.length)
              )
            }
            onProgress={scheduleProgressSave}
            onToggleToolbar={toggleToolbar}
          />
        ) : (
          <TapTextPane
            book={book}
            chapters={chapters}
            settings={settings}
            turnRequest={textTurnRequest}
            foregroundColor={foregroundColor}
            onProgress={scheduleProgressSave}
            onToggleToolbar={toggleToolbar}
          />
        )}
        {showReaderPageButtons ? (
          <PageTurnButtons
            foregroundColor={foregroundColor}
            onPrevious={() => epubPaneRef.current?.turnPage(settings.swapTapZones ? 1 : -1)}
            onNext={() => epubPaneRef.current?.turnPage(settings.swapTapZones ? -1 : 1)}
          />
        ) : null}
      </View>

      <View style={[styles.statusBar, { backgroundColor }]}>
        <View style={styles.statusLeft}>
          <Text style={[styles.statusText, { color: foregroundColor }]}>{time}</Text>
          <BatteryBadge value={battery} color={foregroundColor} />
        </View>
        <Text style={[styles.statusText, { color: foregroundColor }]}>{progressText}</Text>
      </View>

      {toolbarOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('closeToolbar')}
          onPress={closeToolbar}
          style={styles.toolbarBackdrop}
        />
      ) : null}

      {visibleSheet ? (
        <ReaderSheet
          sheet={visibleSheet}
          settings={settings}
          systemColorScheme={systemColorScheme}
          colors={readerChromeColors}
          progress={displayProgress}
          chapters={sheetChapters}
          hasChapters={sheetChapters.length > 0}
          currentChapterIndex={currentChapterIndex}
          currentChapterHref={currentChapterHref}
          onSelectChapter={selectChapter}
          onSettings={updateSettings}
          onStyleChange={guardProgressForStyleChange}
          onSeekProgress={seekToProgress}
          disabledSheets={disabledReaderSheets}
          resolveChapterIndex={resolveSheetChapterIndex}
        />
      ) : null}

      {toolbarOpen ? (
        <View style={[styles.toolbar, { backgroundColor: toolbarSurface, borderTopColor: toolbarBorder }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('toc')}
            onPress={() => {
              animateLayoutIfEnabled(settings.einkOptimization);
              setSheet('toc');
            }}
            style={[
              styles.toolbarIconButton,
              visibleSheet === 'toc' && [
                styles.toolbarIconButtonActive,
                { backgroundColor: readerChromeColors.backgroundSelected },
              ],
            ]}>
            <List
              size={28}
              strokeWidth={2.2}
              color={visibleSheet === 'toc' ? toolbarIconActiveColor : toolbarIconColor}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('background')}
            accessibilityState={{ disabled: themeToolDisabled }}
            disabled={themeToolDisabled}
            onPress={() => {
              animateLayoutIfEnabled(settings.einkOptimization);
              setSheet('theme');
            }}
            style={[
              styles.toolbarIconButton,
              visibleSheet === 'theme' && [
                styles.toolbarIconButtonActive,
                { backgroundColor: readerChromeColors.backgroundSelected },
              ],
              themeToolDisabled && styles.toolbarIconButtonDisabled,
            ]}>
            <Sun
              size={28}
              strokeWidth={2.2}
              color={
                themeToolDisabled
                  ? disabledToolColor(toolbarIconColor)
                  : visibleSheet === 'theme'
                    ? toolbarIconActiveColor
                    : toolbarIconColor
              }
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('progress')}
            onPress={() => {
              animateLayoutIfEnabled(settings.einkOptimization);
              setSheet('progress');
            }}
            style={[
              styles.toolbarIconButton,
              visibleSheet === 'progress' && [
                styles.toolbarIconButtonActive,
                { backgroundColor: readerChromeColors.backgroundSelected },
              ],
            ]}>
            <ProgressToolIcon
              color={visibleSheet === 'progress' ? toolbarIconActiveColor : toolbarIconColor}
              backgroundColor={toolbarSurface}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('font')}
            accessibilityState={{ disabled: fontToolDisabled }}
            disabled={fontToolDisabled}
            onPress={() => {
              animateLayoutIfEnabled(settings.einkOptimization);
              setSheet('font');
            }}
            style={[
              styles.toolbarIconButton,
              visibleSheet === 'font' && [
                styles.toolbarIconButtonActive,
                { backgroundColor: readerChromeColors.backgroundSelected },
              ],
              fontToolDisabled && styles.toolbarIconButtonDisabled,
            ]}>
            <Type
              size={30}
              strokeWidth={2.1}
              color={
                fontToolDisabled
                  ? disabledToolColor(toolbarIconColor)
                  : visibleSheet === 'font'
                    ? toolbarIconActiveColor
                    : toolbarIconColor
              }
            />
          </Pressable>
        </View>
      ) : null}

      <ImagePreviewModal
        uri={previewImageUri}
        einkOptimization={settings.einkOptimization}
        onClose={() => setPreviewImageUri(null)}
      />
    </SafeAreaView>
  );
}
