import websocket from "ws";
import fs from "fs";

import init from "./init.json";
import Api from "./api";

let ctx: websocketHandler;
export default class websocketHandler {
  modules: Module[] = [];
  websockets: SocketQueue[] = [];
  events: { [key: string]: Function[] } = {
    close: [],
    open: [],
    heartbeat: [],
    switch: [],
    ready: [],
  };
  wsFailed: number[] = [];
  initialized: boolean = false;
  global: any = {};
  api: Api;
  init;

  constructor() {
    init.d.token = process.env.token!;
    this.init = init;
    this.api = new Api(init.d.properties.browser_user_agent, init.d.token);
    ctx = this;
  }

  on(event: Event, callback: Function) {
    ctx.events[event].push(callback);

    return ctx
  }

  async message(payload: string) {
    const { op, d, s, t }: Payload = JSON.parse(payload);

    if (s) ctx.websockets[0].seq = s;
    ctx.handleOP(op, d);

    if (t === "READY") {
      ctx.events.ready.forEach((f) => f());
      if (!ctx.initialized) ctx.modules.forEach((m) => m.ready?.(d, ctx));
      ctx.initialized = true;
      return
    }

    ctx.modules.forEach((m) => m.events.includes(t!) && m.execute(d, t, ctx));
  }

  async handleOP(op: number, d: any) {
    switch (op) {
      case 1:
        ctx.heartbeat(0);
        break;

      case 10:
        ctx.websockets[0].heartbeat = setInterval(ctx.heartbeat, d.heartbeat_interval, 0);
        break;

      case 11:
        ctx.events.heartbeat.forEach((f) => f(ctx.websockets[0].seq));
        break;
    }
  }

  async heartbeat(id: number) {
    ctx.websockets[id].ws.send(
      JSON.stringify({ op: 1, d: ctx.websockets[id].seq })
    );
  }

  async messageBackup(payload: string) {
    const { op, d, s, t }: Payload = JSON.parse(payload);

    if (s) ctx.websockets[1].seq = s;

    if (op === 1)
      ctx.heartbeat(1);
    else if (op === 10)
      ctx.websockets[1].heartbeat = setInterval(ctx.heartbeat, d.heartbeat_interval, 1);

    if (t === "READY") ctx.events.ready.forEach((f) => f());
  }

  loadModules(checkEnv: boolean = true) {
    const files = fs
      .readdirSync("./build/modules/")
      .filter((f) => f.endsWith(".js"));
      ctx.modules = files
      .map((f) => require(`./modules/${f}`).default)
      .filter((m) => m?.execute && m?.events);

    if (checkEnv) ctx.checkEnv();

    return ctx.modules.length;
  }

  checkEnv() {
    ctx.modules.forEach((m) => m.env?.forEach((v) =>
        !process.env[v]
          ? (() => { throw new Error(`Env var ${JSON.stringify(v)} is required`) })()
          : null
      )
    );
    return ctx;
  }

  switchWebsocket() {
    ctx.events.switch.forEach((f) => f(ctx.websockets));

    clearInterval(ctx.websockets[0].heartbeat);
    ctx.websockets.shift();

    const ws = ctx.websockets[0].ws;
    ws.removeAllListeners();
    ws.on("message", ctx.message);
    ws.on("close", (code: number) => ctx.closeMain(code));

    ctx.createNewConnection(false);

    return ctx;
  }

  close(code: number) {
    ctx.events.close.forEach((f) => f(code));
    ctx.wsFailed.push(code);
    if (code === 1006)
      return

    if (ctx.wsFailed.filter(v => v !== 1006).length !== 5)
      return
  
    throw new Error(`Websocket has been closed: ${ctx.wsFailed}`);
  }

  closeMain(code: number) {
    ctx.close(code);
    ctx.switchWebsocket();
  }

  closeBackup(code: number) {
    ctx.close(code);
    
    clearInterval(ctx.websockets[1].heartbeat);
    ctx.websockets.pop();
    ctx.createNewConnection(false);
  }

  createNewConnection(asMain: boolean) {
    ctx.websockets.push({
      ws: new websocket("wss://gateway.discord.gg/?encoding=json&v=9"),
      seq: 0,
    });
    const ws = ctx.websockets[ctx.websockets.length - 1].ws;

    ws.once("open", () => {
      ctx.events.open.forEach((f) => f());
      ws.send(JSON.stringify(init));
    });

    if (asMain) {
      ws.on("message", ctx.message);
      ws.on("close", ctx.closeMain);
      return ctx
    }
    
    ws.on("message", ctx.messageBackup);
    ws.on("close", ctx.closeBackup);

    return ctx
  }
}

interface Module {
  env?: string[];
  events: string[];
  ready?: Function;
  execute: Function;
}

interface SocketQueue {
  ws: websocket;
  seq: number;
  heartbeat?: NodeJS.Timer;
}

type Event = "close" | "open" | "heartbeat" | "switch" | "ready";

interface Payload {
  op: number;
  d: any;
  s?: number;
  t?: string;
}
