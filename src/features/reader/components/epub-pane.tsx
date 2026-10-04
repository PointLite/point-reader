import { clamp } from '@/shared/math';
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { createEpubCssVars } from '../epub/appearance';
import {
  createEpubCommandScript,
  parseEpubMessage,
  shouldAllowEpubNavigation,
  type EpubCommand,
} from '../epub/bridge';
import { createEpubPagedHtml } from '../epub/paged-document';
import { progressToEpubPosition } from '../epub/position';
import { createEpubScrollHtml } from '../epub/scroll-document';

import { readerBackgroundFor, readerForegroundFor } from '@/features/reader/content';
import type { EpubHtmlBook } from '@/features/reader/epub/content';
import type { ReadingSettings } from '@/features/settings/types';

export type EpubPaneHandle = {
  seekToProgress: (progress: number) => void;
  resume: () => void;
  turnPage: (delta: -1 | 1) => void;
};

type EpubPaneProps = {
  mode: 'scroll' | 'tap';
  ref?: React.Ref<EpubPaneHandle>;
  book: EpubHtmlBook;
  settings: ReadingSettings;
  systemColorScheme?: 'light' | 'dark' | null;
  initialIndex: number;
  initialOffset: number;
  initialProgress: number;
  onProgress: (progress: number, chapterIndex: number, href: string, chapterOffset: number) => void;
  onTap: (x: number, width: number) => void;
  onImagePress: (uri: string) => void;
  onRecoverRequired: () => void;
};

export function EpubPane({
  mode,
  ref,
  book,
  settings,
  systemColorScheme,
  initialIndex,
  initialOffset,
  initialProgress,
  onProgress,
  onTap,
  onImagePress,
  onRecoverRequired,
}: EpubPaneProps) {
  const webViewRef = useRef<WebView>(null);
  const [initialSnapshot] = useState(() => ({
    index: initialIndex,
    offset: initialOffset > 0 && initialOffset <= 1 ? initialOffset : 0,
    progress: initialProgress,
    settings,
  }));
  const [contentReady, setContentReady] = useState(initialSnapshot.progress <= 0.015);
  const createDocument = mode === 'scroll' ? createEpubScrollHtml : createEpubPagedHtml;
  const html = createDocument(
    book,
    initialSnapshot.settings,
    systemColorScheme,
    initialSnapshot.index,
    initialSnapshot.offset,
    initialSnapshot.progress
  );
  const source = { html };

  const seekToProgress = (progress: number) => {
    if (mode === 'scroll') {
      const { index, offset } = progressToEpubPosition(progress, Math.max(1, book.chapters.length));
      injectEpubCommand(webViewRef, 'jumpToOffset', [index, offset]);
    } else {
      injectEpubCommand(webViewRef, 'seekToProgress', [progress]);
    }
  };

  const resume = () => {
    injectEpubCommand(webViewRef, 'resume', [createEpubCssVars(settings, systemColorScheme)]);
  };

  const turnPage = (delta: -1 | 1) => {
    injectEpubCommand(webViewRef, 'go', [delta]);
  };

  useImperativeHandle(ref, () => ({
    seekToProgress,
    resume,
    turnPage,
  }));

  useEffect(() => {
    injectEpubCommand(webViewRef, 'applySettings', [createEpubCssVars(settings, systemColorScheme)]);
  }, [settings, systemColorScheme]);

  const handleMessage = (event: WebViewMessageEvent) => {
    const payload = parseEpubMessage(event.nativeEvent.data);
    if (!payload) return;
    if (payload.type === 'tap') {
      onTap(Number(payload.x), Number(payload.width));
      return;
    }
    if (payload.type === 'image' && typeof payload.src === 'string') {
      onImagePress(payload.src);
      return;
    }
    if (payload.type === 'ready') {
      setContentReady(true);
      return;
    }
    if (payload.type === 'progress') {
      setContentReady(true);
      onProgress(
        clamp(Number(payload.progress), 0, 1),
        Number(payload.index) || 0,
        String(payload.href || ''),
        clamp(Number(payload.offset), 0, 1)
      );
    }
  };

  return (
    <View style={styles.webViewReaderHost}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={source}
        javaScriptEnabled
        scrollEnabled={mode === 'scroll'}
        textZoom={100}
        bounces={false}
        overScrollMode="never"
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={mode === 'scroll' && !settings.hideScrollbar}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={(request) => shouldAllowEpubNavigation(request.url)}
        onLoadEnd={() =>
          injectEpubCommand(webViewRef, 'applySettings', [createEpubCssVars(settings, systemColorScheme)])
        }
        onContentProcessDidTerminate={onRecoverRequired}
        style={[
          styles.webViewReader,
          { backgroundColor: readerBackgroundFor(settings, systemColorScheme) },
          !contentReady && styles.webViewReaderHidden,
        ]}
      />
      {!contentReady ? (
        <View
          style={[
            styles.epubRestoreOverlay,
            { backgroundColor: readerBackgroundFor(settings, systemColorScheme) },
          ]}>
          <ActivityIndicator color={readerForegroundFor(settings, systemColorScheme)} />
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
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
});

function injectEpubCommand(
  webViewRef: React.RefObject<WebView | null>,
  command: EpubCommand,
  args: unknown[]
) {
  webViewRef.current?.injectJavaScript(createEpubCommandScript(command, args));
}
