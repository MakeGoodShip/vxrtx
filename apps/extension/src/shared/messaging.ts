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

export function sendMessage<TReq = unknown, TRes = unknown>(
  action: MessageAction,
  payload?: TReq,
): Promise<MessageResponse<TRes>> {
  return chrome.runtime.sendMessage<Message<TReq>, MessageResponse<TRes>>({
    action,
    payload,
  });
}
