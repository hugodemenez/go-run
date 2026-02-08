import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
} from 'react';
import { LayoutRectangle, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  Easing,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';

const TOOLTIP_HEIGHT = 40;
const TOOLTIP_MIN_WIDTH = 80;
const TOOLTIP_GAP = 4;

type TooltipSide = 'left' | 'right';

type TooltipData = {
  label: string;
  value: string;
  triggerLayout: LayoutRectangle;
  side?: TooltipSide;
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
  const contentRef = useRef<{ label: string; value: string; side: TooltipSide }>({
    label: '',
    value: '',
    side: 'right',
  });

  const calculatePosition = useCallback(
    (data: TooltipData) => {
      const { triggerLayout } = data;
      const tooltipWidth = TOOLTIP_MIN_WIDTH;

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
        triggerLayout.y + triggerLayout.height / 2 - TOOLTIP_HEIGHT / 2;

      return { x, y, side, width: tooltipWidth };
    },
    [screenWidth]
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
        contentRef.current.side !== position.side;

      if (contentChanged) {
        contentRef.current = {
          label: data.label,
          value: data.value,
          side: position.side,
        };
        forceUpdate();
      }

      if (wasVisible) {
        // Already showing - animate to new position smoothly
        cancelAnimation(translateX);
        cancelAnimation(translateY);
        translateX.value = withTiming(position.x, {
          duration: 180,
          easing: Easing.inOut(Easing.cubic),
        });
        translateY.value = withTiming(position.y, {
          duration: 180,
          easing: Easing.inOut(Easing.cubic),
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

  const { label, value } = contentRef.current;

  return (
    <TooltipContext.Provider value={contextValue}>
      {children}
      <Animated.View
        className="absolute top-0 left-0 h-10 min-w-20 rounded-lg px-3 py-1.5 justify-center items-start bg-tooltip z-[9999] shadow-md"
        style={animatedStyle}
        pointerEvents="none"
      >
        <ThemedText className="text-[11px] font-medium opacity-80 text-left text-tooltip-foreground">
          {label}
        </ThemedText>
        <ThemedText className="text-[13px] font-semibold text-left text-tooltip-foreground">
          {value}
        </ThemedText>
      </Animated.View>
    </TooltipContext.Provider>
  );
}
