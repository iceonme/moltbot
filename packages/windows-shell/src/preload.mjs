import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("moltbotShell", {
  version: "0.1.2"
});
