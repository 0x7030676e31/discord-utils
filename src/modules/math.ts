import websocketHandler from "../wsHandler";
import Decimal from "decimal.js";

Decimal.set({
  precision: 100,
});

let ctx: websocketHandler;
let queue: Queue;
let selfID: string;
export default {
  env: [ "math_cooldown" ],
  async ready(this: websocketHandler, d: any) {
    ctx = this;
    queue = new Queue();
    selfID = d.user.id;
  },
  events: [ "MESSAGE_CREATE" ],
  async execute(d: any, _: string) {
    if (!d.content || d.author.id === selfID)
      return

    const expr = new Eval(d);
    try { expr.calculate() } catch (e) {}
  }
}

class Queue {
  queue: QueueSlot[] = [];

  async add(msg: QueueSlot) {
    this.queue.push(msg);

    if (this.queue.length === 1)
      this.queueNext();
  }

  async queueShift() {
    this.queue.shift();
    if (this.queue.length > 0)
      this.queueNext();
  }

  async queueNext() {
    const { content, id, channel, guild } = this.queue[0];

    try { await ctx.api.fetch({
      method: "POST",
      urlPath: {
        channels: channel,
      },
      endpoint: "messages",
      payload: {
        content,
        message_reference: {
          channel_id: channel,
          message_id: id,
          ...(guild && {guild_id: guild}),
        },
        allowed_mentions: {
          parse: [ "users", "roles", "everyone" ],
          replied_user: false,
        },
      }
    });
    } catch (e) {}

    setTimeout(this.queueShift.bind(this), +(process.env.math_cooldown!));
  }
}

class Eval {
  text: string;
  id: string;
  channel_id: string;
  guild_id?: string;
  tokens: any[] = [];
  reference: any[] = this.tokens;
  depth: number = 0;
  asFunction: number[] = [];
  lastToken: string | null = null;
  cursor: number = 0;

  dontMoveSignAftyer: string[] = ["operation", "open"];

