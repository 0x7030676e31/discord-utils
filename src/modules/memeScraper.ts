import fetch from "node-fetch";

const vid_reg = /https:\/\/cdn.discordapp.com\/attachments\/\d+\/\d+\/[\s\S]+?.(mp4|mov|webm)/g
const channels_reg = /\s*,\s*/g
const channelNames: { [key: string]: string } = {}

let channels: string[] = [];
module.exports = {
  events: [ "MESSAGE_CREATE" ],
  ready(d: any) {
    channels = process.env.target!.split(channels_reg) as any;
    d.guilds.reduce((prev: any[], curr: any) => prev.concat(curr.channels), [] as any[]).forEach((c: any) => {
      if (!channels.includes(c.id))
        return

      channelNames[c.id] = c.name
    });

    console.log(`MemeScraper: Loaded all ${channels.length} channels`);
  },
  execute(_op: number, d: any, _t: string) {
    if (!channels.includes(d.channel_id))
      return

    const linkVideos: string[] = d.content ? d.content.match(vid_reg) : [];
    const attachments: any[] = d.attachments ? d.attachments : [];

    if (linkVideos.length === 0 && attachments.length === 0)
      return

    const embeds: any[] = [];
    attachments.forEach(v => {
      if (!v.content_type)
        return

      if (v.content_type.startsWith("image/")) {
        embeds.push({ image: { url: v.url }, footer: { text: `${v.file_ame}; ${v.height}x${v.width}` } });
        return
      }
      
      if (v.content_type.startsWith("video/")) {
        linkVideos.push(v.url);
      }
    });

    if (linkVideos.length === 0 && embeds.length === 0)
      return

    fetch(process.env.webhook!, {
      method: "POST",
      body: JSON.stringify({
        ...(linkVideos.length && { content: linkVideos.join("\n") }),
        ...(embeds.length && { embeds }),
        username: `from #${channelNames[d.channel_id]}`,
        avatar_url: `https://cdn.discordapp.com/avatars/${d.author.id}/${d.author.avatar}`,
      }),
      headers: { "Content-Type": "application/json" },
    });
  }
}