import type { InfiniteCalendarRef } from '@/components/calendar/infinite-calendar';
import { InfiniteCalendar } from '@/components/calendar/infinite-calendar';
import { ThemedView } from '@/components/themed-view';
import { BarChart, type BarChartDataPoint } from '@/components/ui/bar-chart';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useWorkouts } from '@/hooks/use-workouts';
import {
    dateToWeekIndex,
    weekIndexToStartDate,
} from '@/utils/calendar';
import { useCallback, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatMonthYear(month: number, year: number): string {
  const date = new Date(year, month, 1);
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

export default function HomeScreen() {
  const { data: workouts } = useWorkouts();
  const chartBg = useThemeColor({ light: '#FCFCFC', dark: '#111' }, 'background');
  const chartBorder = useThemeColor({ light: '#E0E0E0', dark: '#3A3A3C' }, 'background');
  const [visibleMonthYear, setVisibleMonthYear] = useState<string>(() =>
    formatMonthYear(new Date().getMonth(), new Date().getFullYear())
  );
  const [scrollVisibleWeekIndex, setScrollVisibleWeekIndex] = useState<number | null>(null);
  const [hoveredWeekIndex, setHoveredWeekIndex] = useState<number | null>(null);

  const handleVisibleMonthChange = useCallback((month: number, year: number) => {
    setVisibleMonthYear(formatMonthYear(month, year));
  }, []);

  const handleVisibleWeekChange = useCallback((weekIndex: number) => {
    setScrollVisibleWeekIndex(weekIndex);
  }, []);

  const handleWeekHover = useCallback((weekIndex: number | null) => {
    setHoveredWeekIndex(weekIndex);
  }, []);

  const calendarRef = useRef<InfiniteCalendarRef>(null);

  const handleBarPress = useCallback((barIndex: number) => {
    const year = new Date().getFullYear();
    const startWeek = dateToWeekIndex(new Date(year, 0, 1));
    const weekIndex = startWeek + barIndex;
    calendarRef.current?.scrollToWeekIndex(weekIndex);
  }, []);

  const weeklyChartData = useMemo<BarChartDataPoint[]>(() => {
    const byWeek: Record<
      number,
      { pending: number; completed: number; error: number }
    > = {};
    workouts?.forEach((workout) => {
      if (Number.isNaN(workout.date.getTime())) return;
      const workoutDate = workout.date;
      const weekIndex = dateToWeekIndex(workoutDate);
      if (!byWeek[weekIndex]) {
        byWeek[weekIndex] = { pending: 0, completed: 0, error: 0 };
      }
      const durationSec = workout.durationSec ?? 0;
      const status = workout.status ?? 'pending';
      if (status === 'pending') byWeek[weekIndex].pending += durationSec;
      else if (status === 'completed') byWeek[weekIndex].completed += durationSec;
      else byWeek[weekIndex].error += durationSec;
    });

    const year = new Date().getFullYear();
    const startWeek = dateToWeekIndex(new Date(year, 0, 1));
    const endWeek = dateToWeekIndex(new Date(year, 11, 31));
    const length = Math.max(0, endWeek - startWeek + 1);
    const weekIndices = Array.from({ length }, (_, i) => startWeek + i);

    return weekIndices.map((weekIndex) => {
      const start = weekIndexToStartDate(weekIndex);
      const rangeLabel = `${start.toLocaleString('en-US', { month: 'short', day: 'numeric' })}`;
      const stacked = byWeek[weekIndex] ?? { pending: 0, completed: 0, error: 0 };
      const value =
        stacked.pending + stacked.completed + stacked.error;
      return {
        label: rangeLabel,
        value,
        stacked,
      };
    });
  }, [workouts]);

  const getRangeLabel = useCallback(
    (startIndex: number, endIndex: number) => {
      if (weeklyChartData.length === 0) return '';
      const year = new Date().getFullYear();
      const startWeek = dateToWeekIndex(new Date(year, 0, 1));
      const startWeekIndex = startWeek + startIndex;
      const endWeekIndex = startWeek + endIndex;
      const start = weekIndexToStartDate(startWeekIndex);
      const end = weekIndexToStartDate(endWeekIndex);
      const startLabel = start.toLocaleString('en-US', { month: 'short', day: 'numeric' });
      const endLabel = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 6).toLocaleString(
        'en-US',
        { month: 'short', day: 'numeric', year: 'numeric' }
      );
      return `${startLabel} - ${endLabel}`;
    },
    [weeklyChartData]
  );

  const chartHighlightIndex = useMemo(() => {
    const weekIndex = hoveredWeekIndex ?? scrollVisibleWeekIndex;
    if (weekIndex == null || weeklyChartData.length === 0) return null;
    const year = new Date().getFullYear();
    const startWeek = dateToWeekIndex(new Date(year, 0, 1));
    const barIndex = weekIndex - startWeek;
    if (barIndex < 0 || barIndex >= weeklyChartData.length) return null;
    return barIndex;
  }, [hoveredWeekIndex, scrollVisibleWeekIndex, weeklyChartData.length]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ThemedView
        style={{
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: chartBorder,
          backgroundColor: chartBg,
        }}
      >
        <BarChart
          data={weeklyChartData}
          getRangeLabel={getRangeLabel}
          monthYearLabel={visibleMonthYear}
          highlightedIndex={chartHighlightIndex}
          onBarPress={handleBarPress}
        />
      </ThemedView>
      <InfiniteCalendar
        ref={calendarRef}
        onVisibleMonthChange={handleVisibleMonthChange}
        onVisibleWeekChange={handleVisibleWeekChange}
        onWeekHover={handleWeekHover}
      />
    </SafeAreaView>
  );
}
