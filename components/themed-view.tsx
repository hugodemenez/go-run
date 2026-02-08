import { View, type ViewProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  className?: string;
};

export function ThemedView({
  style,
  lightColor,
  darkColor,
  className,
  ...otherProps
}: ThemedViewProps) {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');
  const useClass = lightColor == null && darkColor == null;
  const baseClass = useClass ? 'bg-background' : '';
  const resolvedClass = [baseClass, className].filter(Boolean).join(' ');

  return (
    <View
      className={resolvedClass || undefined}
      style={[!useClass ? { backgroundColor } : undefined, style]}
      {...otherProps}
    />
  );
}
