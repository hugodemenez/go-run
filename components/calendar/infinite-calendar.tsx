import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

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

const COLUMNS = 8; // 7 days + 1 summary
const MOBILE_BREAKPOINT = 600;

const ROW_HEIGHT = 192;
const HEADER_HEIGHT = 40;
const MOBILE_CELL_HEIGHT = 192;
const MOBILE_ROW_HEIGHT = COLUMNS * MOBILE_CELL_HEIGHT; // one "row" = full week stacked

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

function DayCell({
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

  const cardState: CellCardData['state'] =
    cardData?.state === 'input'
      ? 'input'
      : workout != null
        ? workout.status
        : (cardData?.state ?? 'pending');

  return (
    <Pressable
      className={`justify-center items-center border-r border-border ${day.isToday ? 'bg-cell-today' : 'bg-cell'} ${showDayLabel ? 'border-r-0' : ''} justify-start items-start pt-2 px-2 ${showDayLabel ? 'pb-2 min-h-[192px] self-stretch' : ''} ${fillWidth ? 'flex-1 min-w-0 self-stretch' : ''}`}
      style={{ width: fillWidth ? undefined : cellWidth }}
      onPress={() => {
        if (workout == null) {
          onPress(weekIndex, dayIndex);
        }
      }}
    >
      <View
        className={`min-w-0 h-8 justify-center items-start self-start ${showDayLabel ? 'flex-row items-center' : ''} ${day.isToday && !showDayLabel ? 'flex-row items-center px-1.5' : ''}`}
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
      {hasCardContent && (
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
        />
      )}
      {showMobilePlaceholder && (
        <View className="mt-2 self-stretch flex-1 min-h-20 border-2 border-dashed border-placeholder-border rounded-lg" />
      )}
    </Pressable>
  );
}

function SummaryMetricRow({
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
}

function SummaryCell({
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
}

function WeekRow({
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
          <View key={i} className="w-full min-h-[192px] flex-col px-3 overflow-hidden">
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
            />
          </View>
        ))}
        <View className="w-full min-h-[192px] flex-col px-3 overflow-hidden">
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
        />
      ))}
      <SummaryCell weekIndex={weekIndex} cellWidth={cellWidth} weekWorkouts={weekWorkouts} />
    </View>
  );
}

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
      const current = cellCards[key];
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
      const existingWorkout = workoutsByDate.get(current.dateKey);
      if (existingWorkout) {
        setCellCards((prev) => ({
          ...prev,
          [key]: { ...prev[key], state: existingWorkout.status },
        }));
        updateWorkout.mutate(
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
      createWorkout.mutate(
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
    [cellCards, createWorkout, updateWorkout, workoutsByDate]
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
        updateWorkout.mutate({
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
    [updateWorkout]
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
        deleteWorkout.mutate(workout.id, {
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
    [deleteWorkout]
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

  return (
    <ThemedView
      className="flex-1"
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
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
      />
    </ThemedView>
  );
});

