import { ChatOpenAI } from "@langchain/openai";
import { getOpenAIBaseURL } from "./openai-config.mjs";
import { patchMissingResponseAnnotations } from "../utils/response-parse.mjs";

const model = new ChatOpenAI({
  model: "gpt-5.5",
  useResponsesApi: true,
  reasoning: {
    effort: "xhigh",
  },
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 0,
  timeout: 30_000,
  zdrEnabled: true,
  configuration: {
    baseURL: getOpenAIBaseURL(),
  },
});

patchMissingResponseAnnotations(model);

export { model };
