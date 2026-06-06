// langchain mcp test

import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import chalk from "chalk";

import { model } from "./hello-langchain.mjs";

const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    "my-mcp-server": {
      command: "node",
      args: ["G:\\ai\\ai-agent\\tool-demo\\src\\my-mcp-server.mjs"],
    },
  },
});

const tools = await mcpClient.getTools();

const modelWithTools = model.bindTools(tools);

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

async function runAgentWithTools(query, maxIterations = 30) {
  const messages = [new HumanMessage(query)];

  for (let i = 0; i < maxIterations; i++) {
    console.log(chalk.bgGreen(`⏳ 正在等待 AI 思考...`));
    const response = await modelWithTools.invoke(messages);
    messages.push(response); // 检查是否有工具调用

    if (!response.tool_calls || response.tool_calls.length === 0) {
      const finalContent = formatContent(response.content);
      console.log(`\n✨ AI 最终回复:\n${finalContent}\n`);
      return finalContent;
    }

    console.log(
      chalk.bgBlue(`🔍 检测到 ${response.tool_calls.length} 个工具调用`),
    );
    console.log(
      chalk.bgBlue(
        `🔍 工具调用: ${response.tool_calls.map((t) => t.name).join(", ")}`,
      ),
    ); // 执行工具调用
    for (const toolCall of response.tool_calls) {
      const foundTool = tools.find((t) => t.name === toolCall.name);
      if (foundTool) {
        const toolResult = await foundTool.invoke(toolCall.args);
        messages.push(
          new ToolMessage({
            content: formatContent(toolResult),
            tool_call_id: toolCall.id,
          }),
        );
      }
    }
  }

  return formatContent(messages[messages.length - 1].content);
}

try {
  await runAgentWithTools("查一下用户 002 的信息");
} finally {
  await mcpClient.close();
}
