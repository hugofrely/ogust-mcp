import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { OgustApi } from "./api.js";
import { createServer } from "./server.js";

const access = process.env.OGUST_ACCESS ?? "read";
if (access !== "read" && access !== "full") {
  console.error("OGUST_ACCESS doit valoir read ou full.");
  process.exit(1);
}

const api = new OgustApi(process.env.OGUST_PUBLIC_KEY, process.env.OGUST_PRIVATE_KEY);
serveStdio(() => createServer(api, access === "full"));
