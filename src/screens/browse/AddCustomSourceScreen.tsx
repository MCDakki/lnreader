import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import { Appbar, SafeAreaView } from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { borderRadius, shadow, spacing, typography } from '@theme/tokens';
import { AddCustomSourceScreenProps } from '@navigators/types';
import { MaterialDesignIconName } from '@type/icon';

const isValidUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const hostnameOf = (value: string) => {
  try {
    return new URL(value.trim()).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

interface PremiumFieldProps {
  icon: MaterialDesignIconName;
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: 'default' | 'url';
  autoFocus?: boolean;
  theme: ReturnType<typeof useTheme>;
}

const PremiumField: React.FC<PremiumFieldProps> = ({
  icon,
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType = 'default',
  autoFocus,
  theme,
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.fieldBlock}>
      <Text style={[styles.fieldLabel, { color: theme.onSurfaceVariant }]}>
        {label}
      </Text>
      <View
        style={[
          styles.fieldShadow,
          { shadowColor: theme.shadow },
          focused && shadow.card,
        ]}
      >
        <View
          style={[
            styles.field,
            {
              backgroundColor: theme.surface2 ?? theme.surface,
              borderColor: focused ? theme.primary : theme.outlineVariant,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={icon}
            size={22}
            color={focused ? theme.primary : theme.onSurfaceVariant}
            style={styles.fieldIcon}
          />
          <TextInput
            style={[styles.fieldInput, { color: theme.onSurface }]}
            placeholder={placeholder}
            placeholderTextColor={theme.onSurfaceVariant}
            value={value}
            onChangeText={onChangeText}
            keyboardType={keyboardType === 'url' ? 'url' : 'default'}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={autoFocus}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          {value ? (
            <Pressable
              hitSlop={8}
              onPress={() => onChangeText('')}
              style={styles.clearButton}
            >
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color={theme.onSurfaceVariant}
              />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const AddCustomSourceScreen = ({ navigation }: AddCustomSourceScreenProps) => {
  const theme = useTheme();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');

  const canSave = useMemo(() => isValidUrl(url), [url]);

  const handleSave = () => {
    const trimmedUrl = url.trim();
    if (!isValidUrl(trimmedUrl)) {
      showToast('Please enter a valid http(s) URL');
      return;
    }
    navigation.navigate('WebviewScreen', {
      name: name.trim() || hostnameOf(trimmedUrl) || 'Custom Web Novel',
      url: trimmedUrl,
      pluginId: '',
      isNovel: true,
    });
  };

  return (
    <SafeAreaView excludeTop style={{ backgroundColor: theme.background }}>
      <Appbar
        title="Add Custom Web Novel"
        handleGoBack={navigation.goBack}
        theme={theme}
        mode="small"
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.heroIcon,
            { backgroundColor: theme.primaryContainer ?? theme.surface2 },
          ]}
        >
          <MaterialCommunityIcons
            name="web-plus"
            size={30}
            color={theme.primary}
          />
        </View>
        <Text style={[styles.heroTitle, { color: theme.onSurface }]}>
          Read from any website
        </Text>
        <Text style={[styles.heroSubtitle, { color: theme.onSurfaceVariant }]}>
          Paste a novel or chapter link from any source and open it in the
          in-app reader.
        </Text>

        <PremiumField
          icon="link-variant"
          label="Novel or chapter URL"
          placeholder="https://example.com/novel/..."
          value={url}
          onChangeText={setUrl}
          keyboardType="url"
          autoFocus
          theme={theme}
        />
        <PremiumField
          icon="bookmark-outline"
          label="Display name (optional)"
          placeholder="e.g. My Web Novel"
          value={name}
          onChangeText={setName}
          theme={theme}
        />

        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          style={[styles.saveShadow, { shadowColor: theme.primary }]}
          android_ripple={{ color: theme.rippleColor }}
        >
          <LinearGradient
            colors={
              canSave
                ? [theme.primary, theme.tertiary]
                : [theme.surfaceDisabled, theme.surfaceDisabled]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.saveButton}
          >
            <MaterialCommunityIcons
              name="tray-arrow-down"
              size={20}
              color={canSave ? theme.onPrimary : theme.onSurfaceDisabled}
            />
            <Text
              style={[
                styles.saveLabel,
                { color: canSave ? theme.onPrimary : theme.onSurfaceDisabled },
              ]}
            >
              Save & Open
            </Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
};

export default AddCustomSourceScreen;

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    paddingTop: spacing.lg,
  },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginBottom: spacing.base,
  },
  heroTitle: {
    ...typography.title,
  },
  heroSubtitle: {
    ...typography.body,
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  fieldBlock: {
    marginBottom: spacing.xl,
  },
  fieldLabel: {
    ...typography.label,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  fieldShadow: {
    borderRadius: borderRadius.l,
    ...shadow.soft,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    borderRadius: borderRadius.l,
    borderWidth: 1.5,
    paddingHorizontal: spacing.base,
  },
  fieldIcon: {
    marginRight: spacing.md,
  },
  fieldInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: spacing.md,
  },
  clearButton: {
    marginLeft: spacing.sm,
  },
  saveShadow: {
    borderRadius: borderRadius.l,
    marginTop: spacing.sm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    borderRadius: borderRadius.l,
  },
  saveLabel: {
    ...typography.subtitle,
    marginLeft: spacing.sm,
  },
});
