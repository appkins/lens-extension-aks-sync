import { Renderer } from "@k8slens/extensions";
import React from "react";
import { observer } from "mobx-react";
import { PreferencesStore } from "./preferences-store";

@observer
export class PreferenceInput extends React.Component {
  render(): JSX.Element {
    const preferences = PreferencesStore.getInstance();

    return (
      <>
        <div className="SubTitle">Path to azcli binary</div>
        <Renderer.Component.Input
          value={preferences.azcliPath}
          theme="round-black"
          placeholder="az"
          onChange={v => { preferences.azcliPath = v; }}
        />
      </>
    );
  }
}

export class PreferenceHint extends React.Component {
  render(): JSX.Element {
    return (
      <small className="hint">The path to the azcli binary on the system.</small>
    );
  }
}
