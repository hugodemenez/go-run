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
import { BarChart, type BarChartDataPoint } from '@/components/ui/bar-chart';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { WorkoutCard } from '@/components/workout/workout-card';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  dateToWeekIndex,
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

export type CellCardData = {
  state: 'input' | 'pending' | 'completed' | 'error';
  value: string;
};

function DayCell({
  day,
  cellWidth,
  weekIndex,
  dayIndex,
  cardData,
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
  onPress: (weekIndex: number, dayIndex: number) => void;
  onCardChangeText: (weekIndex: number, dayIndex: number, text: string) => void;
  onCardSubmit: (weekIndex: number, dayIndex: number) => void;
  onCardCycleIcon: (weekIndex: number, dayIndex: number) => void;
  onCardEdit: (weekIndex: number, dayIndex: number) => void;
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
      onPress={() => onPress(weekIndex, dayIndex)}
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
      {cardData?.state === 'pending' && (
        <WorkoutCard
          state="pending"
          title={cardData.value || 'Workout'}
          style={styles.cellWorkoutCard}
          onIconPress={() => onCardCycleIcon(weekIndex, dayIndex)}
          onTextPress={() => onCardEdit(weekIndex, dayIndex)}
        />
      )}
      {cardData?.state === 'completed' && (
        <WorkoutCard
          state="completed"
          title={cardData.value || 'Workout'}
          style={styles.cellWorkoutCard}
          onIconPress={() => onCardCycleIcon(weekIndex, dayIndex)}
          onTextPress={() => onCardEdit(weekIndex, dayIndex)}
        />
      )}
      {cardData?.state === 'error' && (
        <WorkoutCard
          state="error"
          title={cardData.value || 'Workout'}
          style={styles.cellWorkoutCard}
          onIconPress={() => onCardCycleIcon(weekIndex, dayIndex)}
          onTextPress={() => onCardEdit(weekIndex, dayIndex)}
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
}: {
  weekIndex: number;
  cellWidth: number;
  cellCards: Record<string, CellCardData>;
  onCellPress: (weekIndex: number, dayIndex: number) => void;
  onCardChangeText: (weekIndex: number, dayIndex: number, text: string) => void;
  onCardSubmit: (weekIndex: number, dayIndex: number) => void;
  onCardCycleIcon: (weekIndex: number, dayIndex: number) => void;
  onCardEdit: (weekIndex: number, dayIndex: number) => void;
  singleColumn: boolean;
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

  const weeklyEventCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    Object.entries(cellCards).forEach(([key, card]) => {
      if (card.state === 'input') return;
      if (!card.value || card.value.trim() === '') return;
      const [weekIndexRaw] = key.split('-');
      const weekIndex = Number(weekIndexRaw);
      if (!Number.isFinite(weekIndex)) return;
      counts[weekIndex] = (counts[weekIndex] ?? 0) + 1;
    });
    return counts;
  }, [cellCards]);

  const formatWeekRange = useCallback((start: Date) => {
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const startLabel = start.toLocaleString('en-US', { month: 'short', day: 'numeric' });
    const endLabel = end.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${startLabel} - ${endLabel}`;
  }, []);

  const currentYear = new Date().getFullYear();
  const currentYearWeekIndices = useMemo(() => {
    const startWeek = dateToWeekIndex(new Date(currentYear, 0, 1));
    const endWeek = dateToWeekIndex(new Date(currentYear, 11, 31));
    const length = Math.max(0, endWeek - startWeek + 1);
    return Array.from({ length }, (_, i) => startWeek + i);
  }, [currentYear]);

  const weeklyChartData = useMemo<BarChartDataPoint[]>(() => {
    return currentYearWeekIndices.map((weekIndex) => {
      const start = weekIndexToStartDate(weekIndex);
      return {
        label: formatWeekRange(start),
        value: weeklyEventCounts[weekIndex] ?? 0,
      };
    });
  }, [currentYearWeekIndices, formatWeekRange, weeklyEventCounts]);

  const getChartRangeLabel = useCallback(
    (startIndex: number, endIndex: number) => {
      const weekIndices = currentYearWeekIndices;
      if (startIndex < 0 || endIndex >= weekIndices.length) return '';
      const firstWeekStart = weekIndexToStartDate(weekIndices[startIndex]);
      const lastWeekStart = weekIndexToStartDate(weekIndices[endIndex]);
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);
      const sameYear = firstWeekStart.getFullYear() === lastWeekEnd.getFullYear();
      const startLabel = firstWeekStart.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(sameYear ? {} : { year: 'numeric' }),
      });
      const endLabel = lastWeekEnd.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `${startLabel} - ${endLabel}`;
    },
    [currentYearWeekIndices]
  );

  const handleCellPress = useCallback((weekIndex: number, dayIndex: number) => {
    const key = cellKey(weekIndex, dayIndex);
    setCellCards((prev) =>
      key in prev ? prev : { ...prev, [key]: { state: 'input', value: '' } }
    );
  }, []);

  const handleCardChangeText = useCallback(
    (weekIndex: number, dayIndex: number, text: string) => {
      const key = cellKey(weekIndex, dayIndex);
      setCellCards((prev) => ({
        ...prev,
        [key]: { ...prev[key], state: 'input', value: text },
      }));
    },
    []
  );

  const handleCardSubmit = useCallback(
    (weekIndex: number, dayIndex: number) => {
      const key = cellKey(weekIndex, dayIndex);
      setCellCards((prev) => {
        const current = prev[key];
        if (!current || current.state !== 'input') return prev;
        // Remove card when submitted with no value (e.g. blur on empty input)
        if (current.value.trim() === '') {
          const { [key]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [key]: { state: 'pending', value: current.value } };
      });
    },
    []
  );

  const handleCardCycleIcon = useCallback(
    (weekIndex: number, dayIndex: number) => {
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
    },
    []
  );

  const handleCardEdit = useCallback(
    (weekIndex: number, dayIndex: number) => {
      const key = cellKey(weekIndex, dayIndex);
      setCellCards((prev) => {
        const current = prev[key];
        if (!current || current.state === 'input') return prev;
        return { ...prev, [key]: { state: 'input', value: current.value } };
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
      />
    ),
    [
      cellWidth,
      cellCards,
      isMobile,
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
      <View style={styles.chartWrap}>
        <BarChart data={weeklyChartData} getRangeLabel={getChartRangeLabel} />
      </View>
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
