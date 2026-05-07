export const ipc = {
  app: {
    versionInfo: "app:version-info",
    checkForUpdates: "app:check-for-updates",
    downloadUpdate: "app:download-update",
    installDownloadedUpdate: "app:install-downloaded-update",
    updateStatus: "app:update-status",
    setTitleBarTheme: "app:set-title-bar-theme"
  },
  dialog: {
    openFolder: "dialog:open-folder"
  },
  settings: {
    loadState: "settings:load-state",
    load: "settings:load",
    save: "settings:save"
  },
  system: {
    listShells: "system:list-shells"
  },
  fileSystem: {
    readDirectory: "file-system:read-directory",
    readFile: "file-system:read-file",
    writeFile: "file-system:write-file"
  },
  terminal: {
    create: "terminal:create",
    write: "terminal:write",
    resize: "terminal:resize",
    kill: "terminal:kill",
    data: "terminal:data",
    exit: "terminal:exit"
  },
  git: {
    status: "git:status",
    diff: "git:diff",
    commits: "git:commits",
    commitDetails: "git:commit-details",
    commitFileDiff: "git:commit-file-diff",
    stage: "git:stage",
    unstage: "git:unstage",
    discard: "git:discard",
    commit: "git:commit",
    push: "git:push",
    watch: "git:watch",
    changed: "git:changed"
  }
} as const;
