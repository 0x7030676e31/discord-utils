import fetch from "node-fetch";

const egg_reg = /(?<![a-z])egg/i

const queue: {channel: string, id: string}[] = []
let lastReaction = 0;

export default {
  events: [ "MESSAGE_CREATE" ],
  execute(_op: number, d: any, _t: string) {
    if (!d.content || !egg_reg.test(d.content))
      return

    queue.push({channel: d.channel_id, id: d.id});
    const deltaT = (lastReaction + queue.length * +(process.env.cooldown!)) - new Date().getTime();

    if (deltaT <= 0) {
      queueShift();
      return
    }

    lastReaction = new Date().getTime() + queue.length * +(process.env.cooldown!);
    setTimeout(queueShift, deltaT);
  }
}

function queueShift() {
  const egg = Math.random() * 100 > +(process.env.rare_egg_chance!) ? process.env.egg : process.env.rare_egg;
  const target = queue.shift()!;
  try {
    fetch(encodeURI(`https://discord.com/api/v9/channels/${target.channel}/messages/${target.id}/reactions/${egg}/@me`), {
      method: "PUT",  
      headers: {
        "Authorization": process.env.token!,
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:102.0) Gecko/20100101 Firefox/102.0",
      },
    });
  } catch (e) {
    // most likely dont have perms to react
  }
}
