import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
} from 'react';
import {
  LayoutRectangle,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useThemeColor } from '@/hooks/use-theme-color';

const isWeb = Platform.OS === 'web';
const TOOLTIP_PADDING_V = isWeb ? 9 : 5;
const TOOLTIP_LABEL_LINE_HEIGHT = isWeb ? 18 : 12;
const TOOLTIP_LINES_GAP = isWeb ? 3 : 3;
const TOOLTIP_MIN_HEIGHT = isWeb ? 42 : 36;
const TOOLTIP_MIN_WIDTH = isWeb ? 90 : 72;
const TOOLTIP_GAP = isWeb ? 6 : 4;
const TOOLTIP_LINE_HEIGHT = isWeb ? 21 : 15;

type TooltipSide = 'left' | 'right';

export type TooltipLine = { label: string; value: string };

type TooltipData = {
  label: string;
  value: string;
  /** When set, tooltip shows label and these lines instead of value. Used e.g. for Completed / Pending / Missed durations. */
  lines?: TooltipLine[];
  triggerLayout: LayoutRectangle;
  side?: TooltipSide;
  /** When true, tooltip is centered within triggerLayout instead of positioned beside it. Used on mobile. */
  centered?: boolean;
};

type TooltipContextType = {
  show: (data: TooltipData) => void;
  hide: () => void;
};

const TooltipContext = createContext<TooltipContextType | null>(null);

export function useTooltip() {
  const context = useContext(TooltipContext);
  if (!context) {
    throw new Error('useTooltip must be used within a TooltipProvider');
  }
  return context;
}

type TooltipProviderProps = {
  children: React.ReactNode;
};

