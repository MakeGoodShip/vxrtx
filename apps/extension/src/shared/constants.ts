export const STORAGE_KEYS = {
  SETTINGS: "vxrtx_settings",
  TAB_SNAPSHOT: "vxrtx_tab_snapshot",
  BOOKMARK_SNAPSHOT: "vxrtx_bookmark_snapshot",
  LOCKED_TAB_GROUPS: "vxrtx_locked_tab_groups",
  LOCKED_BOOKMARK_FOLDERS: "vxrtx_locked_bookmark_folders",
  SNAPSHOT_HISTORY: "vxrtx_snapshot_history",
} as const;

export const MAX_SNAPSHOTS = 20;

export const TAB_GROUP_COLORS: readonly string[] = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
];
