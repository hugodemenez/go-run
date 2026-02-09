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
  /** Web: whether the card can be dragged (HTML5 Drag and Drop) */
  draggable?: boolean;
  /** Web: called when drag starts */
  onDragStart?: () => void;
  /** Web: called when drag ends */
  onDragEnd?: () => void;
};

const ICON_SIZE = 8; // 2x smaller than before (was 24)
const ICON_SIZE_MOBILE = 18; // icon glyph size for mobile
const ICON_CONTAINER_MOBILE = 36; // touch-friendly container

function IconWrap({
  onPress,
  children,
}: {
  onPress?: () => void;
  children: React.ReactNode;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {children}
      </Pressable>
    );
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
  draggable: isDraggable = false,
  onDragStart: onDragStartProp,
  onDragEnd: onDragEndProp,
}: WorkoutCardProps) {
  const mutedColor = useThemeColor(
    { light: '#999999', dark: '#BBBBBB' },
    'icon'
  );
  const cardBg = useThemeColor(
    { light: '#ffffff', dark: '#1e1e1e' },
    'background'
  );
  const cardBorder = useThemeColor(
    { light: '#d4d4d4', dark: '#404040' },
    'background'
  );
  const titleColor = useThemeColor(
    { light: '#1f2937', dark: '#ffffff' },
    'text'
  );
  const errorColor = '#E5484D';
  const isMobile = Platform.OS !== 'web';
  const iconSize = isMobile ? ICON_SIZE_MOBILE : ICON_SIZE;
  const iconContainerSize = isMobile ? ICON_CONTAINER_MOBILE : 16;
  const titleFontSize = isMobile ? 18 : undefined;
  const titleMinHeight = isMobile ? 24 : undefined;
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

  const titleWeight: TextStyle['fontWeight'] = isMobile ? '500' : '400';

  const titleContent = isInput ? (
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={mutedColor}
      editable
      multiline={false}
      underlineColorAndroid="transparent"
      onKeyPress={handleKeyPress}
      style={[
        {
          color: titleColor,
          fontSize: isMobile ? 18 : 14,
          fontWeight: titleWeight,
          paddingVertical: 2,
          paddingHorizontal: 0,
          minHeight: 24,
          borderWidth: 0,
        } as TextStyle,
        Platform.OS === 'web' ? ({ outlineWidth: 0, outline: 'none' } as TextStyle) : undefined,
      ].filter(Boolean) as TextStyle[]}
      {...restTextInputProps}
    />
  ) : (
    <Text
      style={{
        color: state === 'error' ? errorColor : titleColor,
        fontSize: isMobile ? 18 : 14,
        fontWeight: titleWeight,
      }}
      numberOfLines={1}
    >
      {displayValue}
    </Text>
  );

  const showSubtitleRow = !isInput && secondLineText != null;

  const rootClassName = [
    isMobile
      ? 'group rounded-xl justify-center'
      : 'group rounded-lg border border-gray-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 py-1 px-4 justify-center shadow-sm',
    className,
  ].filter(Boolean).join(' ');

  const mobileCardStyle = isMobile
    ? {
        backgroundColor: cardBg,
        borderWidth: 1,
        borderColor: cardBorder,
        paddingVertical: 14,
        paddingHorizontal: 16,
        minHeight: 72,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
      }
    : undefined;

  // Web-only: set up HTML5 Drag and Drop via direct DOM manipulation
  // (React Native Web filters out unknown props like `draggable` / `onDragStart`)
  const rootRef = useRef<View>(null);
  const onDragStartRef = useRef(onDragStartProp);
  onDragStartRef.current = onDragStartProp;
  const onDragEndRef = useRef(onDragEndProp);
  onDragEndRef.current = onDragEndProp;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = rootRef.current as any;
    if (!node) return;

    if (!isDraggable || isInput) {
      node.removeAttribute?.('draggable');
      node.style && (node.style.cursor = '');
      return;
    }

    node.setAttribute('draggable', 'true');
    node.style && (node.style.cursor = 'grab');

    const handleDragStart = (e: DragEvent) => {
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      onDragStartRef.current?.();
    };
    const handleDragEnd = () => onDragEndRef.current?.();

    node.addEventListener('dragstart', handleDragStart);
    node.addEventListener('dragend', handleDragEnd);

    return () => {
      node.removeAttribute?.('draggable');
      node.style && (node.style.cursor = '');
      node.removeEventListener('dragstart', handleDragStart);
      node.removeEventListener('dragend', handleDragEnd);
    };
  }, [isDraggable, isInput]);

  return (
    <Animated.View
      ref={rootRef}
      className={rootClassName}
      style={[
        style,
        mobileCardStyle,
        {
          opacity: enterOpacity,
          transform: [
            { translateY: enterTranslate },
            { scale: Animated.multiply(enterScale, statePulse) },
          ],
        },
      ]}
    >
      <View style={{ flexDirection: 'column', alignSelf: 'stretch' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch' }}>
          <View
            className="items-center justify-center"
            style={{ width: iconContainerSize, height: iconContainerSize }}
          >
            <IconWrap onPress={onIconPress}>
              {state === 'pending' || state === 'input' ? (
                <MaterialCommunityIcons
                  name="dots-circle"
                  size={iconContainerSize}
                  color={mutedColor as string}
                />
              ) : (
                <View
                  style={{
                    width: iconContainerSize,
                    height: iconContainerSize,
                    borderRadius: iconContainerSize / 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: state === 'completed' ? '#16a34a' : '#E5484D',
                  }}
                >
                  <MaterialIcons
                    name={state === 'completed' ? 'check' : 'close'}
                    size={iconSize}
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
          <View style={{ flex: 1, justifyContent: 'center' }}>
            {!isInput && onTextPress ? (
              <Pressable onPress={onTextPress}>
                {titleContent}
              </Pressable>
            ) : (
              titleContent
            )}
          </View>
          {onDelete && (
            <Pressable
              onPress={onDelete}
              className={`${isMobile ? 'opacity-60' : 'opacity-0 group-hover:opacity-100'} transition-opacity self-center rounded active:opacity-40`}
              style={isMobile ? { padding: 8, marginRight: -8 } : { padding: 4 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons
                name="delete-outline"
                size={isMobile ? 22 : 20}
                color={mutedColor as string}
              />
            </Pressable>
          )}
        </View>
        {showSubtitleRow && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: isMobile ? 4 : 0 }}>
            <View style={{ width: iconContainerSize }} />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: isMobile ? 14 : 12,
                  color: mutedColor,
                }}
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
