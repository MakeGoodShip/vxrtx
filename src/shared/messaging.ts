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
  | "check-local-ai"
  | "download-chrome-ai"
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
 * The entire request/response lifecycle happens over the port,
 * avoiding the MV3 message channel timeout entirely.
 *
 * Also receives progress updates during processing.
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
          // Final response
          resolve(msg as MessageResponse<TRes>);
          port.disconnect();
        }
      },
    );

    port.onDisconnect.addListener(() => {
      // If port dies before we got a response, resolve with error
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error:
            chrome.runtime.lastError.message ??
            "Connection lost to background worker",
        } as MessageResponse<TRes>);
      }
    });

    // Send the request over the port
    port.postMessage({ action, payload });
  });
}
