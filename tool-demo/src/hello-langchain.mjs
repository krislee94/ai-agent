import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchMissingResponseAnnotations } from "../utils/response-parse.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: resolve(__dirname, "../.env") });

const model = new ChatOpenAI({
  model: "gpt-5.5",
  useResponsesApi: true,
  reasoning: {
    effort: "xhigh",
  },
  apiKey: process.env.OPENAI_API_KEY,
  zdrEnabled: true,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL ?? "https://oneapi.inocube.net/",
  },
});

patchMissingResponseAnnotations(model);

// const response = await model.invoke('Introduce LangChain in one short sentence.')

// console.log(response)

export { model };
