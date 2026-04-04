export const STORAGE_KEYS = {
  SETTINGS: "vxrtx_settings",
  TAB_SNAPSHOT: "vxrtx_tab_snapshot",
  BOOKMARK_SNAPSHOT: "vxrtx_bookmark_snapshot",
  LOCKED_TAB_GROUPS: "vxrtx_locked_tab_groups",
  LOCKED_BOOKMARK_FOLDERS: "vxrtx_locked_bookmark_folders",
  SNAPSHOT_HISTORY: "vxrtx_snapshot_history",
  CORRECTIONS: "vxrtx_corrections",
  EXPERIMENT_LOGS: "vxrtx_experiment_logs",
} as const;

export const MAX_SNAPSHOTS = 20;
export const MAX_CORRECTIONS = 50;
export const MAX_EXPERIMENT_LOGS = 200;

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
