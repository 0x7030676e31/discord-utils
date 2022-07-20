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
  wsAllowedCodes: number[] = [1001, 1006]
  wsFailed: number[] = [];
  initialized: boolean = false;
  global: any = {};
  api: Api;
  init;

  constructor() {
    init.d.token = process.env.token!;
    this.init = init;
    this.api = new Api(init.d.properties.browser_user_agent, init.d.token);
  }

  on(event: Event, callback: Function) {
    this.events[event].push(callback);

    return this
  }

  async message(payload: string) {
    const { op, d, s, t }: Payload = JSON.parse(payload);

    if (s) this.websockets[0].seq = s;
    this.handleOP(op, d);

    if (t === "READY") {
      this.events.ready.forEach((f) => f(d.session_id));
      if (!this.initialized) this.modules.forEach((m) => m.ready?.(d, this));
      this.initialized = true;
      return
    }

    this.modules.forEach((m) => m.events.includes(t!) && m.execute.apply(this, [d, t]));
  }

  async handleOP(op: number, d: any) {
    switch (op) {
      case 1:
        this.heartbeat(this.websockets[0]);
        break;

      case 10:
        this.websockets[0].heartbeat = setInterval(this.heartbeat.bind(this), d.heartbeat_interval, this.websockets[0]);
        break;

      case 11:
        this.events.heartbeat.forEach((f) => f(this.websockets[0].seq));
        break;
    }
  }

  async heartbeat(ws: SocketQueue) {
    ws.ws.send(
      JSON.stringify({ op: 1, d: ws.seq })
    );
  }

  async messageBackup(payload: string) {
    const { op, d, s, t }: Payload = JSON.parse(payload);

    if (s) this.websockets[1].seq = s;

    if (op === 1)
      this.heartbeat(this.websockets[1]);
    else if (op === 10)
      this.websockets[1].heartbeat = setInterval(this.heartbeat.bind(this), d.heartbeat_interval, this.websockets[1]);

    if (t === "READY") this.events.ready.forEach((f) => f(d.session_id));
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
    this.websockets[0].ws.removeAllListeners();
    this.websockets.shift();

    const ws = this.websockets[0].ws;
    ws.removeAllListeners();
    ws.on("message", this.message.bind(this));
    ws.on("close", this.closeMain.bind(this));

    this.createNewConnection.apply(this, [false]);

    return this;
  }

  getFailedLength() {
    return this.wsFailed.filter(v => !this.wsAllowedCodes.includes(v)).length;
  }

  close(code: number) {
    this.wsFailed.push(code);
    this.events.close.forEach((f) => f(code));
    if (this.wsAllowedCodes.includes(code))
      return

    if (this.getFailedLength() !== 5) {
      return
    }
  
    throw new Error(`Websocket has been closed: ${this.wsFailed}`);
  }

  closeMain(code: number) {
    this.close(code);
    this.switchWebsocket();
  }

  closeBackup(code: number) {
    this.close(code);
    
    clearInterval(this.websockets[1].heartbeat);
    this.websockets.pop();
    this.createNewConnection.apply(this, [false]);
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
      ws.on("message", this.message.bind(this));
      ws.on("close", this.closeMain.bind(this));
      return this
    }
    
    ws.on("message", this.messageBackup.bind(this));
    ws.on("close", this.closeBackup.bind(this));

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
