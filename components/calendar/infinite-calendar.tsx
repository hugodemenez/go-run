import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { WorkoutCard } from '@/components/workout/workout-card';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useCreateWorkout, useUpdateWorkout, useWorkouts } from '@/hooks/use-workouts';
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
  showDayLabel,
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
  showDayLabel?: boolean;
}) {
  const TODAY_ACCENT = '#30A46C';
  const borderColor = useThemeColor(
    { light: '#E0E0E0', dark: '#3A3A3C' },
    'background'
  );
  const todayCellBg = useThemeColor(
    { light: '#F8FBF9', dark: '#111512' },
    'background'
  );
  const cellBg = useThemeColor(
    { light: '#FCFCFC', dark: '#111' },
    'background'
  );
  const dayNumberColor = useThemeColor(
    { light: '#ADADAD', dark: '#AAAAAA' },
    'text'
  );
  const firstOfMonthColor = useThemeColor(
    { light: '#1a1a1a', dark: '#ffffff' },
    'text'
  );
  const dayLabel = showDayLabel ? DAY_LABELS[day.date.getDay()] : null;

  return (
    <Pressable
      style={[
        styles.cell,
        styles.dayCell,
        showDayLabel && styles.dayCellFill,
        {
          width: cellWidth,
          borderRightColor: borderColor,
          backgroundColor: day.isToday ? todayCellBg : cellBg,
        },
      ]}
      onPress={() => {
        if (workout == null) {
          onPress(weekIndex, dayIndex);
        }
      }}
    >
      <View
        style={[
          styles.dayNumberWrap,
          showDayLabel && styles.dayNumberRow,
          day.isToday && { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
        ]}
      >
        {day.isToday && (
          <IconSymbol name="calendar" size={14} color={TODAY_ACCENT} style={styles.todayIcon} />
        )}
        {dayLabel != null && (
          <ThemedText
            style={[
              styles.dayLabel,
              { color: day.isToday ? TODAY_ACCENT : dayNumberColor },
              day.isToday && styles.dayNumberToday,
            ]}
          >
            {dayLabel}{' '}
          </ThemedText>
        )}
        <ThemedText
          style={[
            styles.dayNumber,
            {
              color: day.isToday
                ? TODAY_ACCENT
                : day.dayOfMonth === 1
                  ? firstOfMonthColor
                  : dayNumberColor,
            },
            day.isToday && styles.dayNumberToday,
          ]}
        >
          {day.dayOfMonth === 1
            ? `${day.date.toLocaleString('default', { month: 'short' })} ${day.dayOfMonth}`
            : day.dayOfMonth}
        </ThemedText>
      </View>
      {cardData?.state === 'input' && (
        <WorkoutCard
          state="input"
          value={cardData.value}
          onChangeText={(text) => onCardChangeText(weekIndex, dayIndex, text)}
          placeholder="Describe workout"
          style={styles.cellWorkoutCard}
          textInputProps={{
            autoFocus: true,
            onSubmitEditing: () => onCardSubmit(weekIndex, dayIndex),
            onBlur: () => onCardSubmit(weekIndex, dayIndex),
            returnKeyType: 'done',
          }}
        />
      )}
      {workout == null && cardData?.state === 'pending' && (
        <WorkoutCard
          state="pending"
          title={cardData.value || 'Workout'}
          style={styles.cellWorkoutCard}
          onIconPress={() => onCardCycleIcon(weekIndex, dayIndex)}
          onTextPress={() => onCardEdit(weekIndex, dayIndex)}
        />
      )}
      {workout == null && cardData?.state === 'completed' && (
        <WorkoutCard
          state="completed"
          title={cardData.value || 'Workout'}
          style={styles.cellWorkoutCard}
          onIconPress={() => onCardCycleIcon(weekIndex, dayIndex)}
          onTextPress={() => onCardEdit(weekIndex, dayIndex)}
        />
      )}
      {workout == null && cardData?.state === 'error' && (
        <WorkoutCard
          state="error"
          title={cardData.value || 'Workout'}
          style={styles.cellWorkoutCard}
          onIconPress={() => onCardCycleIcon(weekIndex, dayIndex)}
          onTextPress={() => onCardEdit(weekIndex, dayIndex)}
        />
      )}
      {workout != null && cardData?.state !== 'input' && (
        <WorkoutCard
          state={workout.status}
          title={workout.title}
          subtitle={workout.description ?? undefined}
          style={styles.cellWorkoutCard}
          onIconPress={() => onCardCycleIcon(weekIndex, dayIndex, workout)}
          onTextPress={() => onCardEdit(weekIndex, dayIndex, workout)}
        />
      )}
    </Pressable>
  );
}

function SummaryCell({ weekIndex, cellWidth }: { weekIndex: number; cellWidth: number }) {
  const borderColor = useThemeColor(
    { light: '#E0E0E0', dark: '#3A3A3C' },
    'background'
  );
  const summaryBg = useThemeColor(
    { light: '#F8F8F8', dark: '#141414' },
    'background'
  );
  const summaryTextColor = useThemeColor(
    { light: '#333333', dark: '#AAAAAA' },
    'text'
  );
  const start = weekIndexToStartDate(weekIndex);
  const weekNum = getWeekNumber(start);

  return (
    <View
      style={[
        styles.cell,
        styles.summaryCell,
        {
          width: cellWidth,
          borderRightColor: borderColor,
          backgroundColor: summaryBg,
        },
      ]}
    >
      <ThemedText type="default" style={[styles.summaryText, { color: summaryTextColor }]}>
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
  singleColumn: boolean;
  workoutByDate: Map<string, Workout>;
}) {
  const start = weekIndexToStartDate(weekIndex);
  const days = useMemo(() => getWeekInfo(start), [weekIndex]);

  const rowBorderColor = useThemeColor(
    { light: '#E0E0E0', dark: '#3A3A3C' },
    'background'
  );

  if (singleColumn) {
    return (
      <View
        style={[
          styles.row,
          styles.weekColumn,
          {
            height: MOBILE_ROW_HEIGHT,
            borderBottomColor: rowBorderColor,
          },
        ]}
      >
        {days.map((day, i) => (
          <View key={i} style={styles.mobileCellWrap}>
            <DayCell
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
              showDayLabel
            />
          </View>
        ))}
        <View style={styles.mobileCellWrap}>
          <SummaryCell weekIndex={weekIndex} cellWidth={cellWidth} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, { height: ROW_HEIGHT, borderBottomColor: rowBorderColor }]}>
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

  const borderColor = useThemeColor(
    { light: '#E0E0E0', dark: '#3A3A3C' },
    'background'
  );
  const headerBg = useThemeColor(
    { light: '#FCFCFC', dark: '#111' },
    'background'
  );
  const headerTextColor = useThemeColor(
    { light: '#333333', dark: '#AAAAAA' },
    'text'
  );
  const listBg = useThemeColor(
    { light: '#FCFCFC', dark: '#111' },
    'background'
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
    ]
  );

  const keyExtractor = useCallback((item: number) => `week-${item}`, []);

  const rowHeight = isMobile ? MOBILE_ROW_HEIGHT : ROW_HEIGHT;
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
          style={[
            styles.headerRow,
            {
              height: HEADER_HEIGHT,
              backgroundColor: headerBg,
              borderBottomColor: borderColor,
            },
          ]}
        >
          {DAY_LABELS.map((label) => (
            <View
              key={label}
              style={[
                styles.headerCell,
                {
                  width: cellWidth,
                  borderRightColor: borderColor,
                },
              ]}
            >
              <ThemedText type="default" style={[styles.headerText, { color: headerTextColor }]}>
                {label}
              </ThemedText>
            </View>
          ))}
          <View
            style={[
              styles.headerCell,
              styles.summaryHeaderCell,
              { width: cellWidth, borderRightColor: borderColor, backgroundColor: headerBg },
            ]}
          >
            <ThemedText type="default" style={[styles.headerText, { color: headerTextColor }]}>
              Summary
            </ThemedText>
          </View>
        </View>
      ),
    [isMobile, cellWidth, borderColor, headerBg, headerTextColor]
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor: listBg }]}>
      <FlatList
        data={weekIndices}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        initialScrollIndex={scrollToIndex}
        ListHeaderComponent={ListHeader}
        stickyHeaderIndices={isMobile ? undefined : [0]}
        style={[styles.list, { backgroundColor: listBg }]}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  chartWrap: {
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  headerCell: {
    justifyContent: 'center',
    alignItems:'flex-start',
    borderRightWidth: 1,
    paddingVertical: 8,
    paddingLeft: 8,
  },
  headerText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '400',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weekColumn: {
    flexDirection: 'column',
  },
  mobileCellWrap: {
    height: MOBILE_CELL_HEIGHT,
    flexDirection: 'column',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayCellFill: {
    flex: 1,
    minHeight: MOBILE_CELL_HEIGHT,
  },
  cell: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  dayCell: {
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  summaryCell: {
    // backgroundColor set per-theme in component
  },
  summaryHeaderCell: {
    // backgroundColor set per-theme in component
  },
  dayNumberWrap: {
    minWidth: 0,
    height: 32,
    justifyContent: 'center',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
  },
  dayNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: undefined,
  },
  dayLabel: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '400',
  },
  dayNumber: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '400',
  },
  dayNumberToday: {
    fontWeight: '400',
  },
  todayIcon: {
    marginRight: 4,
  },
  cellWorkoutCard: {
    marginTop: 8,
    alignSelf: 'stretch',
    paddingHorizontal: 8,
  },
  summaryText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '400',
  },
});
