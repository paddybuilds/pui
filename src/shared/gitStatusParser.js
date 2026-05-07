export function parseGitStatus(output, options = {}) {
  const trimPaths = Boolean(options.trimPaths);

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const indexStatus = line[0] || " ";
      const workingTreeStatus = line[1] || " ";
      const rawPath = line.slice(3);
      const resolvedPath = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) || rawPath : rawPath;
      const path = trimPaths ? resolvedPath.trim() : resolvedPath;
      return { path, indexStatus, workingTreeStatus };
    });
}
