import React, { forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReAnimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { WorkoutCard } from '@/components/workout/workout-card';
import { useCreateWorkout, useDeleteWorkout, useUpdateWorkout, useWorkouts } from '@/hooks/use-workouts';
import type { Workout } from '@/types/workout';
import {
  DAY_LABELS,
  getCurrentWeekIndex,
  getWeekInfo,
  getWeekNumber,
  TOTAL_WEEKS,
  weekIndexToStartDate,
  type DayInfo,
} from '@/utils/calendar';
import type { SharedValue } from 'react-native-reanimated';

const COLUMNS = 8; // 7 days + 1 summary
const MOBILE_BREAKPOINT = 600;

const ROW_HEIGHT = 192;
const HEADER_HEIGHT = 40;
const MOBILE_CELL_HEIGHT = 136;
const MOBILE_ROW_HEIGHT = COLUMNS * MOBILE_CELL_HEIGHT;

// --- Mobile drag-and-drop context ---
type MobileDragContextValue = {
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  containerScreenX: SharedValue<number>;
  containerScreenY: SharedValue<number>;
  fingerOffsetX: SharedValue<number>;
  fingerOffsetY: SharedValue<number>;
  /** Only pass serializable primitives from worklets – no Date / complex objects */
  startMobileDrag: (weekIndex: number, dayIndex: number, absX: number, absY: number) => void;
  endMobileDrag: (absX: number, absY: number) => void;
};

const MobileDragContext = React.createContext<MobileDragContextValue | null>(null);

function cellKey(weekIndex: number, dayIndex: number) {
  return `${weekIndex}-${dayIndex}`;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string) {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDurationFromSec(seconds: number): string {
  if (seconds <= 0) return '0';
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function formatWorkoutSubtitle(workout: Workout): string | undefined {
  const hasDuration = workout.durationSec > 0;
  const hasDistance = workout.distanceMeters > 0;
  if (!hasDuration && !hasDistance) return workout.description ?? undefined;
  const parts: string[] = [];
  if (hasDuration) parts.push(formatDurationFromSec(workout.durationSec));
  if (hasDistance) {
    const km = workout.distanceMeters / 1000;
    parts.push(km >= 1 ? `${km.toFixed(1)}km` : `${workout.distanceMeters}m`);
  }
  return (parts.join(' · ') || workout.description) ?? undefined;
}

export type CellCardData = {
  state: 'input' | 'pending' | 'completed' | 'error';
  value: string;
  dateKey: string;
};

const STATUS_ORDER: Workout['status'][] = ['pending', 'completed', 'error'];

const DayCell = React.memo(function DayCell({
  day,
  cellWidth,
  weekIndex,
  dayIndex,
  cardData,
  workout,
  onPress,
  onCardChangeText,
  onCardSubmit,
  onCardCycleIcon,
  onCardEdit,
  onCardDelete,
  showDayLabel,
  fillWidth,
  onDragStartFromCell,
  onDragEndFromCell,
  onDropOnCell,
}: {
  day: DayInfo;
  cellWidth: number;
  weekIndex: number;
  dayIndex: number;
  cardData: CellCardData | undefined;
  workout?: Workout;
  onPress: (weekIndex: number, dayIndex: number) => void;
  onCardChangeText: (weekIndex: number, dayIndex: number, text: string) => void;
  onCardSubmit: (weekIndex: number, dayIndex: number) => void;
  onCardCycleIcon: (weekIndex: number, dayIndex: number, workout?: Workout) => void;
  onCardEdit: (weekIndex: number, dayIndex: number, workout?: Workout) => void;
  onCardDelete: (weekIndex: number, dayIndex: number, workout?: Workout) => void;
  showDayLabel?: boolean;
  fillWidth?: boolean;
  onDragStartFromCell?: (weekIndex: number, dayIndex: number, workout: Workout) => void;
  onDragEndFromCell?: () => void;
  onDropOnCell?: (weekIndex: number, dayIndex: number) => void;
}) {
  const dayLabel = showDayLabel ? DAY_LABELS[day.date.getDay()] : null;

  const weekdayShort = day.date.toLocaleString('default', { weekday: 'short' });
  const monthShort = day.date.toLocaleString('default', { month: 'short' });

  const hasCardContent =
    cardData?.state === 'input' ||
    (workout == null &&
      (cardData?.state === 'pending' ||
        cardData?.state === 'completed' ||
        cardData?.state === 'error')) ||
    workout != null;
  const showMobilePlaceholder = showDayLabel && !hasCardContent;

  // Web drag-and-drop: drop target via direct DOM manipulation
  const [isDragOver, setIsDragOver] = useState(false);
  const cellRef = useRef<View>(null);
  const onDropOnCellRef = useRef(onDropOnCell);
  onDropOnCellRef.current = onDropOnCell;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = cellRef.current as any;
    if (!node) return;

    let counter = 0;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    };
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      counter++;
      if (counter === 1) setIsDragOver(true);
    };
    const handleDragLeave = () => {
      counter--;
      if (counter === 0) setIsDragOver(false);
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      counter = 0;
      setIsDragOver(false);
      onDropOnCellRef.current?.(weekIndex, dayIndex);
    };

    node.addEventListener('dragover', handleDragOver);
    node.addEventListener('dragenter', handleDragEnter);
    node.addEventListener('dragleave', handleDragLeave);
    node.addEventListener('drop', handleDrop);

    return () => {
      node.removeEventListener('dragover', handleDragOver);
      node.removeEventListener('dragenter', handleDragEnter);
      node.removeEventListener('dragleave', handleDragLeave);
      node.removeEventListener('drop', handleDrop);
    };
  }, [weekIndex, dayIndex]);

  const cardState: CellCardData['state'] =
    cardData?.state === 'input'
      ? 'input'
      : workout != null
        ? workout.status
        : (cardData?.state ?? 'pending');

  // Mobile drag gesture (long press + pan)
  // IMPORTANT: only pass serializable primitives (numbers) through runOnJS – never pass
  // objects containing Date instances as they cannot be transferred between UI/JS threads.
  const mobileDragCtx = useContext(MobileDragContext);
  const panGesture = useMemo(() => {
    if (Platform.OS === 'web' || !workout || cardData?.state === 'input' || !mobileDragCtx) return null;

    const { startMobileDrag, endMobileDrag, dragX, dragY, containerScreenX: csx, containerScreenY: csy, fingerOffsetX: foX, fingerOffsetY: foY } = mobileDragCtx;

    return Gesture.Pan()
      .activateAfterLongPress(400)
      .onStart((e) => {
        runOnJS(startMobileDrag)(weekIndex, dayIndex, e.absoluteX, e.absoluteY);
      })
      .onUpdate((e) => {
        // Convert screen-absolute to container-relative, accounting for finger offset
        dragX.value = e.absoluteX - csx.value - foX.value;
        dragY.value = e.absoluteY - csy.value - foY.value;
      })
      .onEnd((e) => {
        runOnJS(endMobileDrag)(e.absoluteX, e.absoluteY);
      });
  }, [workout?.id, weekIndex, dayIndex, cardData?.state, mobileDragCtx]);

  return (
    <Pressable
      ref={cellRef}
      className={`justify-center items-center border-r border-border ${day.isToday ? 'bg-cell-today' : 'bg-cell'} ${showDayLabel ? 'border-r-0' : ''} justify-start items-start pt-2 px-2 ${showDayLabel ? 'pb-2 min-h-[136px] self-stretch' : ''} ${fillWidth ? 'flex-1 min-w-0 self-stretch' : ''} ${isDragOver ? 'bg-blue-100 dark:bg-blue-900/30' : ''}`}
      style={{ width: fillWidth ? undefined : cellWidth }}
      onPress={() => {
        if (workout == null) {
          onPress(weekIndex, dayIndex);
        }
      }}
    >
      <View
        className={`min-w-0 h-8 justify-baseline items-start self-start ${showDayLabel ? 'flex-row items-center' : ''} ${day.isToday && !showDayLabel ? 'flex-row items-center px-1.5' : ''}`}
      >
        {day.isToday && !showDayLabel && (
          <IconSymbol name="calendar" size={14} color="#30A46C" style={{ marginRight: 4 }} />
        )}
        {showDayLabel ? (
          <>
            <ThemedText className={day.isToday ? 'text-[15px] font-semibold text-day-accent' : 'text-[15px] font-semibold text-foreground'}>
              {weekdayShort}{' '}
            </ThemedText>
            <ThemedText className="text-[15px] font-bold text-day-number">
              {day.dayOfMonth}
            </ThemedText>
            <ThemedText className="text-[15px] font-semibold text-day-number">
              {' '}{monthShort}
            </ThemedText>
          </>
        ) : (
          <>
            {dayLabel != null && (
              <ThemedText
                className={`text-[13px] font-normal ${day.isToday ? 'text-day-accent' : 'text-day-number'}`}
              >
                {dayLabel}{' '}
              </ThemedText>
            )}
            <ThemedText
              className={`text-[13px] font-normal ${
                day.isToday
                  ? 'text-day-accent'
                  : day.dayOfMonth === 1
                    ? 'text-foreground'
                    : 'text-day-number'
              }`}
            >
              {day.dayOfMonth === 1
                ? `${day.date.toLocaleString('default', { month: 'short' })} ${day.dayOfMonth}`
                : day.dayOfMonth}
            </ThemedText>
          </>
        )}
      </View>
      {hasCardContent && panGesture ? (
        <GestureDetector gesture={panGesture}>
          <View className="self-stretch">
            <WorkoutCard
              state={cardState}
              workout={workout}
              value={cardData?.state === 'input' ? cardData.value : undefined}
              onChangeText={
                cardData?.state === 'input'
                  ? (text) => onCardChangeText(weekIndex, dayIndex, text)
                  : undefined
              }
              placeholder="Describe workout"
              className="mt-2 self-stretch px-2"
              textInputProps={
                cardData?.state === 'input'
                  ? {
                      autoFocus: true,
                      onSubmitEditing: () => onCardSubmit(weekIndex, dayIndex),
                      onBlur: () => onCardSubmit(weekIndex, dayIndex),
                      returnKeyType: 'done',
                    }
                  : undefined
              }
              title={
                cardState !== 'input'
                  ? (workout?.title ?? cardData?.value ?? 'Workout')
                  : undefined
              }
              subtitle={workout ? formatWorkoutSubtitle(workout) : undefined}
              onIconPress={() => onCardCycleIcon(weekIndex, dayIndex, workout)}
              onTextPress={() => onCardEdit(weekIndex, dayIndex, workout)}
              onDelete={() => onCardDelete(weekIndex, dayIndex, workout)}
              draggable={!!workout}
              onDragStart={
                workout && onDragStartFromCell
                  ? () => onDragStartFromCell(weekIndex, dayIndex, workout)
                  : undefined
              }
              onDragEnd={onDragEndFromCell}
            />
          </View>
        </GestureDetector>
      ) : hasCardContent ? (
        <WorkoutCard
          state={cardState}
          workout={workout}
          value={cardData?.state === 'input' ? cardData.value : undefined}
          onChangeText={
            cardData?.state === 'input'
              ? (text) => onCardChangeText(weekIndex, dayIndex, text)
              : undefined
          }
          placeholder="Describe workout"
          className="mt-2 self-stretch px-2"
          textInputProps={
            cardData?.state === 'input'
              ? {
                  autoFocus: true,
                  onSubmitEditing: () => onCardSubmit(weekIndex, dayIndex),
                  onBlur: () => onCardSubmit(weekIndex, dayIndex),
                  returnKeyType: 'done',
                }
              : undefined
          }
          title={
            cardState !== 'input'
              ? (workout?.title ?? cardData?.value ?? 'Workout')
              : undefined
          }
          subtitle={workout ? formatWorkoutSubtitle(workout) : undefined}
          onIconPress={() => onCardCycleIcon(weekIndex, dayIndex, workout)}
          onTextPress={() => onCardEdit(weekIndex, dayIndex, workout)}
          onDelete={() => onCardDelete(weekIndex, dayIndex, workout)}
          draggable={!!workout}
          onDragStart={
            workout && onDragStartFromCell
              ? () => onDragStartFromCell(weekIndex, dayIndex, workout)
              : undefined
          }
          onDragEnd={onDragEndFromCell}
        />
      ) : null}
      {showMobilePlaceholder && (
        <View className="mt-2 self-stretch h-20 border-2 border-dashed border-placeholder-border rounded-lg" />
      )}
    </Pressable>
  );
});

