import React, { useCallback, useMemo, useState } from 'react';
import {
    FlatList,
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
          subtitle={workout?.description ?? undefined}
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

function SummaryCell({
  weekIndex,
  cellWidth,
  fillWidth,
}: {
  weekIndex: number;
  cellWidth: number;
  fillWidth?: boolean;
}) {
  const start = weekIndexToStartDate(weekIndex);
  const weekNum = getWeekNumber(start);

  return (
    <View
      className={`justify-center items-center border-r border-border bg-cell-summary ${fillWidth ? 'flex-1 min-w-0 self-stretch border-r-0' : ''}`}
      style={{ width: fillWidth ? undefined : cellWidth }}
    >
      <ThemedText type="default" className="text-[11px] font-normal text-foreground">
        W{weekNum}
      </ThemedText>
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
}) {
  const start = weekIndexToStartDate(weekIndex);
  const days = useMemo(() => getWeekInfo(start), [weekIndex]);

  if (singleColumn) {
    return (
      <View className="flex-row flex-col w-full overflow-hidden border-b-0">
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
          <SummaryCell weekIndex={weekIndex} cellWidth={cellWidth} fillWidth />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row border-b border-border" style={{ height: ROW_HEIGHT }}>
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
      <SummaryCell weekIndex={weekIndex} cellWidth={cellWidth} />
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

export function InfiniteCalendar() {
  const { width } = useWindowDimensions();
  const [cellCards, setCellCards] = useState<Record<string, CellCardData>>({});
  const { weekIndices, scrollToIndex } = useMemo(getWeekIndicesAroundToday, []);
  const { data: workouts } = useWorkouts();
  console.log('workouts', workouts);
  const createWorkout = useCreateWorkout();
  const updateWorkout = useUpdateWorkout();
  const deleteWorkout = useDeleteWorkout();
  const workoutsByDate = useMemo(() => {
    const map = new Map<string, Workout>();
    workouts?.forEach((workout) => {
      if (!workout.date) return;
      const parsedDate = parseDateKey(workout.date) ?? new Date(workout.date);
      if (Number.isNaN(parsedDate.getTime())) return;
      const key = formatDateKey(parsedDate);
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
      createWorkout.mutate(
        {
          title: trimmedValue,
          description: null,
          date: current.dateKey,
          status: 'pending',
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
            dateKey: workout.date,
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
    ]
  );

  const keyExtractor = useCallback((item: number) => `week-${item}`, []);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    []
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
    <ThemedView className="flex-1">
      <FlatList
        data={weekIndices}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={isMobile ? undefined : getItemLayout}
        initialScrollIndex={isMobile ? undefined : scrollToIndex}
        ListHeaderComponent={ListHeader}
        stickyHeaderIndices={isMobile ? undefined : [0]}
        className="flex-1 bg-header"
        contentContainerStyle={isMobile ? { width: '100%' } : undefined}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      />
    </ThemedView>
  );
}

