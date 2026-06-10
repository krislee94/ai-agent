import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: resolve(__dirname, "../../tool-demo/.env"),
  quiet: true,
});
dotenv.config({
  path: resolve(__dirname, "../.env"),
  override: true,
  quiet: true,
});

function getOpenAIBaseURL() {
  const rawBaseURL = process.env.OPENAI_BASE_URL ?? "https://oneapi.inocube.net/";
  const url = new URL(rawBaseURL.endsWith("/") ? rawBaseURL : `${rawBaseURL}/`);

  if (!url.pathname.replace(/\/+$/, "").endsWith("/v1")) {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/v1`;
  }

  return url.toString();
}

export { getOpenAIBaseURL };
