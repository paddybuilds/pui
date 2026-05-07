import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { Save, X } from "lucide-react";
import type { CodeFileTab } from "../lib/codeWorkspace";

type CodeWorkspaceProps = {
  tabs: CodeFileTab[];
  activePath?: string;
  onActivate: (path: string) => void;
  onChange: (path: string, contents: string) => void;
  onSave: (path: string) => Promise<void>;
  onClose: (path: string) => void;
};

export function CodeWorkspace({ tabs, activePath, onActivate, onChange, onSave, onClose }: CodeWorkspaceProps) {
  const [closeRequest, setCloseRequest] = useState<CodeFileTab | null>(null);
  const activeTab = tabs.find((tab) => tab.path === activePath) ?? tabs[0];
  const extensions = useMemo(() => (activeTab ? editorExtensionsForPath(activeTab.path) : []), [activeTab]);

  useEffect(() => {
    if (activeTab && activeTab.path !== activePath) {
      onActivate(activeTab.path);
    }
  }, [activePath, activeTab, onActivate]);

  const requestClose = (tab: CodeFileTab) => {
    if (tab.dirty) {
      setCloseRequest(tab);
      return;
    }
    onClose(tab.path);
  };

  const saveActive = async () => {
    if (activeTab && !activeTab.loading) {
      await onSave(activeTab.path);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveActive();
    }
  };

  return (
    <section className="code-workspace" aria-label="Code workspace" tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="code-tabs" role="tablist" aria-label="Open files">
        {tabs.map((tab) => (
          <button
            key={tab.path}
            type="button"
            role="tab"
            aria-selected={tab.path === activeTab?.path}
            className={tab.path === activeTab?.path ? "code-tab active" : "code-tab"}
            title={tab.relativePath}
            onClick={() => onActivate(tab.path)}
          >
            <span>{tab.name}</span>
            {tab.dirty ? <small aria-label="Unsaved changes" /> : null}
            <span
              role="button"
              tabIndex={0}
              className="code-tab-close"
              aria-label={`Close ${tab.name}`}
              onClick={(event) => {
                event.stopPropagation();
                requestClose(tab);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  requestClose(tab);
                }
              }}
            >
              <X size={13} />
            </span>
          </button>
        ))}
      </div>

      {activeTab ? (
        <div className="code-editor-shell">
          <header className="code-editor-header">
            <div>
              <strong title={activeTab.path}>{activeTab.relativePath}</strong>
              <span>{activeTab.loading ? "Loading" : activeTab.dirty ? "Unsaved changes" : "Saved"}</span>
            </div>
            <button
              type="button"
              disabled={activeTab.loading || !activeTab.dirty}
              onClick={() => void onSave(activeTab.path)}
            >
              <Save size={14} />
              <span>Save</span>
            </button>
          </header>
          {activeTab.error ? <div className="code-error">{activeTab.error}</div> : null}
          <div className="code-editor-host">
            <CodeMirror
              value={activeTab.contents}
              height="100%"
              theme={oneDark}
              extensions={extensions}
              editable={!activeTab.loading}
              basicSetup={{
                foldGutter: true,
                highlightActiveLine: true,
                lineNumbers: true,
                searchKeymap: true
              }}
              onChange={(value) => onChange(activeTab.path, value)}
            />
          </div>
        </div>
      ) : (
        <div className="code-empty">
          <strong>No file open</strong>
          <span>Select a file in Explorer to open it here.</span>
        </div>
      )}

      {closeRequest ? (
        <div className="code-close-backdrop" onMouseDown={() => setCloseRequest(null)}>
          <section
            className="code-close-dialog"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <strong>Save changes to {closeRequest.name}?</strong>
            <span>Your unsaved edits will be lost if you discard them.</span>
            <div>
              <button
                type="button"
                onClick={async () => {
                  await onSave(closeRequest.path);
                  onClose(closeRequest.path);
                  setCloseRequest(null);
                }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose(closeRequest.path);
                  setCloseRequest(null);
                }}
              >
                Discard
              </button>
              <button type="button" onClick={() => setCloseRequest(null)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function editorExtensionsForPath(filePath: string): Extension[] {
  const extension = filePath.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "ts":
    case "tsx":
      return [javascript({ jsx: extension === "tsx", typescript: true })];
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return [javascript({ jsx: extension === "jsx" })];
    case "css":
      return [css()];
    case "html":
    case "htm":
      return [html()];
    case "json":
      return [json()];
    case "md":
    case "mdx":
      return [markdown()];
    default:
      return [];
  }
}
