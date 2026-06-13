import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

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
    name: z.string().describe("科学家的全名"),
    birth_year: z.number().describe("出生年份"),
    nationality: z.string().describe("国籍"),
    fields: z.array(z.string()).describe("研究领域列表"),
});

const lenientScientistSchema = z.preprocess((value) => {
    const item = Array.isArray(value) ? value[0] : value;
    if (!item || typeof item !== "object") {
        return item;
    }

    const raw = item;
    const birthYear =
        raw.birth_year ??
        (typeof raw.birth_date === "string"
            ? Number.parseInt(raw.birth_date.slice(0, 4), 10)
            : undefined);
    const fields = raw.fields ?? raw.research_fields ?? raw.contributions ?? raw.major_achievements;
    const nationality = Array.isArray(raw.nationality)
        ? raw.nationality.join(" / ")
        : raw.nationality;

    return {
        name: raw.name,
        birth_year: typeof birthYear === "string"
            ? Number.parseInt(birthYear, 10)
            : birthYear,
        nationality,
        fields: normalizeStringArray(fields),
    };
}, scientistSchema);

// 使用 withStructuredOutput 方法。
// DashScope/OpenAI 的 JSON mode 要求消息中显式出现 "json" 这个词。
const structuredModel = model.withStructuredOutput(lenientScientistSchema, {
    method: "jsonMode",
});

// 调用模型
const userQuestion = "介绍一下爱因斯坦";

try {
    const result = await structuredModel.invoke([
        new SystemMessage(`你是结构化信息抽取器。请根据用户问题抽取科学家信息。
内部输出协议：必须返回 JSON，不要返回 markdown 或解释文本。
JSON 字段为 name、birth_year、nationality、fields。`),
        new HumanMessage(userQuestion),
    ]);

    console.log("结构化结果:", JSON.stringify(result, null, 2));
    console.log(`\n姓名: ${result.name}`);
    console.log(`出生年份: ${result.birth_year}`);
    console.log(`国籍: ${result.nationality}`);
    console.log(`研究领域: ${result.fields.join(', ')}`);
} catch (error) {
    console.warn("withStructuredOutput 解析失败，改用宽松 JSON 解析:", error.message);
    const result = await fallbackExtract(userQuestion);

    console.log("结构化结果:", JSON.stringify(result, null, 2));
    console.log(`\n姓名: ${result.name}`);
    console.log(`出生年份: ${result.birth_year}`);
    console.log(`国籍: ${result.nationality}`);
    console.log(`研究领域: ${result.fields.join(', ')}`);
}

async function fallbackExtract(question) {
    const response = await model.invoke([
        new SystemMessage(`你是结构化信息抽取器。请根据用户问题抽取科学家信息。
必须返回 JSON。字段尽量使用 name、birth_year、nationality、fields。`),
        new HumanMessage(question),
    ]);

    return parseLenientScientist(getMessageText(response.content));
}

function parseLenientScientist(text) {
    const jsonText = extractJson(text);
    const parsed = JSON.parse(jsonText);
    return lenientScientistSchema.parse(parsed);
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
            .filter(Boolean)
            .join("\n");
    }

    return String(content ?? "");
}
