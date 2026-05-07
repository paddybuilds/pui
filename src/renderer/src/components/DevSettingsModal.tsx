import { Play, Wrench, X } from "lucide-react";
import type { DevToolsFlagState } from "../lib/devFlags";

type DevSettingsModalProps = {
  flagState: DevToolsFlagState;
  platform: string;
  onOpenOnboarding: () => void;
  onClose: () => void;
};

export function DevSettingsModal({ flagState, platform, onOpenOnboarding, onClose }: DevSettingsModalProps) {
  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-modal dev-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Developer settings"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <aside className="settings-sidebar">
          <header>
            <strong>Developer</strong>
            <button className="icon-button" type="button" title="Close developer settings" onClick={onClose}>
              <X size={15} />
            </button>
          </header>
          <nav>
            <button className="settings-tab active" type="button">
              <Wrench size={15} />
              <span>Dev settings</span>
            </button>
          </nav>
        </aside>

        <main className="settings-content">
          <header className="settings-content-header">
            <h2>Dev settings</h2>
          </header>
          <div className="settings-page">
            <section className="settings-form">
              <strong>Flows</strong>
              <div className="settings-action-row">
                <button type="button" onClick={onOpenOnboarding}>
                  <Play size={14} />
                  <span>Trigger onboarding</span>
                </button>
                <span className="settings-update-status" role="status">
                  Opens with current settings
                </span>
              </div>
            </section>

            <section className="settings-form">
              <strong>Runtime</strong>
              <div className="settings-list">
                <DevSettingRow label="Dev tools" value={flagState.enabled ? "Enabled" : "Disabled"} />
                <DevSettingRow label="Flag source" value={flagState.label} />
                <DevSettingRow label="Platform" value={platform} />
              </div>
            </section>
          </div>
        </main>
      </section>
    </div>
  );
}

function DevSettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-row">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}
