/**
 * Smart API Client with exponential backoff retry and AbortController support.
 * All API calls go through here for consistent error handling and request dedup.
 */

const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 800,
  maxDelay: 8000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

/** Pending requests map for deduplication */
const _pending = new Map();

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isRetryable(error, status) {
  if (error.name === 'AbortError') return false;
  if (error.name === 'TypeError' && error.message.includes('fetch')) return true;
  if (RETRY_CONFIG.retryableStatuses.includes(status)) return true;
  return false;
}

/**
 * Fetch with smart retry and optional abort signal.
 * @param {string} url
 * @param {object} options
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}) {
  const { retries = RETRY_CONFIG.maxRetries, signal, ...fetchOpts } = options;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { ...fetchOpts, signal });
      if (!response.ok && isRetryable(null, response.status)) {
        lastError = new Error(`HTTP ${response.status}`);
        if (attempt < retries) {
          const delay = Math.min(
            RETRY_CONFIG.baseDelay * Math.pow(2, attempt) + Math.random() * 500,
            RETRY_CONFIG.maxDelay
          );
          await sleep(delay);
          continue;
        }
      }
      return response;
    } catch (error) {
      lastError = error;
      if (error.name === 'AbortError') throw error;
      if (isRetryable(error) && attempt < retries) {
        const delay = Math.min(
          RETRY_CONFIG.baseDelay * Math.pow(2, attempt) + Math.random() * 500,
          RETRY_CONFIG.maxDelay
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/** Deduplicated fetch - if same URL is already in flight, return the same promise */
export function fetchDeduped(url, options = {}) {
  const key = `${url}|${JSON.stringify(options.body || '')}`;
  if (_pending.has(key)) return _pending.get(key);

  const promise = fetchWithRetry(url, options).finally(() => {
    _pending.delete(key);
  });
  _pending.set(key, promise);
  return promise;
}

/** Cancel all pending requests (useful when switching views) */
export function cancelPendingRequests() {
  _pending.clear();
}

/**
 * Create an abortable request with auto-cleanup.
 * Usage:
 *   const { signal, abort } = createAbortable();
 *   const res = await fetchWithRetry(url, { signal });
 */
export function createAbortable() {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
  };
}

/** Get error message for display based on error type */
export function getErrorMessage(error, lang = 'de') {
  if (error.name === 'AbortError') {
    return lang === 'de' ? 'Anfrage abgebrochen' : 'Request cancelled';
  }
  if (error.message?.includes('NetworkError') || error.message?.includes('fetch')) {
    return lang === 'de'
      ? 'Keine Verbindung. Prüfe dein Internet und versuche es erneut.'
      : 'No connection. Check your internet and try again.';
  }
  if (error.message?.includes('429')) {
    return lang === 'de'
      ? 'Zu viele Anfragen. Bitte warte einen Moment.'
      : 'Too many requests. Please wait a moment.';
  }
  if (error.message?.includes('503')) {
    return lang === 'de'
      ? 'Dieser Dienst ist vorübergehend nicht verfügbar.'
      : 'This service is temporarily unavailable.';
  }
  return lang === 'de'
    ? 'Etwas ist schiefgelaufen. Versuche es erneut.'
    : 'Something went wrong. Please try again.';
}
