import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputKeyPressEvent,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

import type { Workout } from '@/types/workout';

export type WorkoutCardState = 'input' | 'pending' | 'completed' | 'error';

export type WorkoutCardProps = {
  state: WorkoutCardState;
  style?: ViewStyle;
  workout?: Workout;
  /** Input state: current value */
  value?: string;
  /** Input state: change handler */
  onChangeText?: (text: string) => void;
  /** Input state: placeholder */
  placeholder?: string;
  /** Input state: show loading spinner inside the field */
  inputLoading?: boolean;
  /** Pending / completed: main title (e.g. "Easy run", "Running") */
  title?: string;
  /** Pending / completed: detail line (e.g. "30min · 5km") */
  subtitle?: string;
  /** Error state: optional message below the title */
  errorMessage?: string;
  /** Any extra TextInput props in input state */
  textInputProps?: Omit<TextInputProps, 'value' | 'onChangeText' | 'placeholder' | 'style'>;
  /** Optional press handler for the status icon (pending / completed / error). When set, the icon is pressable. */
  onIconPress?: () => void;
  /** Optional press handler for the title/subtitle text. When set, the text block is pressable (e.g. to go back to input mode). */
  onTextPress?: () => void;
};

const CARD_RADIUS = 8;
const ICON_SIZE = 8; // 2x smaller than before (was 24)
const ERROR_COLOR = '#ef4444';

function IconWrap({
  onPress,
  children,
}: {
  onPress?: () => void;
  children: React.ReactNode;
}) {
  if (onPress) {
    return <Pressable onPress={onPress}>{children}</Pressable>;
  }
  return <>{children}</>;
}

