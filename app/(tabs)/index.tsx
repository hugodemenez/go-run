import { InfiniteCalendar } from '@/components/calendar/infinite-calendar';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <InfiniteCalendar />
    </SafeAreaView>
  );
}
