import env from "dotenv";
import wsHandler from "./wsHandler";

env.config();

if (!process.env.token)
  throw new Error("Env var \"token\" is required")

const ws = new wsHandler()
  .on("open", () => console.log("New websocket has been initialized"))
  .on("ready", () => console.log("New websocket is ready"))
  .on("heartbeat", (seq: number) => console.log(`Server responded to heartbeat; ${seq}`))
  .on("switch", (ws: any[]) => console.log(`Switching between websockets; old: ${ws[0].seq}; new: ${ws[1].seq}`));

// console.log(`Loaded ${ws.loadModules()} modules`);

ws.createNewConnection(true);
setTimeout(ws.createNewConnection, 30 * 60 * 1000, false);
