import websocketHandler from "../wsHandler";

const egg_reg = /(?<![a-z])egg/i
const queue: queueSlot[] = [];

let eggs: string[]
let ctx: websocketHandler
export default {
  env: [ "egg", "rare_egg", "rare_egg_chance", "egg_cooldown" ],
  events: [ "MESSAGE_CREATE", "MESSAGE_UPDATE" ],
  async ready(_: any, context: websocketHandler) {
    eggs = [ process.env.egg!, process.env.rare_egg! ];
    ctx = context;
  },
  async execute(d: any, t: string) {
    if (t === "MESSAGE_CREATE") {
      if (!d.content || !egg_reg.test(d.content))
        return

      queueAdd(d, "PUT");
      return
    }

    queueAdd(d, "GET");
  }
}


const fetchMessageReaction = async (id: string, channel: string) => (await ctx.api.fetch({
  method: "GET",
  urlPath: { channels: channel },
  endpoint: "messages",
  query: {
    around: id,
    limit: 1,
  }
}))[0].reactions?.find((v: any) => v.me && eggs.includes(v.emoji.name.trim())) ? true : false;

const reactionAction = async (id: string, channel: string, method: "PUT" | "DELETE") => await ctx.api.fetch({
  method: method,
  urlPath: {
    channels: channel,
    messages: id,
    reactions: Math.random() * 100 > +(process.env.rare_egg_chance!) ? process.env.egg! : process.env.rare_egg!
  },
  endpoint: "@me"
});


async function queueAdd({ channel_id, id, content }: queueSlot, method: "PUT" | "GET" | "DELETE") {
  queue.push({ channel_id, id, content: content || "", method });

  if (queue.length === 1) {
    queueNext();
  }
}

const queueShift = async () => {
  queue.shift();
  if (queue.length > 0) {
    queueNext();
  }
}

async function queueNext() {
  const { channel_id, id, content, method } = queue[0];

  if (method === "GET") {
    const hasReaction = await fetchMessageReaction(id, channel_id);
    const match = egg_reg.test(content);

    if (!hasReaction && match)
      await reactionAction(id, channel_id, "PUT");
    else if (hasReaction && !match)
      await reactionAction(id, channel_id, "DELETE");

  } else {
    await reactionAction(id, channel_id, method);
  }

  setTimeout(queueShift, +(process.env.egg_cooldown!));
}

interface queueSlot {
  channel_id: string;
  id: string;
  content: string;
  method: "PUT" | "GET" | "DELETE";
}
