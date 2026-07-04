import { useCallback, useEffect, useRef, useState } from 'react';

import { downloadModel, isModelDownloaded } from './localEngine';

export type TranslationModelStatus =
  | 'disabled' // Auto-Translate is off; nothing to gate on
  | 'checking' // probing the document directory for the GGUF
  | 'downloading'
  | 'ready'
  | 'error';

export interface TranslationModelState {
  status: TranslationModelStatus;
  /** Download progress in [0, 1]; meaningful while 'downloading'. */
  progress: number;
  error?: string;
  retry: () => void;
}

/**
 * First-boot model gate. When `enabled`, checks whether the
 * translation GGUF already exists in the document directory and, if
 * not, starts the HTTPS download with live progress. Concurrent
 * mounts share one download (localEngine serializes it).
 */
export default function useTranslationModel(
  enabled: boolean,
  modelUrl: string,
): TranslationModelState {
  const [status, setStatus] = useState<TranslationModelStatus>('checking');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const runRef = useRef(0);

  const ensureModel = useCallback(async () => {
    const run = ++runRef.current;
    const alive = () => runRef.current === run;
    setError(undefined);
    setStatus('checking');
    try {
      if (await isModelDownloaded(modelUrl)) {
        if (alive()) {
          setStatus('ready');
        }
        return;
      }
      if (!alive()) {
        return;
      }
      setProgress(0);
      setStatus('downloading');
      await downloadModel(modelUrl, fraction => {
        if (alive()) {
          setProgress(fraction);
        }
      });
      if (alive()) {
        setStatus('ready');
      }
    } catch (e: any) {
      if (alive()) {
        setError(e?.message ?? 'Model download failed');
        setStatus('error');
      }
    }
  }, [modelUrl]);

  useEffect(() => {
    if (enabled) {
      ensureModel();
    }
    const run = runRef; // counter ref, not a rendered node
    return () => {
      // Invalidate state updates from a stale run; the shared download
      // itself keeps going so re-enabling resumes cheaply.
      run.current++;
    };
  }, [enabled, ensureModel]);

  return {
    status: enabled ? status : 'disabled',
    progress,
    error,
    retry: ensureModel,
  };
}
