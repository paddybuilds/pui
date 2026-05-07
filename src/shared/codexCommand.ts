export type CodexRunCommandOptions = {
  model?: string;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
};

export function buildCodexExecArgs(prompt: string, workspace: string, options: CodexRunCommandOptions = {}): string[] {
  const args = ["exec", "--json", "--cd", workspace];

  if (options.model) {
    args.push("--model", options.model);
  }

  if (options.sandbox) {
    args.push("--sandbox", options.sandbox);
  }

  args.push(prompt);
  return args;
}
