import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";

const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// 定义结构化输出的 schema
const scientistSchema = z.object({
  name: z.string().describe("Full name of the scientist"),
  birth_year: z.number().describe("Birth year"),
  nationality: z.string().describe("Nationality"),
  fields: z.array(z.string()).describe("Research fields"),
});

const tool = {
  name: "extract_scientist_info",
  description: "Extract structured scientist information.",
  schema: scientistSchema,
};

const modelWithTool = model.bindTools([
  tool,
]);

// 调用模型
const response = await modelWithTool.invoke(
  "请使用 extract_scientist_info 工具提取 Albert Einstein 的信息。如果不能调用工具，请不要编造工具调用。",
);

console.log("response.tool_calls:", response.tool_calls ?? []);

// 获取结构化结果
const result = await getStructuredResult(response);

console.log("结构化结果:", JSON.stringify(result, null, 2));
console.log(`\n姓名: ${result.name}`);
console.log(`出生年份: ${result.birth_year}`);
console.log(`国籍: ${result.nationality}`);
console.log(`研究领域: ${result.fields.join(", ")}`);

async function getStructuredResult(response) {
  const toolCall = response.tool_calls?.[0];

  if (toolCall?.args) {
    return scientistSchema.parse(toolCall.args);
  }

  console.warn(
    "模型没有返回 tool_calls，改用 StructuredOutputParser 兜底解析 JSON。",
  );

  const parser = StructuredOutputParser.fromZodSchema(scientistSchema);
  const fallbackResponse = await model.invoke(`请提取 Albert Einstein 的结构化信息。

${parser.getFormatInstructions()}`);

  return parser.parse(getMessageText(fallbackResponse.content));
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
      .filter(Boolean)
      .join("\n");
  }

  return String(content ?? "");
}
