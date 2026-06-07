import { OpenAIEmbeddings } from "@langchain/openai";
import { LocalHashEmbeddings, ResilientEmbeddings } from "./local-hash-embeddings.mjs";
import { getOpenAIBaseURL } from "./openai-config.mjs";

const remoteEmbeddingModel = new OpenAIEmbeddings({
  model: process.env.EMBEDDINGS_MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 0,
  timeout: 15_000,
  configuration: {
    baseURL: getOpenAIBaseURL(),
  },
});

const embeddingModel = new ResilientEmbeddings(
  remoteEmbeddingModel,
  new LocalHashEmbeddings(),
);

export { embeddingModel };
