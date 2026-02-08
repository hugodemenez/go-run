import { Text, type TextProps } from 'react-native';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
  className?: string;
};

const typeClasses: Record<NonNullable<ThemedTextProps['type']>, string> = {
  default: 'text-base leading-6 text-foreground',
  defaultSemiBold: 'text-base leading-6 font-semibold text-foreground',
  title: 'text-3xl font-bold leading-8 text-foreground',
  subtitle: 'text-xl font-bold text-foreground',
  link: 'text-base leading-8 text-tint',
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  className,
  ...rest
}: ThemedTextProps) {
  const baseClass = typeClasses[type];
  const resolvedClass = [baseClass, className].filter(Boolean).join(' ');

  return (
    <Text
      className={resolvedClass || undefined}
      style={[
        lightColor != null || darkColor != null ? { color: lightColor ?? darkColor } : undefined,
        style,
      ]}
      {...rest}
    />
  );
}
