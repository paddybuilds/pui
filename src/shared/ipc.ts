export const ipc = {
  app: {
    versionInfo: "app:version-info",
    checkForUpdates: "app:check-for-updates"
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
  terminal: {
    create: "terminal:create",
    write: "terminal:write",
    resize: "terminal:resize",
    kill: "terminal:kill",
    data: "terminal:data",
    exit: "terminal:exit"
  },
  codex: {
    run: "codex:run",
    cancel: "codex:cancel",
    event: "codex:event",
    update: "codex:update"
  },
  git: {
    status: "git:status",
    diff: "git:diff",
    commits: "git:commits",
    stage: "git:stage",
    unstage: "git:unstage",
    discard: "git:discard",
    commit: "git:commit",
    push: "git:push",
    watch: "git:watch",
    changed: "git:changed"
  }
} as const;
