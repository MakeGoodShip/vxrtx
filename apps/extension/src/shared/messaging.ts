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

/** Safety timeout for long-running operations (90 seconds). */
const LONG_RUNNING_TIMEOUT_MS = 90_000;

/**
 * Send a message over a port for long-running operations.
 * Avoids the MV3 message channel timeout and enables progress updates.
 * Includes a safety timeout to prevent indefinite hangs.
 */
export function sendLongRunningMessage<TReq = unknown, TRes = unknown>(
  action: MessageAction,
  payload?: TReq,
  onProgress?: (update: ProgressUpdate) => void,
): Promise<MessageResponse<TRes>> {
  return new Promise((resolve) => {
    const port = chrome.runtime.connect({ name: "long-running" });
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        port.disconnect();
        resolve({
          success: false,
          error: "Operation timed out. The AI provider may be unreachable or the request was too large.",
        } as MessageResponse<TRes>);
      }
    }, LONG_RUNNING_TIMEOUT_MS);

    port.onMessage.addListener(
      (msg: MessageResponse<TRes> | ProgressUpdate) => {
        if ("type" in msg && msg.type === "progress") {
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