export function TooltipProvider({ children }: TooltipProviderProps) {
  const { width: screenWidth } = useWindowDimensions();
  const tooltipBg = useThemeColor(
    { light: '#ffffff', dark: '#000000' },
    'background'
  );
  const tooltipFg = useThemeColor(
    { light: '#1a1a1a', dark: '#ffffff' },
    'text'
  );
  const tooltipBorder = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.15)' },
    'background'
  );

  // Use refs to track state without causing re-renders
  const isVisibleRef = useRef(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animated values
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(0.9);

  // Force update for content changes
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  const contentRef = useRef<{
    label: string;
    value: string;
    lines?: TooltipLine[] | undefined;
    side: TooltipSide;
  }>({
    label: '',
    value: '',
    side: 'right',
  });

  const getTooltipHeight = useCallback((data: TooltipData) => {
    if (data.lines && data.lines.length > 0) {
      return Math.max(
        TOOLTIP_MIN_HEIGHT,
        TOOLTIP_PADDING_V + TOOLTIP_LABEL_LINE_HEIGHT + TOOLTIP_LINES_GAP + data.lines.length * TOOLTIP_LINE_HEIGHT + TOOLTIP_PADDING_V
      );
    }
    return TOOLTIP_MIN_HEIGHT;
  }, []);

  const calculatePosition = useCallback(
    (data: TooltipData) => {
      const { triggerLayout } = data;
      const tooltipWidth = TOOLTIP_MIN_WIDTH;
      const tooltipHeight = getTooltipHeight(data);

      // Centered mode: overlay tooltip in the center of the trigger area (used on mobile)
      if (data.centered) {
        const x = triggerLayout.x + triggerLayout.width / 2 - tooltipWidth / 2;
        const y = triggerLayout.y + triggerLayout.height / 2 - tooltipHeight / 2;
        return {
          x: Math.max(8, Math.min(x, screenWidth - tooltipWidth - 8)),
          y,
          side: 'right' as TooltipSide,
          width: tooltipWidth,
        };
      }

      // Calculate available space on each side
      const spaceOnRight =
        screenWidth - (triggerLayout.x + triggerLayout.width);
      const spaceOnLeft = triggerLayout.x;

      // Determine which side to show
      const needsSpace = tooltipWidth + TOOLTIP_GAP;
      const preferredSide = data.side;
      let side: TooltipSide;

      if (preferredSide) {
        side = preferredSide;
      } else if (spaceOnRight >= needsSpace) {
        side = 'right';
      } else if (spaceOnLeft >= needsSpace) {
        side = 'left';
      } else {
        side = 'right'; // fallback
      }

      // Calculate position
      let x: number;
      if (side === 'right') {
        x =
          triggerLayout.x +
          triggerLayout.width +
          TOOLTIP_GAP;
      } else {
        x =
          triggerLayout.x -
          tooltipWidth -
          TOOLTIP_GAP;
      }

      // Clamp x to screen bounds
      x = Math.max(8, Math.min(x, screenWidth - tooltipWidth - 8));

      // Center vertically with trigger
      const y =
        triggerLayout.y + triggerLayout.height / 2 - tooltipHeight / 2;

      return { x, y, side, width: tooltipWidth };
    },
    [screenWidth, getTooltipHeight]
  );

  const show = useCallback(
    (data: TooltipData) => {
      // Clear any pending hide timeout
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }

      const position = calculatePosition(data);
      const wasVisible = isVisibleRef.current;

      // Update content ref and trigger re-render only if content changed
      const contentChanged =
        contentRef.current.label !== data.label ||
        contentRef.current.value !== data.value ||
        contentRef.current.side !== position.side ||
        JSON.stringify(contentRef.current.lines) !== JSON.stringify(data.lines);

      if (contentChanged) {
        contentRef.current = {
          label: data.label,
          value: data.value,
          lines: data.lines,
          side: position.side,
        };
        forceUpdate();
      }

      if (wasVisible) {
        // Already showing - animate to new position smoothly
        cancelAnimation(translateX);
        cancelAnimation(translateY);
        cancelAnimation(opacity);
        cancelAnimation(scale);
        translateX.value = withTiming(position.x, {
          duration: 180,
          easing: Easing.inOut(Easing.cubic),
        });
        translateY.value = withTiming(position.y, {
          duration: 180,
          easing: Easing.inOut(Easing.cubic),
        });
        // Ensure tooltip is fully visible (may have been mid-hide animation)
        opacity.value = withTiming(1, {
          duration: 100,
          easing: Easing.out(Easing.cubic),
        });
        scale.value = withTiming(1, {
          duration: 100,
          easing: Easing.out(Easing.cubic),
        });
      } else {
        // First show - set position immediately, then fade in
        isVisibleRef.current = true;
        translateX.value = position.x;
        translateY.value = position.y;
        opacity.value = withTiming(1, {
          duration: 160,
          easing: Easing.out(Easing.cubic),
        });
        scale.value = withTiming(1, {
          duration: 160,
          easing: Easing.out(Easing.cubic),
        });
      }
    },
    [calculatePosition, translateX, translateY, opacity, scale]
  );

  const hide = useCallback(() => {
    if (!isVisibleRef.current) return;

    opacity.value = withTiming(0, {
      duration: 120,
      easing: Easing.out(Easing.cubic),
    });
    scale.value = withTiming(0.96, {
      duration: 120,
      easing: Easing.out(Easing.cubic),
    });

    // Clear visibility after animation
    hideTimeoutRef.current = setTimeout(() => {
      isVisibleRef.current = false;
      hideTimeoutRef.current = null;
    }, 100);
  }, [opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Memoize context value with stable references
  const contextValue = React.useMemo(
    () => ({ show, hide }),
    [show, hide]
  );

  const { label, value, lines } = contentRef.current;
  const hasLines = lines && lines.length > 0;
  const tooltipHeight = hasLines
    ? Math.max(
        TOOLTIP_MIN_HEIGHT,
        TOOLTIP_PADDING_V + TOOLTIP_LABEL_LINE_HEIGHT + TOOLTIP_LINES_GAP + lines!.length * TOOLTIP_LINE_HEIGHT + TOOLTIP_PADDING_V
      )
    : TOOLTIP_MIN_HEIGHT;

  return (
    <TooltipContext.Provider value={contextValue}>
      {children}
      <Animated.View
        style={[
          styles.tooltip,
          {
            backgroundColor: tooltipBg,
            minHeight: tooltipHeight,
            borderWidth: 1,
            borderColor: tooltipBorder,
          },
          animatedStyle,
        ]}
        pointerEvents="none"
      >
        <Text style={[styles.tooltipLabel, { color: tooltipFg }]}>
          {label}
        </Text>
        {hasLines ? (
          <View style={styles.tooltipLines}>
            {lines!.map((line) => (
              <View key={line.label} style={styles.tooltipLineRow}>
                <Text style={[styles.tooltipLineLabel, { color: tooltipFg }]}>
                  {line.label}
                </Text>
                <Text style={[styles.tooltipLineValue, { color: tooltipFg }]}>
                  {line.value}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.tooltipValue, { color: tooltipFg }]}>
            {value}
          </Text>
        )}
      </Animated.View>
    </TooltipContext.Provider>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    top: 0,
    left: 0,
    minHeight: TOOLTIP_MIN_HEIGHT,
    minWidth: TOOLTIP_MIN_WIDTH,
    borderRadius: isWeb ? 9 : 8,
    paddingHorizontal: isWeb ? 12 : 10,
    paddingVertical: isWeb ? 9 : 5,
    justifyContent: 'center',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isWeb ? 0.1 : 0.25,
    shadowRadius: isWeb ? 4 : 4,
    elevation: 5,
    zIndex: 9999,
  },
  tooltipLabel: {
    fontSize: isWeb ? 13.5 : 10,
    fontFamily: isWeb ? 'ui-monospace, monospace' : Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontWeight: isWeb ? '300' : '400',
    opacity: isWeb ? 0.6 : 0.85,
    textAlign: 'left',
    lineHeight: isWeb ? 18 : undefined,
  },
  tooltipValue: {
    fontSize: isWeb ? 15 : 11,
    fontFamily: isWeb ? 'ui-monospace, monospace' : Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontWeight: '400',
    textAlign: 'left',
    lineHeight: isWeb ? 20 : undefined,
  },
  tooltipLines: {
    marginTop: isWeb ? 3 : 3,
    alignSelf: 'stretch',
  },
  tooltipLineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: TOOLTIP_LINE_HEIGHT,
    gap: isWeb ? 12 : 12,
  },
  tooltipLineLabel: {
    fontSize: isWeb ? 13.5 : 10,
    fontFamily: isWeb ? 'ui-monospace, monospace' : Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontWeight: isWeb ? '300' : '400',
    opacity: isWeb ? 0.6 : 0.9,
    lineHeight: isWeb ? 18 : undefined,
  },
  tooltipLineValue: {
    fontSize: isWeb ? 13.5 : 10,
    fontFamily: isWeb ? 'ui-monospace, monospace' : Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontWeight: '400',
    lineHeight: isWeb ? 18 : undefined,
  },
});
