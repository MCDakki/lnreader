/**
 * Default GGUF download source for the on-device translation model.
 *
 * NOTE: huihui-ai's abliterated GGUF repos (e.g.
 * Qwen2.5-*-Instruct-abliterated-GGUF) are gated on Hugging Face and
 * return 401 for anonymous requests, so they cannot back a first-boot
 * downloader without a user-supplied HF token. This default is an
 * equivalent-footprint 4-bit Qwen2.5 3B Instruct (~1.93 GB) verified
 * publicly downloadable. Override via the persisted
 * `translationModelUrl` setting.
 */
export const DEFAULT_TRANSLATION_MODEL_URL =
  'https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf';