const SummaryMetricRow = React.memo(function SummaryMetricRow({
  value,
  targetLabel,
  isMet,
}: {
  value: string;
  targetLabel: string;
  isMet: boolean;
}) {
  return (
    <View className="flex-row items-center gap-1.5 py-0.5">
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          borderWidth: 1.5,
          borderColor: isMet ? '#30A46C' : '#9CA3AF',
          backgroundColor: 'transparent',
        }}
      />
      <ThemedText
        type="default"
        className={`text-[11px] font-normal ${isMet ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {value} / {targetLabel}
      </ThemedText>
    </View>
  );
});

const SummaryCell = React.memo(function SummaryCell({
  weekIndex,
  cellWidth,
  fillWidth,
  weekWorkouts,
}: {
  weekIndex: number;
  cellWidth: number;
  fillWidth?: boolean;
  weekWorkouts: Workout[];
}) {
  const start = weekIndexToStartDate(weekIndex);
  const weekNum = getWeekNumber(start);
  const year = start.getFullYear();

  const { completedSec, completedMeters, completedLoad, totalSec, totalMeters, totalLoad } =
    useMemo(() => {
      let cSec = 0;
      let cMeters = 0;
      let cLoad = 0;
      let tSec = 0;
      let tMeters = 0;
      let tLoad = 0;
      weekWorkouts.forEach((w) => {
        tSec += w.durationSec;
        tMeters += w.distanceMeters;
        tLoad += w.load;
        if (w.status === 'completed') {
          cSec += w.durationSec;
          cMeters += w.distanceMeters;
          cLoad += w.load;
        }
      });
      return {
        completedSec: cSec,
        completedMeters: cMeters,
        completedLoad: cLoad,
        totalSec: tSec,
        totalMeters: tMeters,
        totalLoad: tLoad,
      };
    }, [weekWorkouts]);

  const durationCompletedLabel = formatDurationFromSec(completedSec);
  const durationTotalLabel = formatDurationFromSec(totalSec);
  const distanceCompletedLabel =
    completedMeters > 0 ? `${(completedMeters / 1000).toFixed(1)}km` : '0km';
  const distanceTotalLabel = totalMeters > 0 ? `${(totalMeters / 1000).toFixed(1)}km` : '0km';
  const loadCompletedLabel = completedLoad > 0 ? String(completedLoad) : '0';
  const loadTotalLabel = totalLoad > 0 ? String(totalLoad) : '0';

  return (
    <View
      className={`justify-start items-start border-r border-border bg-cell-summary px-2 py-2 ${fillWidth ? 'flex-1 min-w-0 self-stretch border-r-0' : ''}`}
      style={{ width: fillWidth ? undefined : cellWidth }}
    >
      <ThemedText type="default" className="text-[10px] font-medium text-muted-foreground uppercase mb-1.5">
        WEEK {weekNum} {year}
      </ThemedText>
      <SummaryMetricRow
        value={durationCompletedLabel}
        targetLabel={durationTotalLabel}
        isMet={completedSec > 0}
      />
      <SummaryMetricRow
        value={distanceCompletedLabel}
        targetLabel={distanceTotalLabel}
        isMet={completedMeters > 0}
      />
      <SummaryMetricRow
        value={loadCompletedLabel}
        targetLabel={`${loadTotalLabel} Load`}
        isMet={completedLoad > 0}
      />
    </View>
  );
});

const WeekRow = React.memo(function WeekRow({
  weekIndex,
  cellWidth,
  cellCards,
  onCellPress,
  onCardChangeText,
  onCardSubmit,
  onCardCycleIcon,
  onCardEdit,
  onCardDelete,
  singleColumn,
  workoutByDate,
  onWeekHover,
  onDragStartFromCell,
  onDragEndFromCell,
  onDropOnCell,
}: {
  weekIndex: number;
  cellWidth: number;
  cellCards: Record<string, CellCardData>;
  onCellPress: (weekIndex: number, dayIndex: number) => void;
  onCardChangeText: (weekIndex: number, dayIndex: number, text: string) => void;
  onCardSubmit: (weekIndex: number, dayIndex: number) => void;
  onCardCycleIcon: (weekIndex: number, dayIndex: number, workout?: Workout) => void;
  onCardEdit: (weekIndex: number, dayIndex: number, workout?: Workout) => void;
  onCardDelete: (weekIndex: number, dayIndex: number, workout?: Workout) => void;
  singleColumn: boolean;
  workoutByDate: Map<string, Workout>;
  onWeekHover?: WeekHoverCallback;
  onDragStartFromCell?: (weekIndex: number, dayIndex: number, workout: Workout) => void;
  onDragEndFromCell?: () => void;
  onDropOnCell?: (weekIndex: number, dayIndex: number) => void;
}) {
  const start = weekIndexToStartDate(weekIndex);
  const days = useMemo(() => getWeekInfo(start), [weekIndex]);
  const weekWorkouts = useMemo(() => {
    const list: Workout[] = [];
    days.forEach((day) => {
      const key = formatDateKey(day.date);
      const w = workoutByDate.get(key);
      if (w) list.push(w);
    });
    return list;
  }, [days, workoutByDate]);
  const isWeb = Platform.OS === 'web';
  const hoverProps = isWeb && onWeekHover
    ? {
        onMouseEnter: () => onWeekHover(weekIndex),
        onMouseLeave: () => onWeekHover(null),
      }
    : {};

  if (singleColumn) {
    return (
      <View className="flex-col w-full overflow-hidden border-b-0" {...hoverProps}>
        {days.map((day, i) => (
          <View key={i} className="w-full min-h-[136px] flex-col px-3 overflow-hidden">
            <DayCell
              day={day}
              cellWidth={cellWidth}
              fillWidth
              weekIndex={weekIndex}
              dayIndex={i}
              cardData={cellCards[cellKey(weekIndex, i)]}
              workout={workoutByDate.get(formatDateKey(day.date))}
              onPress={onCellPress}
              onCardChangeText={onCardChangeText}
              onCardSubmit={onCardSubmit}
              onCardCycleIcon={onCardCycleIcon}
              onCardEdit={onCardEdit}
              onCardDelete={onCardDelete}
              showDayLabel
              onDragStartFromCell={onDragStartFromCell}
              onDragEndFromCell={onDragEndFromCell}
              onDropOnCell={onDropOnCell}
            />
          </View>
        ))}
        <View className="w-full min-h-[136px] flex-col px-3 overflow-hidden">
          <SummaryCell weekIndex={weekIndex} cellWidth={cellWidth} fillWidth weekWorkouts={weekWorkouts} />
        </View>
      </View>
    );
  }

  return (
    <View
      className="flex-row border-b border-border"
      style={{ height: ROW_HEIGHT }}
      {...hoverProps}
    >
      {days.map((day, i) => (
        <DayCell
          key={i}
          day={day}
          cellWidth={cellWidth}
          weekIndex={weekIndex}
          dayIndex={i}
          cardData={cellCards[cellKey(weekIndex, i)]}
          workout={workoutByDate.get(formatDateKey(day.date))}
          onPress={onCellPress}
          onCardChangeText={onCardChangeText}
          onCardSubmit={onCardSubmit}
          onCardCycleIcon={onCardCycleIcon}
          onCardEdit={onCardEdit}
          onCardDelete={onCardDelete}
          onDragStartFromCell={onDragStartFromCell}
          onDragEndFromCell={onDragEndFromCell}
          onDropOnCell={onDropOnCell}
        />
      ))}
      <SummaryCell weekIndex={weekIndex} cellWidth={cellWidth} weekWorkouts={weekWorkouts} />
    </View>
  );
}, (prev, next) => {
  if (prev.weekIndex !== next.weekIndex) return false;
  if (prev.cellWidth !== next.cellWidth) return false;
  if (prev.singleColumn !== next.singleColumn) return false;
  if (prev.workoutByDate !== next.workoutByDate) return false;
  if (prev.onWeekHover !== next.onWeekHover) return false;
  if (prev.onDragStartFromCell !== next.onDragStartFromCell) return false;
  if (prev.onDragEndFromCell !== next.onDragEndFromCell) return false;
  if (prev.onDropOnCell !== next.onDropOnCell) return false;
  // Only compare cell cards relevant to this week
  for (let i = 0; i < 7; i++) {
    const key = cellKey(prev.weekIndex, i);
    if (prev.cellCards[key] !== next.cellCards[key]) return false;
  }
  return true;
});

/** Week indices centered on the current week so "today" is always in the list and we can scroll to it. */
function getWeekIndicesAroundToday(): { weekIndices: number[]; scrollToIndex: number } {
  const current = getCurrentWeekIndex();
  const half = Math.floor(TOTAL_WEEKS / 2);
  const start = Math.max(0, current - half);
  const weekIndices = Array.from({ length: TOTAL_WEEKS }, (_, i) => start + i);
  const scrollToIndex = current - start;
  return { weekIndices, scrollToIndex };
}

export type VisibleMonthCallback = (month: number, year: number) => void;
export type VisibleWeekCallback = (weekIndex: number) => void;
export type WeekHoverCallback = (weekIndex: number | null) => void;

export type InfiniteCalendarRef = {
  scrollToWeekIndex: (weekIndex: number) => void;
};

export const InfiniteCalendar = forwardRef<
  InfiniteCalendarRef,
  {
    onVisibleMonthChange?: VisibleMonthCallback;
    onVisibleWeekChange?: VisibleWeekCallback;
    onWeekHover?: WeekHoverCallback;
  }
>(function InfiniteCalendar(
  { onVisibleMonthChange, onVisibleWeekChange, onWeekHover } = {},
  ref
) {
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const width = containerWidth > 0 ? containerWidth : windowWidth;
  const flatListRef = useRef<FlatList<number>>(null);
  const [cellCards, setCellCards] = useState<Record<string, CellCardData>>({});
  const { weekIndices, scrollToIndex } = useMemo(getWeekIndicesAroundToday, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollToWeekIndex(weekIndex: number) {
        const index = weekIndices.indexOf(weekIndex);
        if (index >= 0) {
          flatListRef.current?.scrollToIndex({ index, animated: true });
        }
      },
    }),
    [weekIndices]
  );
  const onVisibleMonthChangeRef = React.useRef(onVisibleMonthChange);
  onVisibleMonthChangeRef.current = onVisibleMonthChange;
  const onVisibleWeekChangeRef = React.useRef(onVisibleWeekChange);
  onVisibleWeekChangeRef.current = onVisibleWeekChange;
  const onWeekHoverRef = React.useRef(onWeekHover);
  onWeekHoverRef.current = onWeekHover;
  const { data: workouts } = useWorkouts();
  const createWorkout = useCreateWorkout();
  const updateWorkout = useUpdateWorkout();
  const deleteWorkout = useDeleteWorkout();
  const workoutsByDate = useMemo(() => {
    const map = new Map<string, Workout>();
    workouts?.forEach((workout) => {
      if (!workout.date || Number.isNaN(workout.date.getTime())) return;
      const key = formatDateKey(workout.date);
      if (!map.has(key)) {
        map.set(key, workout);
      }
    });
    return map;
  }, [workouts]);

  // Refs for stable callback references (avoid recreating handlers on every render)
  const cellCardsRef = useRef(cellCards);
  cellCardsRef.current = cellCards;
  const workoutsByDateRef = useRef(workoutsByDate);
  workoutsByDateRef.current = workoutsByDate;
  const createWorkoutRef = useRef(createWorkout);
  createWorkoutRef.current = createWorkout;
  const updateWorkoutRef = useRef(updateWorkout);
  updateWorkoutRef.current = updateWorkout;
  const deleteWorkoutRef = useRef(deleteWorkout);
  deleteWorkoutRef.current = deleteWorkout;

  // --- Drag-and-drop state ---
  const dragDataRef = useRef<{ workout: Workout; sourceDateKey: string } | null>(null);

  const handleDragStartFromCell = useCallback(
    (weekIndex: number, dayIndex: number, workout: Workout) => {
      const start = weekIndexToStartDate(weekIndex);
      const date = new Date(start);
      date.setDate(start.getDate() + dayIndex);
      dragDataRef.current = {
        workout,
        sourceDateKey: formatDateKey(date),
      };
    },
    []
  );

  const handleDragEndFromCell = useCallback(() => {
    dragDataRef.current = null;
  }, []);

  const handleWorkoutDrop = useCallback(
    (weekIndex: number, dayIndex: number) => {
      const dragData = dragDataRef.current;
      if (!dragData) return;

      const start = weekIndexToStartDate(weekIndex);
      const targetDate = new Date(start);
      targetDate.setDate(start.getDate() + dayIndex);
      const targetDateKey = formatDateKey(targetDate);

      // Don't drop on the same date
      if (targetDateKey === dragData.sourceDateKey) return;

      // Don't drop on a cell that already has a workout
      if (workoutsByDateRef.current.has(targetDateKey)) return;

      // Don't drop on a cell that has an active card (e.g. user is typing)
      const targetCellKey = cellKey(weekIndex, dayIndex);
      if (cellCardsRef.current[targetCellKey]) return;

      const { workout } = dragData;
      updateWorkoutRef.current.mutate({
        id: workout.id,
        title: workout.title,
        description: workout.description,
        date: targetDate,
        status: workout.status,
        exerciseType: workout.exerciseType,
        durationSec: workout.durationSec,
        distanceMeters: workout.distanceMeters,
        load: workout.load,
      });

      dragDataRef.current = null;
    },
    []
  );

  // --- Mobile drag-and-drop state ---
  // These track the floating card's position in container-relative coordinates.
  const mobileDragX = useSharedValue(0);
  const mobileDragY = useSharedValue(0);
  const mobileDragOpacity = useSharedValue(0);
  const mobileDragScale = useSharedValue(1);
  // Container screen offset (shared values so the animated style can read them on the UI thread)
  const containerScreenX = useSharedValue(0);
  const containerScreenY = useSharedValue(0);
  const containerWidthSV = useSharedValue(0);
  // Offset from touch point to the card's top-left so the card stays pinned under the finger
  const mobileDragFingerOffsetX = useSharedValue(0);
  const mobileDragFingerOffsetY = useSharedValue(0);

  const [mobileDragWorkout, setMobileDragWorkout] = useState<Workout | null>(null);
  const mobileDragWorkoutRef = useRef<Workout | null>(null); // ref avoids stale closure in gesture callbacks
  const [mobileDragScrollEnabled, setMobileDragScrollEnabled] = useState(true);
  const scrollOffsetRef = useRef(0);
  const containerLayoutRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const mobileDragSourceRef = useRef<{ sourceDateKey: string } | null>(null);
  const weekIndicesRef = useRef(weekIndices);
  weekIndicesRef.current = weekIndices;

  const handleMobileDragStart = useCallback(
    (weekIndex: number, dayIndex: number, absX: number, absY: number) => {
      const start = weekIndexToStartDate(weekIndex);
      const date = new Date(start);
      date.setDate(start.getDate() + dayIndex);
      const dateKey = formatDateKey(date);

      // Look up workout from the ref (avoids passing non-serializable objects through runOnJS)
      const workout = workoutsByDateRef.current.get(dateKey);
      if (!workout) return;

      mobileDragSourceRef.current = { sourceDateKey: dateKey };
      mobileDragWorkoutRef.current = workout;

      // Convert screen-absolute touch to container-relative position
      const csx = containerScreenX.value;
      const csy = containerScreenY.value;
      const cardW = containerWidthSV.value - 48; // approximate card width (container minus padding)
      // Place the floating card centered on the touch X, with top near the touch Y
      mobileDragFingerOffsetX.value = cardW / 2;
      mobileDragFingerOffsetY.value = 36; // finger sits ~36px below the card top
      mobileDragX.value = absX - csx - mobileDragFingerOffsetX.value;
      mobileDragY.value = absY - csy - mobileDragFingerOffsetY.value;
      mobileDragOpacity.value = withTiming(1, { duration: 150 });
      mobileDragScale.value = withSpring(1.05);

      setMobileDragWorkout(workout);
      setMobileDragScrollEnabled(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [mobileDragX, mobileDragY, mobileDragOpacity, mobileDragScale, containerScreenX, containerScreenY, containerWidthSV, mobileDragFingerOffsetX, mobileDragFingerOffsetY]
  );

  const handleMobileDragEnd = useCallback(
    (absX: number, absY: number) => {
      const currentWorkout = mobileDragWorkoutRef.current;

      // Calculate which cell the finger is over
      const layout = containerLayoutRef.current;
      const scrollY = scrollOffsetRef.current;
      const relativeY = absY - layout.y + scrollY;
      const relativeX = absX - layout.x;
      const isMobileLayout = layout.width < MOBILE_BREAKPOINT;

      let targetWeekRowIndex: number;
      let targetDayIndex: number;

      if (isMobileLayout) {
        // Mobile single-column: each week row = 8 cells stacked vertically
        targetWeekRowIndex = Math.floor(relativeY / MOBILE_ROW_HEIGHT);
        targetDayIndex = Math.floor((relativeY % MOBILE_ROW_HEIGHT) / MOBILE_CELL_HEIGHT);
      } else {
        // Desktop multi-column
        const adjustedY = relativeY - HEADER_HEIGHT;
        targetWeekRowIndex = Math.floor(adjustedY / ROW_HEIGHT);
        const cols = COLUMNS;
        const cw = layout.width / cols;
        targetDayIndex = Math.floor(relativeX / cw);
      }

      // Validate indices
      const wkIndices = weekIndicesRef.current;
      if (
        targetDayIndex >= 0 &&
        targetDayIndex < 7 &&
        targetWeekRowIndex >= 0 &&
        targetWeekRowIndex < wkIndices.length
      ) {
        const targetWeekIndex = wkIndices[targetWeekRowIndex];
        const targetStart = weekIndexToStartDate(targetWeekIndex);
        const targetDate = new Date(targetStart);
        targetDate.setDate(targetStart.getDate() + targetDayIndex);
        const targetDateKey = formatDateKey(targetDate);
        const source = mobileDragSourceRef.current;

        if (
          source &&
          currentWorkout &&
          targetDateKey !== source.sourceDateKey &&
          !workoutsByDateRef.current.has(targetDateKey)
        ) {
          const targetCellK = cellKey(targetWeekIndex, targetDayIndex);
          if (!cellCardsRef.current[targetCellK]) {
            updateWorkoutRef.current.mutate({
              id: currentWorkout.id,
              title: currentWorkout.title,
              description: currentWorkout.description,
              date: targetDate,
              status: currentWorkout.status,
              exerciseType: currentWorkout.exerciseType,
              durationSec: currentWorkout.durationSec,
              distanceMeters: currentWorkout.distanceMeters,
              load: currentWorkout.load,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        }
      }

      // Animate out and clean up
      mobileDragOpacity.value = withTiming(0, { duration: 150 });
      mobileDragScale.value = withSpring(1);
      mobileDragSourceRef.current = null;
      mobileDragWorkoutRef.current = null;
      setMobileDragWorkout(null);
      setMobileDragScrollEnabled(true);
    },
    [mobileDragOpacity, mobileDragScale]
  );

  const mobileDragCtx = useMemo<MobileDragContextValue>(
    () => ({
      dragX: mobileDragX,
      dragY: mobileDragY,
      containerScreenX,
      containerScreenY,
      fingerOffsetX: mobileDragFingerOffsetX,
      fingerOffsetY: mobileDragFingerOffsetY,
      startMobileDrag: handleMobileDragStart,
      endMobileDrag: handleMobileDragEnd,
    }),
    [mobileDragX, mobileDragY, containerScreenX, containerScreenY, mobileDragFingerOffsetX, mobileDragFingerOffsetY, handleMobileDragStart, handleMobileDragEnd]
  );

  const mobileDragFloatingStyle = useAnimatedStyle(() => {
    const cardW = Math.max(containerWidthSV.value - 48, 160);
    return {
      position: 'absolute' as const,
      left: mobileDragX.value,
      top: mobileDragY.value,
      width: cardW,
      opacity: mobileDragOpacity.value,
      transform: [{ scale: mobileDragScale.value }],
      zIndex: 9999,
    };
  });

  const handleCellPress = useCallback((weekIndex: number, dayIndex: number) => {
    const key = cellKey(weekIndex, dayIndex);
    const start = weekIndexToStartDate(weekIndex);
    const date = new Date(start);
    date.setDate(start.getDate() + dayIndex);
    const dateKey = formatDateKey(date);
    setCellCards((prev) =>
      key in prev ? prev : { ...prev, [key]: { state: 'input', value: '', dateKey } }
    );
  }, []);

  const handleCardChangeText = useCallback(
    (weekIndex: number, dayIndex: number, text: string) => {
      const key = cellKey(weekIndex, dayIndex);
      setCellCards((prev) => {
        const current = prev[key];
        if (!current) return prev;
        return {
          ...prev,
          [key]: { ...current, state: 'input', value: text },
        };
      });
    },
    []
  );

  const handleCardSubmit = useCallback(
    (weekIndex: number, dayIndex: number) => {
      const key = cellKey(weekIndex, dayIndex);
      const current = cellCardsRef.current[key];
      if (!current || current.state !== 'input') return;
      const trimmedValue = current.value.trim();
      if (trimmedValue === '') {
        setCellCards((prev) => {
          if (!prev[key] || prev[key]?.state !== 'input') return prev;
          const { [key]: _, ...rest } = prev;
          return rest;
        });
        return;
      }
      const existingWorkout = workoutsByDateRef.current.get(current.dateKey);
      if (existingWorkout) {
        setCellCards((prev) => ({
          ...prev,
          [key]: { ...prev[key], state: existingWorkout.status },
        }));
        updateWorkoutRef.current.mutate(
          {
            id: existingWorkout.id,
            title: trimmedValue,
            description: existingWorkout.description,
            date: existingWorkout.date,
            status: existingWorkout.status,
            exerciseType: existingWorkout.exerciseType,
            durationSec: existingWorkout.durationSec,
            distanceMeters: existingWorkout.distanceMeters,
            load: existingWorkout.load,
          },
          {
            onSuccess: () => {
              setCellCards((next) => {
                const { [key]: _, ...rest } = next;
                return rest;
              });
            },
            onError: () => {
              setCellCards((next) => {
                const nextCurrent = next[key];
                if (!nextCurrent) return next;
                return { ...next, [key]: { ...nextCurrent, state: 'error' } };
              });
            },
          }
        );
        return;
      }
      setCellCards((prev) => ({
        ...prev,
        [key]: { ...prev[key], state: 'pending' },
      }));
      const createDate = parseDateKey(current.dateKey);
      if (!createDate) return;
      createWorkoutRef.current.mutate(
        {
          title: trimmedValue,
          description: null,
          date: createDate,
          status: 'pending',
          exerciseType: 'run',
          durationSec: 0,
          distanceMeters: 0,
          load: 0,
        },
        {
          onSuccess: () => {
            setCellCards((next) => {
              const { [key]: _, ...rest } = next;
              return rest;
            });
          },
          onError: () => {
            setCellCards((next) => {
              const nextCurrent = next[key];
              if (!nextCurrent) return next;
              return { ...next, [key]: { ...nextCurrent, state: 'error' } };
            });
          },
        }
      );
    },
    []
  );

  const handleCardCycleIcon = useCallback(
    (weekIndex: number, dayIndex: number, workout?: Workout) => {
      const key = cellKey(weekIndex, dayIndex);
      setCellCards((prev) => {
        const current = prev[key];
        if (!current || current.state === 'input') return prev;
        const nextState =
          current.state === 'pending'
            ? 'completed'
            : current.state === 'completed'
              ? 'error'
              : 'pending';
        return { ...prev, [key]: { ...current, state: nextState } };
      });
      if (workout) {
        const currentIndex = STATUS_ORDER.indexOf(workout.status);
        const nextState = STATUS_ORDER[(currentIndex + 1) % STATUS_ORDER.length];
        updateWorkoutRef.current.mutate({
          id: workout.id,
          title: workout.title,
          description: workout.description,
          date: workout.date,
          status: nextState,
          exerciseType: workout.exerciseType,
          durationSec: workout.durationSec,
          distanceMeters: workout.distanceMeters,
          load: workout.load,
        });
      }
    },
    []
  );

  const handleCardEdit = useCallback(
    (weekIndex: number, dayIndex: number, workout?: Workout) => {
      const key = cellKey(weekIndex, dayIndex);
      if (workout) {
        setCellCards((prev) => ({
          ...prev,
          [key]: {
            state: 'input',
            value: workout.title,
            dateKey: formatDateKey(workout.date),
          },
        }));
        return;
      }
      setCellCards((prev) => {
        const current = prev[key];
        if (!current || current.state === 'input') return prev;
        return { ...prev, [key]: { ...current, state: 'input' } };
      });
    },
    []
  );

  const handleCardDelete = useCallback(
    (weekIndex: number, dayIndex: number, workout?: Workout) => {
      const key = cellKey(weekIndex, dayIndex);
      if (workout) {
        deleteWorkoutRef.current.mutate(workout.id, {
          onSuccess: () => {
            setCellCards((prev) => {
              const { [key]: _, ...rest } = prev;
              return rest;
            });
          },
        });
        return;
      }
      setCellCards((prev) => {
        const { [key]: _, ...rest } = prev;
        return rest;
      });
    },
    []
  );

  const isMobile = width < MOBILE_BREAKPOINT;
  const columns = isMobile ? 1 : COLUMNS;
  const cellWidth = (width - 1) / columns;

  const handleWeekHover = useCallback((weekIndex: number | null) => {
    onWeekHoverRef.current?.(weekIndex);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: number }) => (
      <WeekRow
        weekIndex={item}
        cellWidth={cellWidth}
        cellCards={cellCards}
        onCellPress={handleCellPress}
        onCardChangeText={handleCardChangeText}
        onCardSubmit={handleCardSubmit}
        onCardCycleIcon={handleCardCycleIcon}
        onCardEdit={handleCardEdit}
        onCardDelete={handleCardDelete}
        singleColumn={isMobile}
        workoutByDate={workoutsByDate}
        onWeekHover={onWeekHover ? handleWeekHover : undefined}
        onDragStartFromCell={handleDragStartFromCell}
        onDragEndFromCell={handleDragEndFromCell}
        onDropOnCell={handleWorkoutDrop}
      />
    ),
    [
      cellWidth,
      cellCards,
      isMobile,
      workoutsByDate,
      handleCellPress,
      handleCardChangeText,
      handleCardSubmit,
      handleCardCycleIcon,
      handleCardEdit,
      handleCardDelete,
      handleWeekHover,
      onWeekHover,
      handleDragStartFromCell,
      handleDragEndFromCell,
      handleWorkoutDrop,
    ]
  );

  const keyExtractor = useCallback((item: number) => `week-${item}`, []);

  const viewabilityConfigRef = useRef({
    itemVisiblePercentThreshold: 10,
    minimumViewTime: 0,
  });
  const viewabilityConfig = viewabilityConfigRef.current;

  const onViewableItemsChangedRef = useRef(
    (info: { viewableItems: { item: number }[] }) => {
      const monthCb = onVisibleMonthChangeRef.current;
      const weekCb = onVisibleWeekChangeRef.current;
      if (info.viewableItems.length === 0) return;
      const firstWeekIndex = info.viewableItems[0].item;
      const start = weekIndexToStartDate(firstWeekIndex);
      if (monthCb) monthCb(start.getMonth(), start.getFullYear());
      if (weekCb) weekCb(firstWeekIndex);
    }
  );
  const onViewableItemsChanged = useCallback(
    (info: { viewableItems: { item: number }[] }) => {
      onViewableItemsChangedRef.current(info);
    },
    []
  );

  useEffect(() => {
    const monthCb = onVisibleMonthChangeRef.current;
    const weekCb = onVisibleWeekChangeRef.current;
    const initialWeekIndex = weekIndices[scrollToIndex];
    const start = weekIndexToStartDate(initialWeekIndex);
    if (monthCb) monthCb(start.getMonth(), start.getFullYear());
    if (weekCb) weekCb(initialWeekIndex);
  }, [scrollToIndex, weekIndices]);

  const rowHeight = isMobile ? MOBILE_ROW_HEIGHT : ROW_HEIGHT;
  const onScrollToIndexFailed = useCallback(
    (info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
      const wait = new Promise((resolve) => setTimeout(resolve, 100));
      wait.then(() => {
        flatListRef.current?.scrollToIndex({ index: info.index, animated: true });
      });
    },
    []
  );
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: rowHeight,
      offset: rowHeight * index,
      index,
    }),
    [rowHeight]
  );

  const ListHeader = useMemo(
    () =>
      isMobile ? null : (
        <View
          className="flex-row border-b border-border bg-header"
          style={{ height: HEADER_HEIGHT }}
        >
          {DAY_LABELS.map((label) => (
            <View
              key={label}
              className="justify-center items-start border-r border-border py-2 pl-2"
              style={{ width: cellWidth }}
            >
              <ThemedText type="default" className="text-[11px] font-normal text-foreground">
                {label}
              </ThemedText>
            </View>
          ))}
          <View
            className="justify-center items-start border-r border-border py-2 pl-2 bg-header"
            style={{ width: cellWidth }}
          >
            <ThemedText type="default" className="text-[11px] font-normal text-foreground">
              Summary
            </ThemedText>
          </View>
        </View>
      ),
    [isMobile, cellWidth]
  );

  // Track scroll offset for mobile drop target calculation
  const handleScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
    },
    []
  );

  // Track container position on screen
  const containerRef = useRef<View>(null);
  const measureContainer = useCallback(() => {
    if (Platform.OS !== 'web' && containerRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (containerRef.current as any).measureInWindow?.(
        (x: number, y: number, w: number, h: number) => {
          containerScreenX.value = x;
          containerScreenY.value = y;
          containerWidthSV.value = w;
          containerLayoutRef.current = { x, y, width: w, height: h };
        }
      );
    }
  }, [containerScreenX, containerScreenY, containerWidthSV]);

  const handleContainerLayout = useCallback(
    (e: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => {
      setContainerWidth(e.nativeEvent.layout.width);
      containerLayoutRef.current = e.nativeEvent.layout;
      // Also measure screen position for the floating card
      measureContainer();
    },
    [measureContainer]
  );

  return (
    <MobileDragContext.Provider value={mobileDragCtx}>
      <ThemedView
        ref={containerRef}
        className="flex-1"
        onLayout={handleContainerLayout}
      >
        <FlatList
          ref={flatListRef}
          data={weekIndices}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          initialScrollIndex={isMobile ? 0 : scrollToIndex}
          onScrollToIndexFailed={onScrollToIndexFailed}
          ListHeaderComponent={ListHeader}
          stickyHeaderIndices={isMobile ? undefined : [0]}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          className="flex-1 bg-header"
          contentContainerStyle={isMobile ? { width: '100%' } : undefined}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          windowSize={5}
          maxToRenderPerBatch={3}
          initialNumToRender={5}
          removeClippedSubviews={Platform.OS !== 'web'}
          updateCellsBatchingPeriod={50}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          scrollEnabled={mobileDragScrollEnabled}
        />

        {/* Mobile drag floating card overlay */}
        {mobileDragWorkout && Platform.OS !== 'web' && (
          <ReAnimated.View
            style={[
              mobileDragFloatingStyle,
              {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.25,
                shadowRadius: 16,
                elevation: 12,
              },
            ]}
            pointerEvents="none"
          >
            <WorkoutCard
              state={mobileDragWorkout.status}
              workout={mobileDragWorkout}
              title={mobileDragWorkout.title}
              subtitle={formatWorkoutSubtitle(mobileDragWorkout)}
            />
          </ReAnimated.View>
        )}
      </ThemedView>
    </MobileDragContext.Provider>
  );
});

