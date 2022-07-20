import fetch from "node-fetch";

export default class Api {
  userAgent: string;
  token: string;

  constructor(userAgent: string, token: string) {
    this.userAgent = userAgent;
    this.token = token;
  }

  async fetch(req: Request, rawPayload: boolean = false, contentType: string = "application/json", version: number = 9) {
    if (typeof req.urlPath !== "string") {
      const feet = `https://discord.com/api/v${version}`;
      const body = Object.entries(req.urlPath).map(([key, value]) => `/${key}/${value}`).join("");
      const neck = req.endpoint ? `/${req.endpoint}` : "";
      const head = req.query ? "?" + Object.entries(req.query).map(([key, value]) => `${key}=${value}`).join("&") : "";
      req.urlPath = `${feet}${body}${neck}${head}`;
    }


    const response = await fetch(encodeURI(req.urlPath), {
      method: req.method,
      ...(req.payload && { body: rawPayload ? req.payload : JSON.stringify(req.payload) }),
      headers: {
        "Authorization": this.token,
        "User-Agent": this.userAgent,
        "Content-Type": contentType,
      }
    });

    try {
      return await response.json();
    } catch (err) {
      return null
    }
  }
}

interface Request {
  method: "POST" | "PUT" | "DELETE" | "PATCH" | "GET";
  urlPath: { [key: string]: string } | string;
  endpoint?: string;
  query?: { [key: string]: any };
  payload?: any;
}
