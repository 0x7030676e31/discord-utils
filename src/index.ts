import websocket from "ws";
import env from "dotenv";
import fs from "fs";

env.config();

// load modules
const files = fs.readdirSync("./build/modules").filter(v => v.endsWith(".js")).map(v => v.slice(0, -3));
const modules: {events: string[]; ready?: Function; execute: Function }[] = files.map(v => require(`./modules/${v}`)) as any;

const init = JSON.parse(fs.readFileSync("init.json", "utf-8"));

if (!process.env.token)
  throw new Error("The token is required");
  init.d.token = process.env.token;

const ws = new websocket("wss://gateway.discord.gg/?encoding=json&v=9");

ws.on('open', () => {
  ws.send(JSON.stringify(init));
  console.log("Initialized websocket");
});

let seq = 0;
let session_id = "";
ws.on('message', async (data: string) => {
  const { op, d, s, t }: { op: number, d: any, s?: number, t?: string  } = JSON.parse(data);
  
  seq = typeof s === "number" ? s : seq;

  switch (op) {
    case 1:
      hb();
      break;
    
    case 7:
      console.log(`Attempting to reconnect (seq: ${seq}, session_id: ${session_id})`);
      ws.send(JSON.stringify({
        op: 6,
        d: {
          token: process.env.token,
          session_id,
          seq: seq,
        }
      }));

    case 10:
      console.log("Websocket is ready!");
      setInterval(hb, d.heartbeat_interval);
      break;

    case 11:
      console.log(`Recived heartbeat confirmation; ${seq}`);
      break;
  }
  
  if (t === "READUMED") {
    console.log("Client resumed successfully");
  }

  if (t === "READY") {
    console.log(`Ready: ${d.session_id}`);
    session_id = d.session_id;
    modules.filter(m => m.ready).forEach(m => m.ready!(d));
    return
  }

  modules.filter(m => m.events.includes(t!)).forEach(m => m.execute(op, d, t));
});

const hb = () => {
  ws.send(JSON.stringify({op: 1, d: seq}));
}

ws.on("close", (data: any) => {
  console.log(data);
  process.exit(1);
});
