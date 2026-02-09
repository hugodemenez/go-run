import MaterialIcons from '@expo/vector-icons/MaterialIcons';
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
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

import { useTooltip } from './tooltip-provider';

/** Status counts for stacked bars. When set, bar is drawn as stacked segments by status. */
export type BarChartStacked = {
  pending?: number;
  completed?: number;
  error?: number;
};

export type BarChartDataPoint = {
  label: string;
  value: number;
  /** When set, bar is drawn as stacked segments with status-based colors. */
  stacked?: BarChartStacked;
};

const STATUS_ORDER: (keyof BarChartStacked)[] = ['pending', 'completed', 'error'];

const STATUS_COLORS: Record<keyof BarChartStacked, string> = {
  pending: '#8E8E93',   // gray
  completed: '#30A46C',  // green
  error: '#E5484D',      // red
};

function getPointTotal(d: BarChartDataPoint): number {
  if (d.stacked) {
    return (d.stacked.pending ?? 0) + (d.stacked.completed ?? 0) + (d.stacked.error ?? 0);
  }
  return d.value;
}

/** Format seconds as "0s", "45min", "1h 30min", etc. */
function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}min`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

function getStackedSegments(
  point: BarChartDataPoint,
  maxVal: number,
  chartHeight: number,
  minBarHeight: number
): StackedSegment[] {
  if (!point.stacked || maxVal <= 0) return [];
  const total = getPointTotal(point);
  if (total <= 0) return [];
  const totalBarHeight = Math.max(minBarHeight, (total / maxVal) * (chartHeight - 8));
  return STATUS_ORDER.filter((s) => (point.stacked![s] ?? 0) > 0).map((status) => {
    const count = point.stacked![status] ?? 0;
    const height = (count / total) * totalBarHeight;
    return { status, height, fill: STATUS_COLORS[status] };
  });
}

const BAR_CHART_HEIGHT = 120;
const MINIMAP_HEIGHT = 40;
const MIN_BAR_HEIGHT = 4;

type BarChartProps = {
  data: BarChartDataPoint[];
  barColor?: string;
  maxValue?: number;
  /** When set, used for range tooltip label instead of concatenating point labels. (startIndex, endIndex) => label */
  getRangeLabel?: (startIndex: number, endIndex: number) => string;
  /** When true, chart starts expanded; when false, starts as minimap. Default true. */
  defaultExpanded?: boolean;
  /** When true, shows the minimap (1/3 width) as expand/collapse control on mobile only. Default true. */
  showMinimapToggle?: boolean;
  /** When set, shown next to the minimap (right-aligned). e.g. current month/year from calendar. */
  monthYearLabel?: string;
  /** When set, highlights this bar index with the same style as hover (e.g. from calendar scroll/hover). */
  highlightedIndex?: number | null;
  /** Called when a bar is pressed (e.g. to scroll calendar to that week). */
  onBarPress?: (index: number) => void;
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

type StackedSegment = { status: keyof BarChartStacked; height: number; fill: string };

type StackedBarItemProps = {
  barWidth: number;
  segments: StackedSegment[];
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
          },
        ]}
      />
    </>
  );
}

function StackedBarItem({
  barWidth,
  segments,
  barBackground,
  isActive,
  isSelected,
  hasValue,
  reduceMotionEnabled,
}: StackedBarItemProps) {
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
      <View style={[styles.stackedBarColumn, { width: barWidth }]}>
        {segments.map((seg) => (
          <StackedBarSegment
            key={seg.status}
            barWidth={barWidth}
            height={seg.height}
            fill={seg.fill}
            reduceMotionEnabled={reduceMotionEnabled}
          />
        ))}
      </View>
    </>
  );
}

function StackedBarSegment({
  barWidth,
  height,
  fill,
  reduceMotionEnabled,
}: {
  barWidth: number;
  height: number;
  fill: string;
  reduceMotionEnabled: boolean;
}) {
  const animatedHeight = useRef(new Animated.Value(reduceMotionEnabled ? height : 0)).current;
  const previousHeight = useRef(height);

  useEffect(() => {
    if (reduceMotionEnabled) {
      animatedHeight.setValue(height);
      previousHeight.current = height;
      return;
    }
    const wasVisible = previousHeight.current > 0;
    const isVisible = height > 0;
    const duration = !wasVisible && isVisible ? 200 : wasVisible && !isVisible ? 160 : 220;
    const easing = wasVisible && isVisible ? easeInOut : easeOut;
    Animated.timing(animatedHeight, {
      toValue: height,
      duration,
      easing,
      useNativeDriver: false,
    }).start();
    previousHeight.current = height;
  }, [animatedHeight, height, reduceMotionEnabled]);

  if (height <= 0) return null;

  return (
    <Animated.View
      style={[
        styles.stackedBarSegment,
        {
          width: barWidth,
          height: animatedHeight,
          backgroundColor: fill,
        },
      ]}
    />
  );
}

export function BarChart({
  data,
  barColor,
  maxValue: maxValueProp,
  getRangeLabel,
  defaultExpanded = true,
  showMinimapToggle = true,
  monthYearLabel,
  highlightedIndex: highlightedIndexProp = null,
  onBarPress,
}: BarChartProps) {
  const { width } = useWindowDimensions();
  const barFill = barColor ?? '#30A46C';
  const barBackground = useThemeColor({ light: '#EFEFEF', dark: '#222' }, 'background');
  const iconColor = useThemeColor({ light: '#666', dark: '#999' }, 'text');
  const labelColor = useThemeColor({ light: '#111', dark: '#F5F5F5' }, 'text');
  const isWeb = Platform.OS === 'web';
  const showMinimap = showMinimapToggle && !isWeb;

  const containerPadding = 32;
  const contentWidth = width - containerPadding;
  const gap = 6;
  const minimapWidth = contentWidth / 3;
  const mainChartWidth = contentWidth;

  const maxValue =
    maxValueProp ??
    (data.length > 0 ? Math.max(...data.map(getPointTotal), 1) : 1);
  const barCount = data.length || 1;
  const totalGaps = (barCount - 1) * gap;
  const mainBarWidth = Math.max(12, (mainChartWidth - totalGaps) / barCount);
  const minimapBarWidth = Math.max(2, (minimapWidth - totalGaps) / barCount);

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const barLayoutsRef = useRef<Record<number, BarLayout>>({});
  const chartLayoutRef = useRef<LayoutRectangle | null>(null);
  const chartHeightRef = useRef(BAR_CHART_HEIGHT);
  chartHeightRef.current = BAR_CHART_HEIGHT;
  const dragStartIndexRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const didMoveRef = useRef(false);
  const selectedRangeRef = useRef<{ start: number; end: number } | null>(null);

  const highlightedIndex =
    highlightedIndexProp != null &&
    highlightedIndexProp >= 0 &&
    highlightedIndexProp < data.length
      ? highlightedIndexProp
      : null;

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

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
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

    const stacked = point.stacked;
    if (stacked) {
      showTooltipRef.current({
        label: point.label,
        value: '',
        lines: [
          { label: 'Completed', value: formatDuration(stacked.completed ?? 0) },
          { label: 'Pending', value: formatDuration(stacked.pending ?? 0) },
          { label: 'Missed', value: formatDuration(stacked.error ?? 0) },
        ],
        triggerLayout,
      });
    } else {
      const total = getPointTotal(point);
      showTooltipRef.current({
        label: point.label,
        value: `${total} ${total === 1 ? 'event' : 'events'}`,
        triggerLayout,
      });
    }
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

    const rangePoints = points.slice(rangeStart, rangeEnd + 1);
    const hasStacked = rangePoints.some((p) => p.stacked);
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
      height: chartHeightRef.current,
    };

    if (hasStacked) {
      const aggregated = rangePoints.reduce(
        (acc, point) => {
          const s = point.stacked;
          if (s) {
            acc.completed += s.completed ?? 0;
            acc.pending += s.pending ?? 0;
            acc.error += s.error ?? 0;
          }
          return acc;
        },
        { completed: 0, pending: 0, error: 0 }
      );
      showTooltipRef.current({
        label,
        value: '',
        lines: [
          { label: 'Completed', value: formatDuration(aggregated.completed) },
          { label: 'Pending', value: formatDuration(aggregated.pending) },
          { label: 'Missed', value: formatDuration(aggregated.error) },
        ],
        triggerLayout,
      });
    } else {
      const total = rangePoints.reduce((sum, point) => sum + getPointTotal(point), 0);
      showTooltipRef.current({
        label,
        value: `${total} ${total === 1 ? 'event' : 'events'}`,
        triggerLayout,
      });
    }
  }, [getRangeLabel]);

  // Show tooltip for externally highlighted index (e.g. calendar scroll/hover) when no local hover/selection
  useEffect(() => {
    if (
      highlightedIndex != null &&
      activeIndex === null &&
      selectedRangeRef.current == null
    ) {
      showTooltipForBar(highlightedIndex);
      return () => hideTooltipRef.current();
    }
  }, [highlightedIndex, activeIndex, showTooltipForBar]);

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

  // Native: tap to toggle; both platforms: notify parent (e.g. for calendar scroll)
  const handlePress = useCallback(
    (index: number) => {
      onBarPress?.(index);
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
    },
    [clearSelection, isWeb, onBarPress, showTooltipForRange]
  );

  const getIndexFromX = useCallback((x: number) => {
    if (data.length === 0) return 0;
    const slotWidth = mainBarWidth + gap;
    const rawIndex = Math.floor(x / slotWidth);
    return Math.max(0, Math.min(rawIndex, data.length - 1));
  }, [mainBarWidth, data.length]);

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

  const renderMinimapBars = () =>
    data.map((point, index) => {
      const total = getPointTotal(point);
      const hasValue = total > 0;
      const stackedSegments = getStackedSegments(point, maxValue, MINIMAP_HEIGHT, MIN_BAR_HEIGHT);
      const isStacked = stackedSegments.length > 0;
      const barHeight = !isStacked && hasValue
        ? Math.max(MIN_BAR_HEIGHT, (total / maxValue) * (MINIMAP_HEIGHT - 8))
        : 0;

      return (
        <View
          key={`minimap-${point.label}-${index}`}
          style={[
            styles.barWrapper,
            { width: minimapBarWidth, marginRight: index < data.length - 1 ? gap : 0 },
          ]}
        >
          {isStacked ? (
            <StackedBarItem
              barWidth={minimapBarWidth}
              segments={stackedSegments}
              barBackground={barBackground}
              isActive={false}
              isSelected={false}
              hasValue={hasValue}
              reduceMotionEnabled={reduceMotionEnabled}
            />
          ) : (
            <BarItem
              barWidth={minimapBarWidth}
              barHeight={barHeight}
              barFill={barFill}
              barBackground={barBackground}
              isActive={false}
              isSelected={false}
              hasValue={hasValue}
              reduceMotionEnabled={reduceMotionEnabled}
            />
          )}
        </View>
      );
    });

  const minimapBlock =
    showMinimap && !isExpanded ? (
      <View style={styles.minimapRow}>
        <View style={styles.minimapRowLeft}>
          {monthYearLabel != null && monthYearLabel !== '' && (
            <Text style={[styles.monthYearLabel, { color: labelColor }]} numberOfLines={1}>
              {monthYearLabel}
            </Text>
          )}
        </View>
        <Pressable
          style={[styles.minimap, { width: minimapWidth, height: MINIMAP_HEIGHT }]}
          onPress={toggleExpanded}
          accessibilityLabel="Expand chart"
          accessibilityRole="button"
        >
          <View style={styles.chart}>
            {renderMinimapBars()}
          </View>
        </Pressable>
      </View>
    ) : null;

  const mainChart =
    !showMinimap || isExpanded ? (
      <View style={styles.mainChartWrap}>
        <View
          style={[styles.chart, { width: mainChartWidth, height: BAR_CHART_HEIGHT }]}
          onLayout={handleChartLayout}
          {...(isWeb ? { onMouseLeave: handleChartMouseLeave } : {})}
          {...panResponder.panHandlers}
        >
          {data.map((point, index) => {
            const total = getPointTotal(point);
            const hasValue = total > 0;
            const stackedSegments = getStackedSegments(point, maxValue, BAR_CHART_HEIGHT, MIN_BAR_HEIGHT);
            const isStacked = stackedSegments.length > 0;
            const barHeight = !isStacked && hasValue
              ? Math.max(MIN_BAR_HEIGHT, (total / maxValue) * (BAR_CHART_HEIGHT - 8))
              : 0;
            const isActiveFromHover = activeIndex === index;
            const isActiveFromHighlight =
              highlightedIndex !== null &&
              highlightedIndex === index &&
              activeIndex === null &&
              !selectedRange;
            const isActive = isActiveFromHover || isActiveFromHighlight;
            const rangeStart = selectedRange ? Math.min(selectedRange.start, selectedRange.end) : -1;
            const rangeEnd = selectedRange ? Math.max(selectedRange.start, selectedRange.end) : -1;
            const isSelected = selectedRange ? index >= rangeStart && index <= rangeEnd : false;

            return (
              <Pressable
                key={`${point.label}-${index}`}
                style={[
                  styles.barWrapper,
                  { width: mainBarWidth, marginRight: index < data.length - 1 ? gap : 0 },
                ]}
                onLayout={(e) => handleBarLayout(index, e)}
                onPress={() => handlePress(index)}
                {...(isWeb ? { onMouseEnter: () => handleMouseEnter(index) } : {})}
              >
                {isStacked ? (
                  <StackedBarItem
                    barWidth={mainBarWidth}
                    segments={stackedSegments}
                    barBackground={barBackground}
                    isActive={isActive}
                    isSelected={isSelected}
                    hasValue={hasValue}
                    reduceMotionEnabled={reduceMotionEnabled}
                  />
                ) : (
                  <BarItem
                    barWidth={mainBarWidth}
                    barHeight={barHeight}
                    barFill={barFill}
                    barBackground={barBackground}
                    isActive={isActive}
                    isSelected={isSelected}
                    hasValue={hasValue}
                    reduceMotionEnabled={reduceMotionEnabled}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
        {showMinimap && isExpanded && (
          <Pressable
            style={styles.collapseButton}
            onPress={toggleExpanded}
            hitSlop={8}
            accessibilityLabel="Collapse chart"
            accessibilityRole="button"
          >
            <MaterialIcons name="keyboard-arrow-down" size={24} color={iconColor} />
          </Pressable>
        )}
      </View>
    ) : null;

  return (
    <Pressable
      style={[styles.container, { width }]}
      onPress={() => {
        if (selectedRangeRef.current) clearSelection();
      }}
    >
      <View style={[styles.chartRow, showMinimap && !isExpanded && styles.chartRowCollapsed]}>
        {mainChart}
        {minimapBlock}
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
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  chartRowCollapsed: {
    width: '100%',
  },
  minimapRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    width: '100%',
  },
  minimapRowLeft: {
    flex: 1,
  },
  monthYearLabel: {
    fontSize: 24,
    fontWeight: '600',
  },
  mainChartWrap: {
    position: 'relative',
    width: '100%',
  },
  collapseButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: 4,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  minimap: {
    flexShrink: 0,
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
  stackedBarColumn: {
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'center',
    alignSelf: 'stretch',
    minHeight: 0,
  },
  stackedBarSegment: {
    alignSelf: 'center',
    minHeight: 0,
  },
});
