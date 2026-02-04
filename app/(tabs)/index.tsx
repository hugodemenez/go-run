import { useCallback, useMemo } from 'react';
import { InfiniteCalendar } from '@/components/calendar/infinite-calendar';
import { BarChart, type BarChartDataPoint } from '@/components/ui/bar-chart';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useWorkouts } from '@/hooks/use-workouts';
import {
  dateToWeekIndex,
  getWeekNumber,
  weekIndexToStartDate,
} from '@/utils/calendar';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const { data: workouts } = useWorkouts();
  const chartBg = useThemeColor({ light: '#FCFCFC', dark: '#111' }, 'background');
  const chartBorder = useThemeColor({ light: '#E0E0E0', dark: '#3A3A3C' }, 'background');

  const weeklyChartData = useMemo<BarChartDataPoint[]>(() => {
    const counts: Record<number, number> = {};
    workouts?.forEach((workout) => {
      const workoutDate = new Date(workout.date);
      if (Number.isNaN(workoutDate.getTime())) return;
      const weekIndex = dateToWeekIndex(workoutDate);
      counts[weekIndex] = (counts[weekIndex] ?? 0) + 1;
    });

    const year = new Date().getFullYear();
    const startWeek = dateToWeekIndex(new Date(year, 0, 1));
    const endWeek = dateToWeekIndex(new Date(year, 11, 31));
    const length = Math.max(0, endWeek - startWeek + 1);
    const weekIndices = Array.from({ length }, (_, i) => startWeek + i);

    return weekIndices.map((weekIndex) => {
      const start = weekIndexToStartDate(weekIndex);
      const rangeLabel = `${start.toLocaleString('en-US', { month: 'short', day: 'numeric' })}`;
      return {
        label: rangeLabel,
        value: counts[weekIndex] ?? 0,
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
        <BarChart data={weeklyChartData} getRangeLabel={getRangeLabel} />
      </ThemedView>
      <InfiniteCalendar />
    </SafeAreaView>
  );
}
