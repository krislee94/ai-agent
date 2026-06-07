import { model } from "./hello-langchain.mjs";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import chalk from "chalk";
import { HumanMessage, ToolMessage } from "@langchain/core/messages";

const allowedPaths = (process.env.ALLOWED_PATHS ?? process.cwd())
  .split(",")
  .map((path) => path.trim())
  .filter(Boolean);

const amapMapsApiKey = process.env.AMAP_MAPS_API_KEY;
if (!amapMapsApiKey) {
  throw new Error("AMAP_MAPS_API_KEY is required in tool-demo/.env");
}

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const AMAP_TOOL_MIN_INTERVAL_MS = parsePositiveInteger(
  process.env.AMAP_TOOL_MIN_INTERVAL_MS,
  1200,
);
const AMAP_TOOL_MAX_RETRIES = parsePositiveInteger(
  process.env.AMAP_TOOL_MAX_RETRIES,
  3,
);
const QPS_RETRY_BASE_DELAY_MS = parsePositiveInteger(
  process.env.QPS_RETRY_BASE_DELAY_MS,
  1500,
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isAmapTool = (toolName) => toolName.startsWith("maps_");
const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);
const isQpsLimitError = (error) =>
  getErrorMessage(error).includes("CUQPS_HAS_EXCEEDED_THE_LIMIT");

let nextAmapToolCallAt = 0;

async function waitForAmapRateLimit(toolName) {
  if (!isAmapTool(toolName)) {
    return;
  }

  const delay = nextAmapToolCallAt - Date.now();
  if (delay > 0) {
    await sleep(delay);
  }

  nextAmapToolCallAt = Date.now() + AMAP_TOOL_MIN_INTERVAL_MS;
}

function formatContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object" && typeof item.text === "string") {
          return item.text;
        }

        return JSON.stringify(item, null, 2);
      })
      .join("\n");
  }

  if (content && typeof content === "object") {
    if (typeof content.text === "string") {
      return content.text;
    }

    return JSON.stringify(content, null, 2);
  }

  return String(content ?? "");
}

async function invokeToolWithRetry(tool, args) {
  const maxRetries = isAmapTool(tool.name) ? AMAP_TOOL_MAX_RETRIES : 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await waitForAmapRateLimit(tool.name);

    try {
      return await tool.invoke(args);
    } catch (error) {
      const shouldRetry = isQpsLimitError(error) && attempt < maxRetries;
      if (!shouldRetry) {
        throw error;
      }

      const delay = QPS_RETRY_BASE_DELAY_MS * 2 ** attempt;
      console.warn(
        chalk.yellow(
          `[tool retry] ${tool.name} hit AMap QPS limit, retrying in ${delay}ms (${attempt + 1}/${maxRetries})`,
        ),
      );
      await sleep(delay);
    }
  }
}

const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    // 本地stdio
    "my-mcp-server": {
      command: "node",
      args: ["G:\\ai\\ai-agent\\tool-demo\\src\\my-mcp-server.mjs"],
    },
    // 通过http方式
    "amap-maps-streamableHTTP": {
      url: "https://mcp.amap.com/mcp?key=" + encodeURIComponent(amapMapsApiKey),
    },
    filesystem: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", ...allowedPaths],
    },
    "chrome-devtools": {
      command: "npx",
      args: ["-y", "chrome-devtools-mcp@latest"],
    },
  },
});

const tools = await mcpClient.getTools();

for (const tool of tools) {
  const rawInvoke = tool.invoke.bind(tool);
  tool.invoke = async (args) => {
    try {
      const result = await invokeToolWithRetry(
        {
          name: tool.name,
          invoke: rawInvoke,
        },
        args,
      );
      return formatContent(result);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.error(chalk.red(`[tool error] ${tool.name}: ${errorMessage}`));
      return `Tool '${tool.name}' failed: ${errorMessage}`;
    }
  };
}

const modelWithTools = model.bindTools(tools);

async function runAgentWithTools(query, maxIterations = 30) {
  const messages = [new HumanMessage(query)];

  for (let i = 0; i < maxIterations; i++) {
    console.log(chalk.bgGreen(`⏳ 正在等待 AI 思考...`));
    const response = await modelWithTools.invoke(messages);
    messages.push(response);

    // 检查是否有工具调用
    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log(`\n✨ AI 最终回复:\n${JSON.stringify(response.content)}\n`);
      return response.content;
    }

    console.log(
      chalk.bgBlue(`🔍 检测到 ${response.tool_calls.length} 个工具调用`),
    );
    console.log(
      chalk.bgBlue(
        `🔍 工具调用: ${response.tool_calls.map((t) => t.name).join(", ")}`,
      ),
    );
    // 执行工具调用
    for (const toolCall of response.tool_calls) {
      const foundTool = tools.find((t) => t.name === toolCall.name);
      if (foundTool) {
        const toolResult = await foundTool.invoke(toolCall.args);

        // 确保 content 是字符串类型
        let contentStr;
        if (typeof toolResult === "string") {
          contentStr = toolResult;
        } else if (toolResult && toolResult.text) {
          // 如果返回对象有 text 字段，优先使用
          contentStr = toolResult.text;
        }

        messages.push(
          new ToolMessage({
            content: contentStr,
            tool_call_id: toolCall.id,
          }),
        );
      }
    }
  }

  return messages[messages.length - 1].content;
}

try {
  await runAgentWithTools(
    "南京南站附近的酒店，最近的 3 个酒店，拿到酒店图片，打开浏览器，展示每个酒店的图片，每个 tab 一个 url 展示，并且在把那个页面标题改为酒店名",
  );
} finally {
  await mcpClient.close();
}