  rules: [string, RegExp][] = [
    ["number", /^[+\-]?\d+(\.\d+)?/],
    ["operation", /^(\/\/|[+\-\*\/^%])/],
    ["function", /^[a-z]+(?=\()/],
    ["const", /^[a-z]+/],
    ["open", /^\(/],
    ["close", /^\)/],
    ["comma", /^,/],
  ]

  order = [
    ["^", "%"],
    ["//", "/", "*"],
    ["+", "-"]
  ]

  functions: { [key: string]: [number, number, Function] } = {
    rad: [1, 1, (num: Decimal) => num.mul(this.constants.pi).div(180)],
    deg: [1, 1, (num: Decimal) => num.mul(180).div(this.constants.pi)],
    floor: [1, 1, (num: Decimal) => num.floor()],
    ceil: [1, 1, (num: Decimal) => num.ceil()],
    round: [1, 1, (num: Decimal) => num.round()],
    sqrt: [1, 1, (num: Decimal) => num.sqrt()],
    cbrt: [1, 1, (num: Decimal) => num.cbrt()],
    ln: [1, 1, (num: Decimal) => num.ln()],
    log: [1, 2, (num: Decimal, num2?: Decimal) => num.log(num2)],
    exp: [1, 1, (num: Decimal) => num.exp()],
    min: [1, Infinity, (...nums: Decimal[]) => Decimal.min(...nums)],
    max: [1, Infinity, (...nums: Decimal[]) => Decimal.max(...nums)],
    abs: [1, 1, (num: Decimal) => num.abs()],
    sin: [1, 1, (num: Decimal) => num.sin()],
    cos: [1, 1, (num: Decimal) => num.cos()],
    tan: [1, 1, (num: Decimal) => num.tan()],
    csc: [1, 1, (num: Decimal) => new Decimal(1).div(this.functions.sin[2](num))],
    sec: [1, 1, (num: Decimal) => new Decimal(1).div(this.functions.cos[2](num))],
    cot: [1, 1, (num: Decimal) => new Decimal(1).div(this.functions.tan[2](num))],
    asin: [1, 1, (num: Decimal) => num.asin()],
    acos: [1, 1, (num: Decimal) => num.acos()],
    atan: [1, 1, (num: Decimal) => num.atan()],
  }

  constants: { [key: string]: Decimal } = {
    pi: Decimal.acos(-1),
    tau: Decimal.acos(-1).mul(2),
    e: new Decimal(2.718281828459045),
    phi: new Decimal(1.618033988749894),
  }

  constructor({ content, id, channel_id, guild_id }: { [key: string]: string }) {
    this.text = content.toLowerCase().replaceAll(/\s+/g, "");
    this.id = id;
    this.channel_id = channel_id;
    this.guild_id = guild_id;
  }

  send(content: string) {
    queue.add({
      content: content,
      id: this.id,
      channel: this.channel_id,
      guild: this.guild_id,
    });
  }

  async calculate() {
    if (!this.lexer())
      return

    if (this.tokens.length < 2 && typeof this.tokens[0][0] === "string")
      return

    const result = this.evaluate(this.tokens);
    if (result === null)
      return
    
    Decimal.set({
      precision: 35,
    });
    
    if (result.isNaN())
      this.send("Do you really think it will work? Have an egg instead :egg:");
    else if (result.toString() === "Infinity")
      this.send("I can't count to that many eggs, it's like counting sand in the desert");
    else if (result.toString() === "-Infinity")
      this.send("I can't count to that many eggs, it's like counting how many times \"egg\" has been said");
    else
      this.send(`=${result}`);
  }

  lexer() {
    let limit = 100000;
    while (limit > 0) {
      if (this.getNextToken() === null)
        return false

      if (this.cursor >= this.text.length)
        break;

      limit--
    }

    if (this.depth !== 0)
      return false

    return true
  }

  getNextToken() {
    const str = this.text.slice(this.cursor);
    const match = this.match(str);

    if (match === null) 
      return null

    this.cursor += match[1][0].length;

    switch (match[0]) {
      case "number":
        if (/^[+\-]/.test(match[1][0]) && this.lastToken !== null && !this.dontMoveSignAftyer.includes(this.lastToken))
          this.reference.push(match[1][0].charAt(0), ["number", new Decimal(match[1][0].slice(1))]);
        else
          this.reference.push([ match[0], new Decimal(match[1][0]) ]);

        break;
      
      case "operation":
        this.reference.push(match[1][0]);
        break;
      
      case "function":
        if (!Object.keys(this.functions).includes(match[1][0]))
          return null
        
        this.asFunction.push(this.depth + 1);
        this.reference.push([ match[0], match[1][0] ]);
        break;

      case "const":
        if (!Object.keys(this.constants).includes(match[1][0]))
          return null

        this.reference.push([ "number", this.constants[match[1][0]] ]);
        match[0] = "number";
        break;

      case "open":
        this.referenceAddDepth();
        break;

      case "close":
        if (this.depth === 0)
          return null
        
        this.referenceRemoveDepth();
        break;

      case "comma":
        if (this.asFunction[this.asFunction.length - 1] !== this.depth)
          return null

        this.reference.push(match[1][0]);
        break;
    }

    this.lastToken = match[0];
  }

  referenceAddDepth() {
    this.depth++;
    this.reference.push([])
    this.reference = this.reference[this.reference.length - 1];
  }

  referenceRemoveDepth() {
    if (this.asFunction[this.asFunction.length - 1] === this.depth)
      this.asFunction.pop();
    this.depth--;

    let reference = this.tokens;
    for (let i = 0; i < this.depth; i++) {
      reference = reference[reference.length - 1];
    }

    this.reference = reference;
  }

  evaluate(tokens: any[], asFunction?: string): Decimal | null {
    if (tokens.length === 0)
      return null

    
    // eval function
    if (asFunction !== undefined) {
      const args: any[] = [];
      while (true) {
        const pos = tokens.indexOf(",");
        if (pos === -1)
          break

        args.push(tokens.slice(0, pos));
        tokens.splice(0, pos + 1);
      }

      if (tokens.length > 0)
        args.push(tokens);

      const fn = this.functions[asFunction];
      if (args.length < fn[0] || (fn[1] !== Infinity && args.length > fn[1]))
        return null

      return fn[2](...args.map(arg => this.evaluate(arg)));
    }

    // eval brackets
    let limit = 100000;
    while (limit > 0) {
      limit--;

      const pos = tokens.findIndex(v => typeof v === "object" && typeof v[0] !== "string");
      if (pos === -1)
        break
  
      const fn = tokens[pos - 1]?.[0] === "function" ? tokens[pos - 1][1] : undefined;
      const result = this.evaluate(tokens[pos], fn);
      if (result === null)
        return null

      tokens[pos] = ["number", result];
      if (fn) tokens.splice(pos - 1, 1);
    }

    // eval normal operations
    limit = 100000;
    while (limit > 0) {
      limit--

      let pos;
      for (const ops of this.order) {
        let mul: number | undefined;

        if (ops.includes("*"))
          mul = tokens.map((t, i) => t[0] === "number" && tokens[i + 1]?.[0] === "number" && i).filter(v => v !== false)[0] as any;

        pos = Math.min(...ops.map(op => tokens.indexOf(op)).filter(v => v !== -1), mul ?? Infinity);
        if (pos === Infinity)
          continue
        
        if (mul !== undefined) {
          tokens[mul][1] = tokens[mul][1].mul(tokens[mul + 1][1]);
          tokens.splice(mul + 1, 1);
          break
        }

        if (calc(pos) === null)
          return null
        
        break
      }

      if (pos === Infinity) {
        break
      }
    }

    if (!tokens.every(token => token[0] === "number"))
      return null


    return tokens[0][1];
    

    function calc(idx: number) {
      if (idx === 0 && tokens[idx] === "-") {
        if (tokens[idx + 1]?.[0] !== "number")
          return null
        
        tokens.shift();
        tokens[0][1] = tokens[0][1].mul(-1);
        return
      }

      if (tokens[idx - 1]?.[0] !== "number" || tokens[idx + 1]?.[0] !== "number")
        return null

      const left = tokens[idx - 1][1] as Decimal;
      const right = tokens[idx + 1][1] as Decimal;


      let res;
      switch (tokens[idx]) {
        case "%":
          res = left.mod(right);
          break;
        
        case "^":
          res = left.pow(right);
          break;

        case "//":
          res = left.divToInt(right);
          break;

        case "/":
          res = left.div(right);
          break;

        case "*":
          res = left.mul(right);
          break;

        case "+":
          res = left.add(right);
          break;

        case "-":
          res = left.sub(right);
          break;
      }
      tokens[idx - 1] = [ "number", res ];
      tokens.splice(idx, 2);
    }
  }

  match(text: string): [string, RegExpExecArray] | null {
    for (const rule of this.rules) {
      const match = rule[1].exec(text);
      if (match !== null) {
        return [rule[0], match];
      }
    }
    return null
  }
}

interface QueueSlot {
  content: string;
  id: string;
  channel: string;
  guild?: string;
}
