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
    save: "settings:save",
    saveTerminalSnapshots: "settings:save-terminal-snapshots"
  },
  system: {
    listShells: "system:list-shells"
  },
  fileSystem: {
    readDirectory: "file-system:read-directory",
    listFilePaths: "file-system:list-file-paths",
    readFile: "file-system:read-file",
    writeFile: "file-system:write-file",
    createFile: "file-system:create-file",
    createDirectory: "file-system:create-directory",
    rename: "file-system:rename",
    delete: "file-system:delete"
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
    unwatch: "git:unwatch",
    changed: "git:changed"
  }
} as const;
