import websocket from "ws";
import env from "dotenv";
import fs from "fs";

import init from "./init.json";


env.config();

const files = fs.readdirSync("./build/modules").filter(v => v.endsWith(".js")).map(v => v.slice(0, -3));
const modules: Module[] = files.map(v => require(`./modules/${v}`).default) as any;

if (!process.env.token)
  throw new Error("The token is required");

init.d.token = process.env.token;

modules.forEach(m => m.env && m.env.forEach(v => process.env[v] === undefined && (() => { console.log(`Env var "${v}" is required`); process.exit(0); })()));

const ws = new websocket("wss://gateway.discord.gg/?encoding=json&v=9");

ws.on('open', () => {
  ws.send(JSON.stringify(init));
  console.log("Initialized websocket");
});

let seq = 0;
ws.on('message', async (data: string) => {
  const { op, d, s, t }: { op: number, d: any, s?: number, t?: string  } = JSON.parse(data);
  
  seq = typeof s === "number" ? s : seq;

  switch (op) {
    case 1:
      hb();
      break;

    case 10:
      console.log("Websocket is ready!");
      setInterval(hb, d.heartbeat_interval);
      break;

    case 11:
      console.log(`Recived heartbeat confirmation; ${seq}`);
      break;
  }

  if (t === "READY") {
    console.log(`Ready: ${d.session_id}`);
    modules.forEach(m => m.ready && m.ready(d));
    return
  }

  modules.forEach(m => m.execute && m.events && m.events.includes(t!) && m.execute(op, d, t));
});

const hb = () => ws.send(JSON.stringify({op: 1, d: seq}));

ws.on("close", (data: number) => {
  console.log(`Connection hsa beed closed with code ${data}`);
  process.exit(1);
});

interface Module {
  env?: string[];
  events: string[];
  ready?: Function;
  execute: Function
}