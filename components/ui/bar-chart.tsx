import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  LayoutChangeEvent,
  LayoutRectangle,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

import { useTooltip } from './tooltip-provider';

export type BarChartDataPoint = {
  label: string;
  value: number;
};

const BAR_CHART_HEIGHT = 120;
const MIN_BAR_HEIGHT = 4;

type BarChartProps = {
  data: BarChartDataPoint[];
  barColor?: string;
  maxValue?: number;
  /** When set, used for range tooltip label instead of concatenating point labels. (startIndex, endIndex) => label */
  getRangeLabel?: (startIndex: number, endIndex: number) => string;
};

type BarLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BarItemProps = {
  barWidth: number;
  barHeight: number;
  barFill: string;
  barBackground: string;
  isActive: boolean;
  isSelected: boolean;
  hasValue: boolean;
  reduceMotionEnabled: boolean;
};

const easeOut = Easing.bezier(0.215, 0.61, 0.355, 1);
const easeInOut = Easing.bezier(0.645, 0.045, 0.355, 1);

function BarItem({
  barWidth,
  barHeight,
  barFill,
  barBackground,
  isActive,
  isSelected,
  hasValue,
  reduceMotionEnabled,
}: BarItemProps) {
  const animatedHeight = useRef(new Animated.Value(reduceMotionEnabled ? barHeight : 0)).current;
  const previousHeight = useRef(barHeight);

  useEffect(() => {
    if (reduceMotionEnabled) {
      animatedHeight.setValue(barHeight);
      previousHeight.current = barHeight;
      return;
    }

    const wasVisible = previousHeight.current > 0;
    const isVisible = barHeight > 0;
    const duration = !wasVisible && isVisible ? 200 : wasVisible && !isVisible ? 160 : 220;
    const easing = wasVisible && isVisible ? easeInOut : easeOut;

    Animated.timing(animatedHeight, {
      toValue: barHeight,
      duration,
      easing,
      useNativeDriver: false,
    }).start();

    previousHeight.current = barHeight;
  }, [animatedHeight, barHeight, reduceMotionEnabled]);

  return (
    <>
      <View
        pointerEvents="none"
        style={[
          styles.barBackground,
          {
            width: barWidth,
            backgroundColor: isActive || isSelected ? barBackground : 'transparent',
          },
        ]}
      />
      <Animated.View
        style={[
          styles.bar,
          {
            width: barWidth,
            height: animatedHeight,
            backgroundColor: barFill,
            borderRadius: 0,
          },
        ]}
      />
    </>
  );
}

