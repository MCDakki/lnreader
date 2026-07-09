import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import React, { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Color from 'color';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import { useTheme } from '@hooks/persisted';
import { MaterialDesignIconName } from '@type/icon';

const TRACK_WIDTH = 60;
const TRACK_HEIGHT = 34;
const TRACK_RADIUS = TRACK_HEIGHT / 2;
const THUMB_SIZE = 26;
const THUMB_PADDING = (TRACK_HEIGHT - THUMB_SIZE) / 2;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_PADDING * 2;

interface PremiumSwitchProps {
  value: boolean;
  onValueChange?: () => void;
  /** Optional icon rendered inside the thumb for extra premium flair. */
  icon?: MaterialDesignIconName;
  style?: StyleProp<ViewStyle>;
}

/**
 * A premium, custom-animated switch built on Reanimated. Unlike the stock
 * MD3 switch it features a soft gradient track, a glowing accent shadow and
 * an optional icon that fades in as it activates — designed for standout
 * toggles such as "Auto-translate".
 */
const PremiumSwitch = ({
  value,
  onValueChange,
  icon,
  style,
}: PremiumSwitchProps) => {
  const theme = useTheme();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 220 });
  }, [progress, value]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: withSpring(value ? THUMB_TRAVEL : 0, {
          mass: 1,
          damping: 16,
          stiffness: 160,
        }),
      },
    ],
  }));

  const gradientStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 0.55]),
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.4, 1]) }],
  }));

  return (
    <Pressable onPress={onValueChange} hitSlop={8}>
      <Animated.View
        style={[
          styles.glow,
          { backgroundColor: theme.primary, shadowColor: theme.primary },
          glowStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.track,
          style,
          {
            backgroundColor: theme.surfaceVariant,
            borderColor: theme.outline,
          },
        ]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, gradientStyle]}>
          <LinearGradient
            colors={[theme.primary, theme.tertiary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.thumb,
            {
              backgroundColor: value
                ? theme.onPrimary
                : Color(theme.outline).lighten(0.2).string(),
            },
            thumbStyle,
          ]}
        >
          {icon ? (
            <Animated.View style={iconStyle}>
              <MaterialCommunityIcons
                name={icon}
                size={15}
                color={theme.primary}
              />
            </Animated.View>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
};

export default React.memo(PremiumSwitch);

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: 2,
    left: 4,
    right: 4,
    bottom: 2,
    borderRadius: TRACK_RADIUS,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_RADIUS,
    borderWidth: 1.5,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
    borderRadius: TRACK_RADIUS,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    marginHorizontal: THUMB_PADDING,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});
