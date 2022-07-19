import websocket from "ws";
import fs from "fs";

import init from "./init.json";
import Api from "./api";

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
  initialized: boolean = false;
  init;
  api: Api;

  constructor() {
    init.d.token = process.env.token!;
    this.init = init;
    this.api = new Api(init.d.properties.browser_user_agent, init.d.token);
  }

  on(event: Event, callback: Function) {
    this.events[event].push(callback);

    return this;
  }

  async message(payload: string, ctx: this) {
    const { op, d, s, t }: Payload = JSON.parse(payload);

    if (s) ctx.websockets[0].seq = s;
    ctx.handleOP(op, d);

    if (t === "READY") {
      ctx.events.ready.forEach((f) => f());
      if (!ctx.initialized) ctx.modules.forEach((m) => m.ready?.(d, ctx));
      ctx.initialized = true;
      return;
    }

    ctx.modules.forEach((m) => m.events.includes(t!) && m.execute(d, t, ctx));
  }

  async handleOP(op: number, d: any) {
    switch (op) {
      case 1:
        this.heartbeat(0, this);
        break;

      case 10:
        this.websockets[0].heartbeat = setInterval(this.heartbeat, d.heartbeat_interval, 0, this);
        break;

      case 11:
        this.events.heartbeat.forEach((f) => f(this.websockets[0].seq));
        break;
    }
  }

  async heartbeat(id: number, ctx: this) {
    ctx.websockets[id].ws.send(
      JSON.stringify({ op: 1, d: ctx.websockets[id].seq })
    );
  }

  async messageBackup(payload: string, ctx: this) {
    const { op, d, s, t }: Payload = JSON.parse(payload);

    if (s) ctx.websockets[1].seq = s;

    if (op === 1)
      ctx.heartbeat(1, ctx);
    else if (op === 10)
      ctx.websockets[1].heartbeat = setInterval(ctx.heartbeat, d.heartbeat_interval, 1, ctx);

    if (t === "READY") ctx.events.ready.forEach((f) => f());
  }

  loadModules(checkEnv: boolean = true) {
    const files = fs
      .readdirSync("./build/modules/")
      .filter((f) => f.endsWith(".js"));
    this.modules = files
      .map((f) => require(`./modules/${f}`).default)
      .filter((m) => m?.execute && m?.events);

    if (checkEnv) this.checkEnv();

    return this.modules.length;
  }

  checkEnv() {
    this.modules.forEach((m) => m.env?.forEach((v) =>
        !process.env[v]
          ? (() => { throw new Error(`Env var ${JSON.stringify(v)} is required`) })()
          : null
      )
    );
    return this;
  }

  switchWebsocket() {
    this.events.switch.forEach((f) => f(this.websockets));

    clearInterval(this.websockets[0].heartbeat);
    this.websockets.shift();

    const ws = this.websockets[0].ws;
    ws.removeAllListeners();
    ws.on("message", async (payload: any) => this.message(payload, this));
    ws.on("close", (code: number) => this.closeMain(code, this));

    this.createNewConnection(false);

    return this;
  }

  close(code: number) {
    this.events.close.forEach((f) => f(code));
    if (code !== 1006) {
      throw new Error(`Websocket has been closed: ${code}`);
    }
  }

  closeMain(code: number, ctx: this) {
    ctx.close(code);
    ctx.switchWebsocket();
  }

  closeBackup(code: number, ctx: this) {
    ctx.close(code);
    
    clearInterval(ctx.websockets[1].heartbeat);
    ctx.websockets.pop();
    ctx.createNewConnection(false);
  }

  createNewConnection(asMain: boolean) {
    this.websockets.push({
      ws: new websocket("wss://gateway.discord.gg/?encoding=json&v=9"),
      seq: 0,
    });
    const ws = this.websockets[this.websockets.length - 1].ws;

    ws.once("open", () => {
      this.events.open.forEach((f) => f());
      ws.send(JSON.stringify(init));
    });

    if (asMain) {
      ws.on("message", async (payload: any) => this.message(payload, this));
      ws.on("close", (code: number) => this.closeMain(code, this));
      return this
    }
    
    ws.on("message", async (payload: any) => this.messageBackup(payload, this));
    ws.on("close", (code: number) => this.closeBackup(code, this));

    return this
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
