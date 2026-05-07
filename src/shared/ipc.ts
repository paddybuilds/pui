export const ipc = {
  dialog: {
    openFolder: "dialog:open-folder"
  },
  settings: {
    load: "settings:load",
    save: "settings:save"
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
    watch: "git:watch",
    changed: "git:changed"
  }
} as const;
