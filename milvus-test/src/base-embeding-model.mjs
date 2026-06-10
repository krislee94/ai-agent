import { OpenAIEmbeddings } from "@langchain/openai";
import {
  LocalHashEmbeddings,
  ResilientEmbeddings,
} from "./local-hash-embeddings.mjs";
import { getOpenAIBaseURL } from "./openai-config.mjs";

const VECTOR_DIM = 1024;

const remoteEmbeddingModel = new OpenAIEmbeddings({
  model: process.env.EMBEDDINGS_MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 0,
  timeout: 15_000,
  configuration: {
    baseURL: getOpenAIBaseURL(),
  },

  dimensions: VECTOR_DIM,
});

const embeddingModel = new ResilientEmbeddings(
  remoteEmbeddingModel,
  new LocalHashEmbeddings({ dimensions: VECTOR_DIM }),
);

export { embeddingModel, remoteEmbeddingModel };