export function WorkoutCard({
  state,
  style,
  workout,
  value = '',
  onChangeText,
  placeholder = 'Describe workout',
  inputLoading = false,
  title,
  subtitle,
  errorMessage,
  textInputProps,
  onIconPress,
  onTextPress,
}: WorkoutCardProps) {
  const cardBg = useThemeColor(
    { light: '#F6F6F6', dark: '#2C2C2E' },
    'background'
  );
  const cardBorder = useThemeColor(
    { light: '#F0F0F0', dark: '#3A3A3C' },
    'background'
  );
  const titleColor = useThemeColor(
    { light: '#333333', dark: '#FFFFFF' },
    'text'
  );
  const mutedColor = useThemeColor(
    { light: '#999999', dark: '#BBBBBB' },
    'icon'
  );
  const successColor = useThemeColor(
    { light: '#28A745', dark: '#4CAF50' },
    'tint'
  );

  const inputRef = useRef<TextInput>(null);
  const enterOpacity = useRef(new Animated.Value(state === 'input' ? 0 : 1)).current;
  const enterTranslate = useRef(new Animated.Value(state === 'input' ? 6 : 0)).current;
  const enterScale = useRef(new Animated.Value(state === 'input' ? 0.98 : 1)).current;
  const statePulse = useRef(new Animated.Value(1)).current;
  const didMountRef = useRef(false);
  const previousStateRef = useRef<WorkoutCardState | null>(null);

  const isInput = state === 'input';
  const resolvedTitle = title ?? workout?.title;
  const resolvedSubtitle = subtitle ?? workout?.description;

  const displayValue = isInput
    ? ''
    : state === 'pending'
      ? resolvedTitle ?? 'Easy run'
      : state === 'completed'
        ? resolvedTitle ?? 'Running'
        : resolvedTitle ?? '10k';
  const secondLineText =
    !isInput &&
    ((state === 'pending' || state === 'completed') &&
    resolvedSubtitle != null &&
    resolvedSubtitle !== ''
      ? resolvedSubtitle
      : state === 'error' && errorMessage != null && errorMessage !== ''
        ? errorMessage
        : null);
  const inputColor = state === 'error' ? ERROR_COLOR : titleColor;
  const inputEditable = isInput;

  const { onKeyPress: textInputOnKeyPress, ...restTextInputProps } = textInputProps ?? {};

  const handleKeyPress = (e: TextInputKeyPressEvent) => {
    if (e.nativeEvent.key === 'Escape') {
      inputRef.current?.blur();
      if (Platform.OS !== 'web') {
        Keyboard.dismiss();
      }
    }
    textInputOnKeyPress?.(e);
  };

  useEffect(() => {
    if (state !== 'input') {
      return;
    }

    Animated.parallel([
      Animated.timing(enterOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(enterTranslate, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(enterScale, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [enterOpacity, enterScale, enterTranslate]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      previousStateRef.current = state;
      return;
    }

    const previousState = previousStateRef.current;
    previousStateRef.current = state;

    if (previousState === 'input' && state === 'pending') {
      return;
    }

    statePulse.setValue(0.98);
    Animated.timing(statePulse, {
      toValue: 1,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [state, statePulse]);

  const titleContent = (
    <TextInput
      ref={inputRef}
      value={isInput ? value : displayValue}
      onChangeText={isInput ? onChangeText : undefined}
      placeholder={isInput ? placeholder : undefined}
      placeholderTextColor={mutedColor}
      editable={inputEditable}
      multiline={false}
      underlineColorAndroid="transparent"
      onKeyPress={isInput ? handleKeyPress : undefined}
      style={[
        styles.input,
        inputLoading ? styles.inputWithIcon : null,
        { color: inputColor },
        Platform.OS === 'web' && ({ outlineWidth: 0, outline: 'none' } as TextStyle),
      ]}
      {...(isInput ? restTextInputProps : {})}
    />
  );

  const showSubtitleRow = !isInput && secondLineText != null;

  return (
    <Animated.View
      style={[
        styles.card,
        style,
        {
          backgroundColor: cardBg,
          borderColor: cardBorder,
          opacity: enterOpacity,
          transform: [
            { translateY: enterTranslate },
            { scale: Animated.multiply(enterScale, statePulse) },
          ],
        },
      ]}
    >
      <View style={styles.grid}>
        <View style={styles.row}>
          <View style={styles.iconColumn}>
            <IconWrap onPress={onIconPress}>
              {state === 'pending' || state === 'input' ? (
                <MaterialCommunityIcons
                  name="dots-circle"
                  size={ICON_SIZE + 8}
                  color={mutedColor}
                />
              ) : (
                <View
                  style={[
                    styles.iconCircle,
                    state === 'completed' && styles.successCircle,
                    state === 'error' && styles.errorCircle,
                    state === 'completed' && { backgroundColor: successColor },
                  ]}
                >
                  <MaterialIcons
                    name={state === 'completed' ? 'check' : 'close'}
                    size={ICON_SIZE}
                    color="#fff"
                  />
                </View>
              )}
            </IconWrap>
          </View>
          {inputLoading && isInput && (
            <ActivityIndicator
              size="small"
              color={mutedColor}
              style={styles.leftIcon}
            />
          )}
          <View style={styles.titleCell}>
            {!isInput && onTextPress ? (
              <Pressable style={styles.titleCellInner} onPress={onTextPress}>
                {titleContent}
              </Pressable>
            ) : (
              <View style={styles.titleCellInner}>{titleContent}</View>
            )}
          </View>
        </View>
        {showSubtitleRow && (
          <View style={styles.row}>
            <View style={styles.gridSpacer} />
            <View style={styles.subtitleCell}>
              <Text
                style={[styles.subtitle, { color: mutedColor }]}
                numberOfLines={1}
              >
                {secondLineText}
              </Text>
            </View>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    paddingHorizontal: 16,
    justifyContent: 'center',
    elevation: 2,
  },
  grid: {
    flexDirection: 'column',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconColumn: {
    width: ICON_SIZE + 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridSpacer: {
    width: ICON_SIZE + 8,
  },
  titleCell: {
    flex: 1,
    minWidth: 0,
  },
  titleCellInner: {
    flex: 1,
    minWidth: 0,
  },
  subtitleCell: {
    flex: 1,
    minWidth: 0,
  },
  leftIcon: {
    marginRight: 0,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '400',
    paddingVertical: 2,
    paddingHorizontal: 0,
    minHeight: 24,
    borderWidth: 0,
    outlineWidth: 0,
  },
  subtitle: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '400',
    opacity: 0.8,
  },
  inputWithIcon: {
    marginLeft: 0,
  },
  iconCircle: {
    width: ICON_SIZE + 8,
    height: ICON_SIZE + 8,
    borderRadius: (ICON_SIZE + 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCircle: {},
  errorCircle: {
    backgroundColor: ERROR_COLOR,
  },
});
