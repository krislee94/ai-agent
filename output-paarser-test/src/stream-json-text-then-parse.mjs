import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const schema = z.object({
  name: z.string().describe("姓名"),
  birth_year: z.number().describe("出生年份"),
  death_year: z.number().optional().describe("去世年份"),
  nationality: z.string().describe("国籍"),
  occupation: z.string().describe("职业"),
  famous_works: z.array(z.string()).describe("著名作品列表"),
  biography: z.string().describe("简短传记"),
});

const lenientSchema = z.preprocess((value) => {
  const item = Array.isArray(value) ? value[0] : value;
  if (!item || typeof item !== "object") {
    return item;
  }

  return {
    name: item.name,
    birth_year: normalizeYear(item.birth_year ?? item.birth_date),
    death_year: normalizeYear(item.death_year ?? item.death_date),
    nationality: Array.isArray(item.nationality)
      ? item.nationality.join(" / ")
      : item.nationality,
    occupation: normalizeStringList(item.occupation ?? item.profession),
    famous_works: normalizeStringArray(
      item.famous_works ?? item.works ?? item.major_works,
    ),
    biography: item.biography ?? item.bio ?? item.description,
  };
}, schema);

const userQuestion = "详细介绍莫扎特的信息。";
const messages = [
  new SystemMessage(`你是结构化信息抽取器。请根据用户问题抽取人物信息。
必须只返回一个 JSON 对象，不要返回 markdown、代码块或解释文本。
JSON 字段必须是：
{
  "name": "string",
  "birth_year": 1756,
  "death_year": 1791,
  "nationality": "string",
  "occupation": "string",
  "famous_works": ["string"],
  "biography": "string"
}`),
  new HumanMessage(userQuestion),
];

console.log("流式 JSON 文本演示（结束后再做 Zod 校验）\n");

try {
  const stream = await model.stream(messages);
  let rawJsonText = "";
  let chunkCount = 0;

  console.log("接收模型原始流式文本:\n");

  for await (const chunk of stream) {
    const text = getMessageText(chunk.content);
    if (!text) {
      continue;
    }

    chunkCount++;
    rawJsonText += text;
    process.stdout.write(text);
  }

  console.log(`\n\n共接收 ${chunkCount} 个文本 chunk`);

  const parsed = lenientSchema.parse(JSON.parse(extractJson(rawJsonText)));

  console.log("\n最终结构化结果:\n");
  console.log(JSON.stringify(parsed, null, 2));
} catch (error) {
  console.error("\n错误:", error.message);
}

function normalizeYear(value) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const match = value.match(/\d{3,4}/);
    return match ? Number.parseInt(match[0], 10) : undefined;
  }

  return value;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === "string") {
    return value
      .split(/[、,，;；/]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return value;
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map(String).join(", ");
  }

  return value;
}

function extractJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const firstObject = trimmed.indexOf("{");
  const firstArray = trimmed.indexOf("[");
  const starts = [firstObject, firstArray].filter((index) => index >= 0);
  const start = starts.length > 0 ? Math.min(...starts) : -1;

  if (start < 0) {
    throw new Error(`没有找到 JSON 内容: ${text}`);
  }

  const open = trimmed[start];
  const close = open === "{" ? "}" : "]";
  const end = trimmed.lastIndexOf(close);

  if (end < start) {
    throw new Error(`JSON 内容不完整: ${text}`);
  }

  return trimmed.slice(start, end + 1);
}

function getMessageText(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        return part?.text ?? "";
      })
      .join("");
  }

  return "";
}