export function BarChart({
  data,
  barColor,
  maxValue: maxValueProp,
  getRangeLabel,
}: BarChartProps) {
  const { width } = useWindowDimensions();
  const barFill = barColor ?? '#30A46C';
  const barBackground = useThemeColor({ light: '#EFEFEF', dark: '#222' }, 'background');

  const maxValue =
    maxValueProp ??
    (data.length > 0 ? Math.max(...data.map((d) => d.value), 1) : 1);
  const barCount = data.length || 1;
  const gap = 6;
  const totalGaps = (barCount - 1) * gap;
  const barWidth = Math.max(12, (width - 32 - totalGaps) / barCount);

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const barLayoutsRef = useRef<Record<number, BarLayout>>({});
  const chartLayoutRef = useRef<LayoutRectangle | null>(null);
  const isWeb = Platform.OS === 'web';
  const dragStartIndexRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const didMoveRef = useRef(false);
  const selectedRangeRef = useRef<{ start: number; end: number } | null>(null);
  
  const { show: showTooltip, hide: hideTooltip } = useTooltip();
  
  // Store tooltip functions in refs to avoid dependency changes
  const showTooltipRef = useRef(showTooltip);
  const hideTooltipRef = useRef(hideTooltip);
  showTooltipRef.current = showTooltip;
  hideTooltipRef.current = hideTooltip;
  
  // Store data in ref for callbacks
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    selectedRangeRef.current = selectedRange;
  }, [selectedRange]);

  useEffect(() => {
    if (!selectedRangeRef.current) return;
    if (data.length === 0) {
      setSelectedRange(null);
      hideTooltipRef.current();
      return;
    }

    const { start, end } = selectedRangeRef.current;
    if (start >= data.length || end >= data.length) {
      setSelectedRange(null);
      hideTooltipRef.current();
    }
  }, [data.length]);

  useEffect(() => {
    let isMounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (isMounted) setReduceMotionEnabled(value);
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );

    return () => {
      isMounted = false;
      subscription?.remove?.();
    };
  }, []);

  const handleBarLayout = useCallback((index: number, event: LayoutChangeEvent) => {
    const { x, y, width: w, height: h } = event.nativeEvent.layout;
    barLayoutsRef.current[index] = { x, y, width: w, height: h };
  }, []);

  const handleChartLayout = useCallback((event: LayoutChangeEvent) => {
    chartLayoutRef.current = event.nativeEvent.layout;
  }, []);

  const showTooltipForBar = useCallback((index: number) => {
    const barLayout = barLayoutsRef.current[index];
    const chartLayout = chartLayoutRef.current;
    const point = dataRef.current[index];
    
    if (!barLayout || !chartLayout || !point) return;

    // Calculate absolute position of the bar
    const triggerLayout: LayoutRectangle = {
      x: chartLayout.x + barLayout.x + 16, // +16 for container padding
      y: chartLayout.y + barLayout.y,
      width: barLayout.width,
      height: barLayout.height,
    };

    showTooltipRef.current({
      label: point.label,
      value: `${point.value} ${point.value === 1 ? 'event' : 'events'}`,
      triggerLayout,
    });
  }, []);

  const showTooltipForRange = useCallback((start: number, end: number) => {
    const chartLayout = chartLayoutRef.current;
    const points = dataRef.current;
    if (!chartLayout || points.length === 0) return;

    const rangeStart = Math.min(start, end);
    const rangeEnd = Math.max(start, end);
    const startLayout = barLayoutsRef.current[rangeStart];
    const endLayout = barLayoutsRef.current[rangeEnd];
    if (!startLayout || !endLayout) return;

    const total = points
      .slice(rangeStart, rangeEnd + 1)
      .reduce((sum, point) => sum + point.value, 0);
    const label =
      rangeStart === rangeEnd
        ? points[rangeStart].label
        : getRangeLabel
          ? getRangeLabel(rangeStart, rangeEnd)
          : `${points[rangeStart].label}–${points[rangeEnd].label}`;

    const minX = Math.min(startLayout.x, endLayout.x);
    const maxX = Math.max(startLayout.x + startLayout.width, endLayout.x + endLayout.width);

    const triggerLayout: LayoutRectangle = {
      x: chartLayout.x + minX + 16,
      y: chartLayout.y,
      width: Math.max(1, maxX - minX),
      height: BAR_CHART_HEIGHT,
    };

    showTooltipRef.current({
      label,
      value: `${total} ${total === 1 ? 'event' : 'events'}`,
      triggerLayout,
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedRange(null);
    setActiveIndex(null);
    hideTooltipRef.current();
  }, []);

  // Web: hover handlers
  const handleMouseEnter = useCallback((index: number) => {
    if (isWeb) {
      if (selectedRangeRef.current) return;
      setActiveIndex(index);
      showTooltipForBar(index);
    }
  }, [isWeb, showTooltipForBar]);

  const handleChartMouseLeave = useCallback(() => {
    if (isWeb) {
      if (selectedRangeRef.current) return;
      setActiveIndex(null);
      hideTooltipRef.current();
    }
  }, [isWeb]);

  // Native: tap to toggle
  const handlePress = useCallback((index: number) => {
    if (!isWeb) {
      if (isDraggingRef.current) return;
      const currentRange = selectedRangeRef.current;
      const isSameSingleSelection =
        currentRange && currentRange.start === currentRange.end && currentRange.start === index;
      if (isSameSingleSelection) {
        clearSelection();
        return;
      }
      setActiveIndex(index);
      setSelectedRange({ start: index, end: index });
      showTooltipForRange(index, index);
    }
  }, [clearSelection, isWeb, showTooltipForRange]);

  const getIndexFromX = useCallback((x: number) => {
    if (data.length === 0) return 0;
    const slotWidth = barWidth + gap;
    const rawIndex = Math.floor(x / slotWidth);
    return Math.max(0, Math.min(rawIndex, data.length - 1));
  }, [barWidth, data.length]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        if (data.length === 0) return;
        isDraggingRef.current = true;
        didMoveRef.current = false;
        const startIndex = getIndexFromX(event.nativeEvent.locationX);
        dragStartIndexRef.current = startIndex;
        const currentRange = selectedRangeRef.current;
        const isSameSingleSelection =
          currentRange && currentRange.start === currentRange.end && currentRange.start === startIndex;
        if (!isSameSingleSelection) {
          setSelectedRange({ start: startIndex, end: startIndex });
          showTooltipForRange(startIndex, startIndex);
        }
      },
      onPanResponderMove: (event) => {
        if (!isDraggingRef.current) return;
        didMoveRef.current = true;
        const startIndex = dragStartIndexRef.current;
        if (startIndex === null) return;
        const currentIndex = getIndexFromX(event.nativeEvent.locationX);
        const currentRange = selectedRangeRef.current;
        if (!currentRange || currentRange.start !== startIndex || currentRange.end !== currentIndex) {
          setSelectedRange({ start: startIndex, end: currentIndex });
          showTooltipForRange(startIndex, currentIndex);
        }
      },
      onPanResponderRelease: () => {
        isDraggingRef.current = false;
        const startIndex = dragStartIndexRef.current;
        const currentRange = selectedRangeRef.current;
        if (!didMoveRef.current && startIndex !== null) {
          const isSameSingleSelection =
            currentRange && currentRange.start === currentRange.end && currentRange.start === startIndex;
          if (isSameSingleSelection) {
            clearSelection();
          }
        }
        dragStartIndexRef.current = null;
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        dragStartIndexRef.current = null;
      },
    })
  ).current;

  return (
    <Pressable
      style={[styles.container, { width }]}
      onPress={() => {
        if (selectedRangeRef.current) clearSelection();
      }}
    >
      <View
        style={[styles.chart, { height: BAR_CHART_HEIGHT }]}
        onLayout={handleChartLayout}
        {...(isWeb ? { onMouseLeave: handleChartMouseLeave } : {})}
        {...panResponder.panHandlers}
      >
        {data.map((point, index) => {
          const hasValue = point.value > 0;
          const heightRatio = maxValue > 0 ? point.value / maxValue : 0;
          const barHeight = hasValue
            ? Math.max(MIN_BAR_HEIGHT, heightRatio * (BAR_CHART_HEIGHT - 8))
            : 0;
          const isActive = activeIndex === index;
          const rangeStart = selectedRange ? Math.min(selectedRange.start, selectedRange.end) : -1;
          const rangeEnd = selectedRange ? Math.max(selectedRange.start, selectedRange.end) : -1;
          const isSelected = selectedRange ? index >= rangeStart && index <= rangeEnd : false;

          return (
            <Pressable
              key={`${point.label}-${index}`}
              style={[
                styles.barWrapper,
                { width: barWidth, marginRight: index < data.length - 1 ? gap : 0 },
              ]}
              onLayout={(e) => handleBarLayout(index, e)}
              onPress={() => handlePress(index)}
              // Web-only hover events via props spreading
              {...(isWeb ? {
                onMouseEnter: () => handleMouseEnter(index),
              } : {})}
            >
              <BarItem
                barWidth={barWidth}
                barHeight={barHeight}
                barFill={barFill}
                barBackground={barBackground}
                isActive={isActive}
                isSelected={isSelected}
                hasValue={hasValue}
                reduceMotionEnabled={reduceMotionEnabled}
              />
            </Pressable>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  barWrapper: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    position: 'relative',
  },
  barBackground: {
    position: 'absolute',
    bottom: 0,
    height: '100%',
  },
  bar: {
    alignSelf: 'center',
  },
});
