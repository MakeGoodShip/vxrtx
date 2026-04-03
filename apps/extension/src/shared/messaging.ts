export type MessageAction =
  | "organize-tabs"
  | "apply-tab-suggestions"
  | "undo-tab-changes"
  | "organize-bookmarks"
  | "suggest-bookmark-location"
  | "find-duplicate-bookmarks"
  | "apply-bookmark-suggestions"
  | "undo-bookmark-changes"
  | "cleanup-empty-folders"
  | "get-locked-tab-groups"
  | "lock-tab-group"
  | "unlock-tab-group"
  | "get-locked-bookmark-folders"
  | "lock-bookmark-folder"
  | "unlock-bookmark-folder"
  | "get-settings"
  | "save-settings"
  | "get-snapshots"
  | "create-snapshot"
  | "restore-snapshot"
  | "delete-snapshot"
  | "rename-snapshot"
  | "import-snapshots";

export interface Message<T = unknown> {
  action: MessageAction;
  payload?: T;
}

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ProgressUpdate {
  type: "progress";
  current: number;
  total: number;
  message: string;
}

export function sendMessage<TReq = unknown, TRes = unknown>(
  action: MessageAction,
  payload?: TReq,
): Promise<MessageResponse<TRes>> {
  return chrome.runtime.sendMessage<Message<TReq>, MessageResponse<TRes>>({
    action,
    payload,
  });
}

/** Timeout for silence between progress updates (45 seconds). Resets on each progress message. */
const SILENCE_TIMEOUT_MS = 45_000;

/**
 * Send a message over a port for long-running operations.
 * Avoids the MV3 message channel timeout and enables progress updates.
 * Includes a silence timeout — if no progress or result arrives within 45s, assumes hung.
 */
export function sendLongRunningMessage<TReq = unknown, TRes = unknown>(
  action: MessageAction,
  payload?: TReq,
  onProgress?: (update: ProgressUpdate) => void,
): Promise<MessageResponse<TRes>> {
  return new Promise((resolve) => {
    const port = chrome.runtime.connect({ name: "long-running" });
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    function resetTimer() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          port.disconnect();
          resolve({
            success: false,
            error: "Operation timed out — no response from AI provider. Check your API key and network connection.",
          } as MessageResponse<TRes>);
        }
      }, SILENCE_TIMEOUT_MS);
    }

    resetTimer();

    port.onMessage.addListener(
      (msg: MessageResponse<TRes> | ProgressUpdate) => {
        if ("type" in msg && msg.type === "progress") {
          resetTimer(); // Activity — keep waiting
          onProgress?.(msg as ProgressUpdate);
        } else if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(msg as MessageResponse<TRes>);
          port.disconnect();
        }
      },
    );

    port.onDisconnect.addListener(() => {
      if (!settled && chrome.runtime.lastError) {
        settled = true;
        clearTimeout(timer);
        resolve({
          success: false,
          error:
            chrome.runtime.lastError.message ??
            "Connection lost to background worker",
        } as MessageResponse<TRes>);
      }
    });

    port.postMessage({ action, payload });
  });
}
