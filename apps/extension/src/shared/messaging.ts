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
  | "save-settings";

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

/**
 * Send a message over a port for long-running operations.
 * Avoids the MV3 message channel timeout and enables progress updates.
 */
export function sendLongRunningMessage<TReq = unknown, TRes = unknown>(
  action: MessageAction,
  payload?: TReq,
  onProgress?: (update: ProgressUpdate) => void,
): Promise<MessageResponse<TRes>> {
  return new Promise((resolve) => {
    const port = chrome.runtime.connect({ name: "long-running" });

    port.onMessage.addListener(
      (msg: MessageResponse<TRes> | ProgressUpdate) => {
        if ("type" in msg && msg.type === "progress") {
          onProgress?.(msg as ProgressUpdate);
        } else {
          resolve(msg as MessageResponse<TRes>);
          port.disconnect();
        }
      },
    );

    port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) {
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
