import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, ProgressBar } from 'react-native-paper';

import { useTheme } from '@hooks/persisted';
import { TranslationModelState } from '@services/translation/useTranslationModel';

interface TranslationModelOverlayProps {
  model: TranslationModelState;
}

/**
 * Full-screen blocker shown in place of the reader while the local
 * translation model is being fetched on first boot. Reading resumes
 * automatically once the download completes (the gate in
 * ReaderScreen unmounts this component when status turns 'ready').
 */
const TranslationModelOverlay: React.FC<TranslationModelOverlayProps> = ({
  model,
}) => {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {model.status === 'error' ? (
        <>
          <Text style={[styles.title, { color: theme.onSurface }]}>
            Translation assets could not be downloaded
          </Text>
          <Text style={[styles.subtitle, { color: theme.onSurfaceVariant }]}>
            {model.error}
          </Text>
          <Button
            mode="contained"
            onPress={model.retry}
            style={styles.retry}
            buttonColor={theme.primary}
            textColor={theme.onPrimary}
          >
            Retry download
          </Button>
          <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>
            You can also turn off Auto-translate in the reader settings to keep
            reading without translation.
          </Text>
        </>
      ) : (
        <>
          <Text style={[styles.title, { color: theme.onSurface }]}>
            Downloading Translation Assets…
          </Text>
          <ProgressBar
            style={styles.progressBar}
            progress={model.status === 'downloading' ? model.progress : 0}
            indeterminate={model.status === 'checking'}
            color={theme.primary}
          />
          <Text style={[styles.subtitle, { color: theme.onSurfaceVariant }]}>
            {model.status === 'downloading'
              ? `${Math.round(model.progress * 100)}%`
              : 'Preparing…'}
          </Text>
          <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>
            One-time download of the on-device translation model. Reading will
            resume automatically.
          </Text>
        </>
      )}
    </View>
  );
};

export default TranslationModelOverlay;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
  },
  progressBar: {
    width: 240,
    height: 6,
    borderRadius: 3,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 13,
    textAlign: 'center',
  },
  retry: {
    marginTop: 8,
  },
  hint: {
    marginTop: 24,
    fontSize: 12,
    textAlign: 'center',
  },
});
