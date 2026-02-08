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
  className?: string;
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
  /** Optional handler when the delete button is pressed. When set, a delete button is shown on card hover. */
  onDelete?: () => void;
};

const ICON_SIZE = 8; // 2x smaller than before (was 24)

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
  className,
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
  onDelete,
}: WorkoutCardProps) {
  const mutedColor = useThemeColor(
    { light: '#999999', dark: '#BBBBBB' },
    'icon'
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
      className={`flex-1 text-sm font-normal py-0.5 px-0 min-h-6 border-0 ${state === 'error' ? 'text-red-500' : 'text-gray-800 dark:text-white'} ${inputLoading ? 'ml-0' : ''}`}
      style={Platform.OS === 'web' ? ({ outlineWidth: 0, outline: 'none' } as TextStyle) : undefined}
      {...(isInput ? restTextInputProps : {})}
    />
  );

  const showSubtitleRow = !isInput && secondLineText != null;

  const rootClassName = [
    'group rounded-lg border border-gray-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 py-1 px-4 justify-center shadow-sm',
    className,
  ].filter(Boolean).join(' ');

  return (
    <Animated.View
      className={rootClassName}
      style={[
        style,
        {
          opacity: enterOpacity,
          transform: [
            { translateY: enterTranslate },
            { scale: Animated.multiply(enterScale, statePulse) },
          ],
        },
      ]}
    >
      <View className="flex flex-col">
        <View className="flex flex-row items-center gap-3">
          <View className="w-4 items-center justify-center">
            <IconWrap onPress={onIconPress}>
              {state === 'pending' || state === 'input' ? (
                <MaterialCommunityIcons
                  name="dots-circle"
                  size={ICON_SIZE + 8}
                  color={mutedColor as string}
                />
              ) : (
                <View
                  className={`w-4 h-4 rounded-full items-center justify-center ${
                    state === 'completed'
                      ? 'bg-green-600 dark:bg-green-500'
                      : 'bg-red-500'
                  }`}
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
              color={mutedColor as string}
              className="mr-0"
            />
          )}
          <View className="flex-1 min-w-0">
            {!isInput && onTextPress ? (
              <Pressable className="flex-1 min-w-0" onPress={onTextPress}>
                {titleContent}
              </Pressable>
            ) : (
              <View className="flex-1 min-w-0">{titleContent}</View>
            )}
          </View>
          {onDelete && (
            <Pressable
              onPress={onDelete}
              className="opacity-0 group-hover:opacity-100 transition-opacity self-center p-1 rounded active:opacity-70"
            >
              <MaterialIcons
                name="delete"
                size={20}
                color={mutedColor as string}
              />
            </Pressable>
          )}
        </View>
        {showSubtitleRow && (
          <View className="flex flex-row items-center gap-3">
            <View className="w-4" />
            <View className="flex-1 min-w-0">
              <Text
                className="text-xs font-normal text-gray-500 dark:text-gray-400 opacity-80"
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
