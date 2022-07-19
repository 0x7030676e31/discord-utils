import fetch from "node-fetch";

const vid_reg = /https:\/\/(cdn|media).discordapp.com\/attachments\/\d+\/\d+\/[\s\S]+?.(mp4|mov|webm)/g
const channels_reg = /\s*,\s*/g
const channelNames: { [key: string]: string } = {}

let channels: string[] = [];
export default {
  env: [ "meme_target", "meme_webhook" ],
  events: [ "MESSAGE_CREATE" ],
  async ready(d: any) {
    channels = process.env.meme_target!.split(channels_reg) as any;
    d.guilds.forEach((g: any) => g.channels.forEach((c: any) => channels.includes(c.id) && (channelNames[c.id] = c.name)));

    console.log(`MemeScraper: Loaded all ${channels.length} channels`);
  },
  async execute(d: any, _: string) {
    if (!channels.includes(d.channel_id) || d.author.bot)
      return

    const linkVideos: string[] = d.content ? d.content.match(vid_reg) || [] : [];
    const attachments: any[] = d.attachments ? d.attachments : [];

    if (linkVideos.length === 0 && attachments.length === 0)
      return

    const embeds: any[] = [];
    attachments.forEach(v => {
      if (!v.content_type)
        return

      if (v.content_type.startsWith("image/")) {
        embeds.push({ image: { url: v.url }, footer: { text: `${v.filename}; ${v.height}x${v.width}` } });
        return
      }
      
      if (v.content_type.startsWith("video/")) {
        linkVideos.push(v.url);
      }
    });

    if (linkVideos.length === 0 && embeds.length === 0)
      return

    fetch(process.env.meme_webhook!, {
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
