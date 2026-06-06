import { model } from "./hello-langchain.mjs";
import { tool } from "@langchain/core/tools";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const resolveFilePath = (filePath) => {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  return path.resolve(projectRoot, filePath);
};

const readFileTool = tool(
  async ({ filePath }) => {
    const resolvedFilePath = resolveFilePath(filePath);
    const content = await fs.readFile(resolvedFilePath, "utf-8");
    console.log(
      `  [工具调用] read_file("${filePath}") - 成功读取 ${content.length} 字节`,
    );
    return `文件内容:\n${content}`;
  },
  {
    name: "read_file",
    description:
      "用此工具来读取文件内容。当用户要求读取文件、查看代码、分析文件内容时，调用此工具。输入文件路径（可以是相对路径或绝对路径）。",
    schema: z.object({
      filePath: z.string().describe("要读取的文件路径"),
    }),
  },
);

const tools = [readFileTool];

const modelWithTools = model.bindTools(tools);

const messages = [
  // SystemMessage：设置 AI 是谁，可以干什么，有什么能力，以及一些回答、行为的规范等
  new SystemMessage(`你是一个代码助手，可以使用工具读取文件并解释代码。
    
    工作流程：
    1. 用户要求读取文件时，立即调用 read_file 工具
    2. 等待工具返回文件内容
    3. 基于文件内容进行分析和解释
    
    可用工具：
    - read_file: 读取文件内容（使用此工具来获取文件内容）
    `),

  // HumanMessage：用户输入的信息
  new HumanMessage("请读取 src/tool-file-read.mjs 文件内容并解释代码"),
];

let response = await modelWithTools.invoke(messages);

// 把ai返回的信息 也放到messages 数组里，也就是对话记录
messages.push(response);

// 执行所有工具调用
while (response.tool_calls && response.tool_calls.length > 0) {
  console.log(`检测到 ${response.tool_calls.length} 个工具调用`);

  // 执行所有工具调用
  const toolResults = await Promise.all(
    response.tool_calls.map(async (toolCall) => {
      // 查找工具
      const tool = tools.find((t) => t.name === toolCall.name);

      if (!tool) {
        return `错误：找不到工具 ${toolCall.name}`;
      }

      console.log(
        ` [执行工具] ${toolCall.name} - 参数: ${JSON.stringify(toolCall.args)}`,
      );

      try {
        // 执行toool调用
        const result = await tool.invoke(toolCall.args);
        return result;
      } catch (error) {
        console.error(` [工具执行错误] ${toolCall.name}: ${error.message}`);
        return `工具执行错误：${error.message}`;
      }
    }),
  );

  // 添加工具调用的结果到对话记录
  response.tool_calls.forEach((toolCall, index) => {
    const toolResult = toolResults[index];
    // 需要有ID进行关联
    messages.push(new ToolMessage(toolResult, toolCall.id));
  });

  // 再次调用模型吗，传入工具结果
  response = await modelWithTools.invoke(messages);
}

console.log("\n[最终回复]");
console.log(response.content);
