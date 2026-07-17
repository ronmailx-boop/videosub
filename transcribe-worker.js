// Runs the whole Whisper pipeline (model load + inference) in a dedicated worker
// thread, separate from the UI thread. WASM inference is single-threaded and
// blocks whatever thread it runs on for the full duration of each chunk - keeping
// it here means the main thread (video, buttons, controls) never freezes while a
// chunk is being transcribed, no matter how long that chunk takes.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber = null;

// Surface anything that would otherwise die silently inside the worker (a hard
// OOM kill of the whole browser process can't be caught by any JS handler -
// but a "regular" uncaught error/rejection here CAN be, and without these
// listeners it would just look identical to a crash from the UI's point of
// view: everything stops with no message).
self.addEventListener('error', (e) => {
  self.postMessage({ type: 'worker-error', message: (e && e.message) || 'Unknown worker error' });
});
self.addEventListener('unhandledrejection', (e) => {
  self.postMessage({ type: 'worker-error', message: (e && e.reason && e.reason.message) || String(e.reason) });
});

async function loadTranscriber(modelName) {
  const opts = {
    // Force the int8-quantized weights instead of relying on the library
    // default. The multilingual "small" model in particular is large enough
    // in full precision (fp32) that loading it on a memory-limited Android
    // phone can push Chrome over its per-tab memory budget and get the whole
    // browser killed by the OS - not just the tab, the entire app - with no
    // JS error at all, since the process is gone before any handler can run.
    // Quantized weights cut that footprint roughly in half to a third.
    quantized: true,
    progress_callback: (data) => {
      if (data.status === 'progress' && data.total) {
        self.postMessage({ type: 'progress', pct: Math.round((data.loaded / data.total) * 100) });
      }
    }
  };
  // Try WebGPU first for a big speed boost on supported phones/browsers.
  // WebGPU is accessible from dedicated workers on Chromium, same as on the main thread.
  if (self.navigator.gpu) {
    try {
      transcriber = await pipeline('automatic-speech-recognition', modelName, { ...opts, device: 'webgpu' });
      return 'gpu';
    } catch (e) {
      console.warn('[worker] WebGPU pipeline failed, falling back to CPU/WASM', e);
    }
  }
  transcriber = await pipeline('automatic-speech-recognition', modelName, opts);
  return 'cpu';
}

self.addEventListener('message', async (event) => {
  const msg = event.data;

  if (msg.type === 'load') {
    try {
      const device = await loadTranscriber(msg.modelName);
      self.postMessage({ type: 'ready', device });
    } catch (e) {
      self.postMessage({ type: 'load-error', message: (e && e.message) || String(e) });
    }
    return;
  }

  if (msg.type === 'transcribe') {
    const { id, audio, chunkSec, language } = msg;
    try {
      if (!transcriber) throw new Error('Transcriber not loaded yet');
      const opts = { chunk_length_s: chunkSec, stride_length_s: 3 };
      // The .en-only Whisper models (used for English source audio) don't take a
      // language hint - they only ever transcribe English. Multilingual models
      // (used for any other source language) need language+task passed at
      // inference time so Whisper knows what it's listening to and to transcribe
      // rather than translate.
      if (language) {
        opts.language = language;
        opts.task = 'transcribe';
      }
      const result = await transcriber(audio, opts);
      const text = (result && result.text) ? result.text.trim() : '';
      self.postMessage({ type: 'result', id, text });
    } catch (e) {
      self.postMessage({ type: 'transcribe-error', id, message: (e && e.message) || String(e) });
    }
    return;
  }
});
