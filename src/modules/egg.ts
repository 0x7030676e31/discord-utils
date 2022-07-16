import fetch from "node-fetch";

const egg_reg = /(?<![a-z])egg/i

module.exports = {
  events: [ "MESSAGE_CREATE" ],
  execute(_op: number, d: any, _t: string) {
    if (!d.content || !egg_reg.test(d.content))
      return

    try {
      fetch(`https://discord.com/api/v9/channels/${d.channel_id}/messages/${d.id}/reactions/%F0%9F%A5%9A/@me`, {
      method: "PUT",  
      headers: {
        "Authorization": process.env.token!,
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:102.0) Gecko/20100101 Firefox/102.0",
      },
      }); 
    } catch (e) {
      console.log(e);
    }
  }
}

