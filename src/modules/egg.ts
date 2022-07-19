import fetch from "node-fetch";

const egg_reg = /(?<![a-z])egg/i
const queue: queueSlot[] = [];

export default {
  env: [ "egg", "rare_egg", "rare_egg_chance", "egg_cooldown" ],
  events: [ "MESSAGE_CREATE" ],
  async execute(_op: number, d: any, _t: string) {
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
  const egg = Math.random() * 100 > +(process.env.rare_egg_chance!) ? process.env.egg : process.env.rare_egg;

  try {
    await fetch(encodeURI(`https://discord.com/api/v9/channels/${channel_id}/messages/${id}/reactions/${egg}/@me`), {
      method: "PUT",  
      headers: {
        "Authorization": process.env.token!,
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:102.0) Gecko/20100101 Firefox/102.0",
      },
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
