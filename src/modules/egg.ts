import fetch from "node-fetch";
import websocketHandler from "../wsHandler";

const egg_reg = /(?<![a-z])egg/i
const queue: queueSlot[] = [];

let ctx: websocketHandler
export default {
  env: [ "egg", "rare_egg", "rare_egg_chance", "egg_cooldown" ],
  events: [ "MESSAGE_CREATE" ],
  async ready(_: any, context: websocketHandler) {
    ctx = context;
  },
  async execute(d: any, _: string) {
    if (!d.content || !egg_reg.test(d.content))
      return

    queueAdd(d);
  }
}


async function queueAdd({ channel_id, id }: queueSlot) {
  queue.push({ channel_id, id });

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
  const { channel_id, id } = queue[0];
  const egg = Math.random() * 100 > +(process.env.rare_egg_chance!) ? process.env.egg! : process.env.rare_egg!;

  try {
    await ctx.api.fetch({
      method: "PUT",
      urlPath: {
        channels: channel_id,
        messages: id,
        reactions: egg
      },
      endpoint: "@me"
    });
  } catch (e) {
    // most likely dont have perms to react or other discord stuff
  }

  setTimeout(queueShift, +(process.env.egg_cooldown!));
}

interface queueSlot {
  channel_id: string;
  id: string;
}
