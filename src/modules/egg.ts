import fetch from "node-fetch";

// Im doing this because discord rate limits... dont ask
class Queue {
  queue: {channel: string, id: string}[] = [];
  cooldown: number = +(process.env.cooldown!); // coldown in ms

  add(channel: string, id: string) {
    this.queue.push({ channel, id });
    console.log(this.queue);
    
    if (this.queue.length === 1)
      setTimeout(() => this.react(this), this.cooldown);
  }

  react(self: Queue) {
    try {
      fetch(encodeURI(`https://discord.com/api/v9/channels/${self.queue[0].channel}/messages/${self.queue[0].id}/reactions/${process.env.egg}/@me`), {
        method: "PUT",  
        headers: {
          "Authorization": process.env.token!,
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:102.0) Gecko/20100101 Firefox/102.0",
        },
      }); 
    } catch (e) {
      // most likely dont have perms to react
    }

    self.queue.shift();
    if (self.queue.length)
      setTimeout(() => self.react(self), this.cooldown);
  }
}

const egg_reg = /(?<![a-z])egg/i
const queue = new Queue();

export default {
  events: [ "MESSAGE_CREATE" ],
  execute(_op: number, d: any, _t: string) {
    if (!d.content || !egg_reg.test(d.content))
      return

    queue.add(d.channel_id, d.id);
  }
}
