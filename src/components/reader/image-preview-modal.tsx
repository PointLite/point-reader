import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useTranslation } from '@/lib/i18n';
import { modalAnimationType } from '@/lib/motion';

const MIN_PREVIEW_SCALE = 1;
const MAX_PREVIEW_SCALE = 4;

export function ImagePreviewModal({
  uri,
  einkOptimization,
  onClose,
}: {
  uri: string | null;
  einkOptimization: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const [imageRatio, setImageRatio] = useState(1);
  const [scale] = useState(() => new Animated.Value(1));
  const [translateX] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(0));
  const scaleValue = useRef(1);
  const offsetValue = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const gestureStart = useRef({ x: 0, y: 0 });
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);
  const tapStart = useRef({ x: 0, y: 0, time: 0 });
  const didPinch = useRef(false);
  const didDrag = useRef(false);
  const previewWidth = width;
  const previewHeight = Math.max(1, width * imageRatio);

  useEffect(() => {
    scaleValue.current = 1;
    offsetValue.current = { x: 0, y: 0 };
    panStart.current = { x: 0, y: 0 };
    pinchStartDistance.current = 0;
    pinchStartScale.current = 1;
    didPinch.current = false;
    didDrag.current = false;
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
  }, [scale, translateX, translateY, uri]);

  useEffect(() => {
    if (!uri) return;
    Image.getSize(
      uri,
      (imageWidth, imageHeight) => {
        if (imageWidth > 0 && imageHeight > 0) {
          setImageRatio(imageHeight / imageWidth);
        }
      },
      () => setImageRatio(1)
    );
  }, [uri]);

  const setPreviewOffset = useCallback(
    (x: number, y: number, nextScale?: number) => {
      const resolvedScale = nextScale ?? scaleValue.current;
      const maxX = Math.max(0, (previewWidth * resolvedScale - width) / 2);
      const maxY = Math.max(0, (previewHeight * resolvedScale - height) / 2);
      const nextX = clamp(x, -maxX, maxX);
      const nextY = clamp(y, -maxY, maxY);
      offsetValue.current = { x: nextX, y: nextY };
      translateX.setValue(nextX);
      translateY.setValue(nextY);
    },
    [height, previewHeight, previewWidth, translateX, translateY, width]
  );

  return (
    <Modal visible={Boolean(uri)} transparent animationType={modalAnimationType(einkOptimization)} onRequestClose={onClose}>
      <View
        accessible
        accessibilityRole="imagebutton"
        accessibilityLabel={t('imagePreviewClose')}
        style={styles.backdrop}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => {
          const touches = event.nativeEvent.touches;
          didPinch.current = touches.length >= 2;
          if (touches.length >= 2) {
            pinchStartDistance.current = distanceBetweenTouches(touches);
            pinchStartScale.current = scaleValue.current;
            return;
          }
          didDrag.current = false;
          panStart.current = offsetValue.current;
          gestureStart.current = {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          };
          tapStart.current = {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
            time: event.nativeEvent.timestamp,
          };
        }}
        onResponderMove={(event) => {
          const touches = event.nativeEvent.touches;
          if (touches.length < 2) {
            const canMoveX = previewWidth * scaleValue.current > width;
            const canMoveY = previewHeight * scaleValue.current > height;
            if (!canMoveX && !canMoveY) return;
            const dx = event.nativeEvent.pageX - gestureStart.current.x;
            const dy = event.nativeEvent.pageY - gestureStart.current.y;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
              didDrag.current = true;
            }
            setPreviewOffset(panStart.current.x + dx, panStart.current.y + dy);
            return;
          }
          didPinch.current = true;
          const nextDistance = distanceBetweenTouches(touches);
          if (!pinchStartDistance.current || !nextDistance) return;
          const nextScale = clamp(
            pinchStartScale.current * (nextDistance / pinchStartDistance.current),
            MIN_PREVIEW_SCALE,
            MAX_PREVIEW_SCALE
          );
          scaleValue.current = nextScale;
          scale.setValue(nextScale);
          setPreviewOffset(offsetValue.current.x, offsetValue.current.y, nextScale);
        }}
        onResponderRelease={(event) => {
          if (didPinch.current) {
            didPinch.current = false;
            return;
          }

          if (didDrag.current) {
            didDrag.current = false;
            return;
          }

          const dx = Math.abs(event.nativeEvent.pageX - tapStart.current.x);
          const dy = Math.abs(event.nativeEvent.pageY - tapStart.current.y);
          const duration = event.nativeEvent.timestamp - tapStart.current.time;
          if (dx < 10 && dy < 10 && duration < 360) {
            onClose();
          }
        }}
        onResponderTerminate={() => {
          didPinch.current = false;
          didDrag.current = false;
        }}>
        {uri ? (
          <Animated.View
            style={[
              styles.imageFrame,
              {
                width: previewWidth,
                height: previewHeight,
                transform: [{ translateX }, { translateY }, { scale }],
              },
            ]}>
            <Image source={{ uri }} resizeMode="contain" style={styles.image} />
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

function distanceBetweenTouches(touches: readonly { pageX: number; pageY: number }[]) {
  if (touches.length < 2) return 0;
  const [first, second] = touches;
  return Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFrame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
