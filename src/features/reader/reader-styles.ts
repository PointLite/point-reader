import { readerForeground } from '@/features/reader/content';
import { Colors, Radius, Spacing, TouchTarget } from '@/shared/theme/tokens';
import { StyleSheet } from 'react-native';

const READER_TOOLBAR_HEIGHT = 68;

const BATTERY_BODY_WIDTH = 26;

const BATTERY_BODY_HEIGHT = 14;

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  readerTop: {
    position: 'relative',
    minHeight: 46,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
  chapterTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
    color: 'rgba(28,25,23,0.62)',
  },
  readerCloseButton: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -Spacing.two,
  },
  readerCloseButtonHidden: {
    opacity: 0,
  },
  readerBody: {
    flex: 1,
    position: 'relative',
  },
  webViewReaderHost: {
    flex: 1,
  },
  webViewReader: {
    flex: 1,
  },
  webViewReaderHidden: {
    opacity: 0,
  },
  epubRestoreOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContent: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
  },
  chapterBlock: {
    gap: Spacing.three,
  },
  textChapterTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '900',
    color: readerForeground,
  },
  readerText: {
    color: readerForeground,
  },
  chapterDivider: {
    height: 1,
    backgroundColor: 'rgba(28,25,23,0.18)',
    marginVertical: Spacing.three,
  },
  lazyFooter: {
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  lazyFooterText: {
    fontSize: 13,
    fontWeight: '800',
    color: readerForeground,
  },
  statusBar: {
    minHeight: 28,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  statusText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '400',
    color: 'rgba(28,25,23,0.62)',
  },
  batteryBadge: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  batteryBody: {
    position: 'relative',
    width: BATTERY_BODY_WIDTH,
    height: BATTERY_BODY_HEIGHT,
    borderWidth: 1.5,
    borderColor: 'rgba(28,25,23,0.62)',
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  batteryBadgeText: {
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '700',
    includeFontPadding: false,
    color: 'rgba(28,25,23,0.7)',
  },
  batteryCap: {
    width: 2.5,
    height: 6,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(28,25,23,0.62)',
  },
  toolbarBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: READER_TOOLBAR_HEIGHT,
    zIndex: 8,
    backgroundColor: 'transparent',
  },
  toolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: READER_TOOLBAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.one,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,25,23,0.16)',
    backgroundColor: Colors.light.surface,
    zIndex: 30,
  },
  toolbarIconButton: {
    width: 52,
    height: 52,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarIconButtonActive: {
    backgroundColor: Colors.light.backgroundSelected,
  },
  toolbarIconButtonDisabled: {
    opacity: 0.42,
  },

  tocItemCurrent: {
    backgroundColor: Colors.light.backgroundElement,
  },

  tapPane: {
    flex: 1,
  },
  pageButtons: {
    position: 'absolute',
    left: Spacing.two,
    right: Spacing.two,
    top: '50%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    transform: [{ translateY: -24 }],
    zIndex: 6,
  },
  pageButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(28,25,23,0.4)',
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
