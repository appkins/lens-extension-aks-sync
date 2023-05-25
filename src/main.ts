import { Common, Main } from "@k8slens/extensions";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as yaml from "js-yaml";
import { PreferencesStore } from "./preferences-store";
import { action, observable, reaction } from "mobx";

type Subscription = {
  name: string;
  subscriptionId: string;
}

type MasterAuth = {
  clusterCaCertificate: string;
}

type Cluster = {
  name: string;
  zone: string;
  endpoint: string;
  selfLink: string;
  masterAuth: MasterAuth;
}

type Kubeconfig = {
  "current-context": string;
}

export default class AksMain extends Main.LensExtension {
  syncTimer: NodeJS.Timeout;
  subscriptions: Subscription[] = [];
  clusters = observable.array<Common.Catalog.KubernetesCluster>([]);

  async onActivate(): Promise<void> {
    console.log("AKS: activated");
    const preferencesStore = PreferencesStore.createInstance();

    await preferencesStore.loadExtension(this);

    reaction(() => preferencesStore.azcliPath, () => {
      this.subscriptions = [];
    });
    this.addCatalogSource("aks-clusters", this.clusters);
    this.syncClusters();
  }

  async onDeactivate(): Promise<void> {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    this.clusters.clear();
  }

  @action async syncClusters(): Promise<void> {
    if (this.subscriptions.length === 0) {
      this.subscriptions = await this.getSubscriptions();
    }
    console.log("AKS: syncing clusters");

    const updatedClusters: Common.Catalog.KubernetesCluster[] = [];
    try {
      const subscriptions = await this.getSubscriptions();
      for (const subscription of subscriptions) {
        const clusters = await this.getClusters(subscription.subscriptionId);
        if (clusters.length > 0) {
          for (const cluster of clusters) {
            updatedClusters.push(await this.ensureCluster(subscription, cluster));
          }
        } else {
          const index = this.subscriptions.indexOf(subscription);
          if (index > -1) {
            this.subscriptions.splice(index, 1);
          }
        }
      }
      this.clusters.replace(updatedClusters);
    } catch(error) {
      console.error("AKS: failed to sync with AKS", error);
      this.clusters.clear();
    }

    this.syncTimer = global.setTimeout(async () => {
      await this.syncClusters();
    }, 1000 * 60 * 3);
  }

  private async ensureCluster(subscription: Subscription, aksCluster: Cluster) {
    const clusterId = crypto.createHash("md5").update(aksCluster.selfLink).digest("hex");

    const kubeConfigPath = path.join(await this.getExtensionFileFolder(), aksCluster.endpoint);
    fs.closeSync(fs.openSync(kubeConfigPath, "w"));
    await this.azcli(["aks", "get-credentials", aksCluster.name, "--zone", aksCluster.zone, "--subscription", subscription.subscriptionId], {
      ...process.env,
      "KUBECONFIG": kubeConfigPath
    })

    const kubeconfig = yaml.load(fs.readFileSync(kubeConfigPath).toString()) as Kubeconfig;

    return new Common.Catalog.KubernetesCluster({
      metadata: {
        uid: clusterId,
        name: aksCluster.name,
        source: "aks-sync",
        labels: {
          "zone": aksCluster.zone,
          "subscriptionName": subscription.name,
          "subscriptionId": subscription.subscriptionId
        }
      },
      spec: {
        kubeconfigPath: kubeConfigPath,
        kubeconfigContext: kubeconfig["current-context"]
      },
      status: {
        phase: "disconnected"
      }
    });
  }

  private async getSubscriptions() {
    const subscriptions = await this.azcli<Subscription>(["subscriptions", "list"]);

    return subscriptions;
  }

  private async getClusters(subscriptionId: string) {
    return this.azcli<Cluster>(["container", "clusters", "list", "--subscription", subscriptionId]);
  }

  private async azcli<T>(args: string[], env?: NodeJS.ProcessEnv): Promise<T[]> {
    const azcliBin = PreferencesStore.getInstance().azcliPath || "azcli";
    return new Promise((resolve, reject) => {
      exec(`${azcliBin} ${args.join(" ")} --format json`, {
        env: env ?? process.env
      }, (error, stdout) => {
        if (error) {
          return reject(error);
        }
        return resolve(JSON.parse(stdout));
      })
    });
  }
}
