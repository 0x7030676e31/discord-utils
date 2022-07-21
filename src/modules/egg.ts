import websocketHandler from "../wsHandler";

const egg_reg = /(?<![a-z])egg/i

let queue: Queue;
let eggs: string[]
let ctx: websocketHandler
export default {
  env: [ "egg", "rare_egg", "rare_egg_chance", "egg_cooldown" ],
  events: [ "MESSAGE_CREATE", "MESSAGE_UPDATE" ],
  async ready(this: websocketHandler, _: any) {
    queue = new Queue();
    eggs = [ process.env.egg!, process.env.rare_egg! ];
    ctx = this;
  },
  async execute(d: any, t: string) {
    if (t === "MESSAGE_CREATE") {
      if (!d.content || !egg_reg.test(d.content))
        return

      queue.add(d, "PUT");
      return
    }

    queue.add(d, "GET");
  }
}

class Queue {
  queue: QueueSlot[] = [];

  async hasEggReaction(channel_id: string, id: string) {
    return (await ctx.api.fetch({
      method: "GET",
      urlPath: { channels: channel_id },
      endpoint: "messages",
      query: {
        around: id,
        limit: 1,
      }
    }))[0].reactions?.find((v: any) => v.me && eggs.includes(v.emoji.name.trim())) ? true : false;
  }

  async manageReaction(channel_id: string, id: string, method: "PUT" | "DELETE") {
    try { await ctx.api.fetch({
      method: method,
      urlPath: {
        channels: channel_id,
        messages: id,
        reactions: Math.random() * 100 > +(process.env.rare_egg_chance!)
          ? process.env.egg! 
          : process.env.rare_egg!
      },
      endpoint: "@me"
    }); } catch (e) {};
  }

  async add({ channel_id, id, content }: QueueSlot, method: "PUT" | "GET" | "DELETE") {
    this.queue.push({ channel_id, id, content: content || "", method });

    if (this.queue.length === 1)
      this.queueNext();
  }

  async queueShift() {
    this.queue.shift();
    if (this.queue.length > 0)
      this.queueNext();
  }

  async queueNext() {
    const { channel_id, id, content, method } = this.queue[0];

    if (method === "GET") {
      const hasReaction = await this.hasEggReaction(channel_id, id);
      const match = egg_reg.test(content);
  
      if (!hasReaction && match)
        await this.manageReaction(channel_id, id, "PUT");
      else if (hasReaction && !match)
        await this.manageReaction(channel_id, id, "DELETE");
  
    } else {
      await this.manageReaction(channel_id, id, method);
    }
  
    setTimeout(this.queueShift.bind(this), +(process.env.egg_cooldown!));
  }
}

interface QueueSlot {
  channel_id: string;
  id: string;
  content: string;
  method: "PUT" | "GET" | "DELETE";
}
