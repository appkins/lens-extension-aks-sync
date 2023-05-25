import { Common } from "@k8slens/extensions";
import { makeObservable, observable, toJS } from "mobx";

export type AksPreferencesModel = {
  azcliPath?: string;
};

export class PreferencesStore extends Common.Store.ExtensionStore<AksPreferencesModel> {
  @observable azcliPath: string;

  public constructor() {
    super({
      configName: "preferences-store"
    });

    makeObservable(this);
  }

  protected fromStore({ azcliPath }: AksPreferencesModel): void {
    this.azcliPath = azcliPath;
  }

  toJSON(): AksPreferencesModel {
    return toJS({
      azcliPath: this.azcliPath
    }, {
      recurseEverything: true
    });
  }
}
