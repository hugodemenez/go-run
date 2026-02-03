import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { DynamicColorIOS, Platform } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const TAB_CONFIG = [
  { name: 'index', title: 'Calendar', sfDefault: 'calendar', sfSelected: 'calendar' },
  { name: 'explore', title: 'Explore', sfDefault: 'paperplane', sfSelected: 'paperplane.fill' },
] as const;

const tabTintColor =
  Platform.OS === 'ios'
    ? DynamicColorIOS({ dark: Colors.dark.tint, light: Colors.light.tint })
    : undefined;

export default function TabLayout() {
  const colorScheme = useColorScheme();

  if (Platform.OS === 'ios') {
    return (
      <NativeTabs
        tintColor={tabTintColor}
        labelStyle={{ color: tabTintColor }}
        minimizeBehavior="onScrollDown"
      >
        {TAB_CONFIG.map((tab) => (
          <NativeTabs.Trigger key={tab.name} name={tab.name}>
            <Label>{tab.title}</Label>
            <Icon sf={{ default: tab.sfDefault, selected: tab.sfSelected }} />
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      {TAB_CONFIG.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => (
              <IconSymbol size={28} name={tab.sfSelected} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
