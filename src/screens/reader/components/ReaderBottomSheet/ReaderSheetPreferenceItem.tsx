import React, { Suspense } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../../../../theme/types';
import Switch from '@components/Switch/Switch';
import PremiumSwitch from '@components/Switch/PremiumSwitch';
import { MaterialDesignIconName } from '@type/icon';

interface ReaderSheetPreferenceItemProps {
  label: string;
  value: boolean;
  onPress: () => void;
  theme: ThemeColors;
  /** Render the standout premium switch instead of the standard one. */
  premium?: boolean;
  /** Optional icon shown inside the premium switch thumb. */
  icon?: MaterialDesignIconName;
}

const ReaderSheetPreferenceItem: React.FC<ReaderSheetPreferenceItemProps> = ({
  label,
  value,
  onPress,
  theme,
  premium,
  icon,
}) => {
  return (
    <Pressable
      style={styles.container}
      android_ripple={{ color: theme.rippleColor }}
      onPress={onPress}
    >
      <Text
        style={[
          styles.label,
          { color: premium ? theme.onSurface : theme.onSurfaceVariant },
          premium && styles.premiumLabel,
        ]}
      >
        {label}
      </Text>
      <Suspense fallback={<View style={styles.fallback} />}>
        {premium ? (
          <PremiumSwitch value={value} onValueChange={onPress} icon={icon} />
        ) : (
          <Switch value={value} onValueChange={onPress} />
        )}
      </Suspense>
    </Pressable>
  );
};

export default ReaderSheetPreferenceItem;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: {
    flex: 1,
    paddingRight: 16,
  },
  premiumLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  fallback: {
    width: 52,
    height: 32,
    borderRadius: 16,
  },
});
