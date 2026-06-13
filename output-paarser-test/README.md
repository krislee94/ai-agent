# LangChain 输出解析教学示例

这个目录演示的是 LangChain 里如何把大模型输出从“自然语言文本”变成“程序可以稳定消费的数据”。

很多时候我们不只是想让模型回答一段话，而是希望它返回固定结构，例如 JSON、对象字段、工具参数或者 XML。

1. 先让模型按提示词返回 JSON，再手动 `JSON.parse`。
2. 使用 `JsonOutputParser` 和 `StructuredOutputParser` 把格式说明、解析过程封装起来。
3. 使用 Zod schema 描述复杂结构，并做类型校验。
4. 使用 `withStructuredOutput` 让模型直接返回结构化对象。
5. 对比普通流式输出、流式 JSON 文本、流式结构化输出。
6. 查看 tool calls 的原始流式参数，再用 parser 解析工具调用。
7. 最后看一下 XML 输出解析。

## 项目结构

```text
output-paarser-test/
  package.json
  src/
    normal.mjs                         # 手动提示模型输出 JSON，再 JSON.parse
    json-output-parser.mjs             # JsonOutputParser 基础用法
    structured-output-parser.mjs       # StructuredOutputParser 字段描述版
    structured-output-parser2.mjs      # StructuredOutputParser + Zod 复杂结构
    tool-calls-args.mjs                # 非流式 tool calls 参数读取和兜底解析
    with-structured-output.mjs         # withStructuredOutput 结构化输出
    stream-normal.mjs                  # 普通文本流式输出
    stream-json-text-then-parse.mjs    # 流式接收 JSON 文本，结束后再解析
    stream-with-structured-output.mjs  # withStructuredOutput 的流式结构化输出
    stream-structured-partial.mjs      # 流式文本拼接后用 StructuredOutputParser 解析
    stream-tool-calls-raw.mjs          # 直接查看 tool_calls_chunk 原始参数流
    stream-tool-calls-parser.mjs       # JsonOutputToolsParser 解析流式 tool calls
    xml-output-parser.mjs              # XMLOutputParser 示例
```

## 准备环境

先安装依赖：

```powershell
cd G:\ai\ai-agent\output-paarser-test
pnpm install
```

`.env` 里需要配置：

```env
MODEL_NAME=你的聊天模型
OPENAI_API_KEY=你的 API Key
OPENAI_BASE_URL=OpenAI 兼容接口地址
```

因为 `package.json` 里设置的是 `"type": "commonjs"`，而示例文件使用 `.mjs`，所以可以直接用 Node 运行：

```powershell
node .\src\structured-output-parser.mjs
```

## 按 9 条 commit 顺序学习

下面的顺序来自最近 9 条提交，从旧到新：

```text
f8d6f23 feat: 总结教学
65457a4 feat(output-parser): 添加结构化输出解析器示例
8325938 feat: 添加结构化输出解析器测试文件
1810604 feat: 普通流式输出
8617b3a feat:用 withStructuredOutput 做一下流式的结构化输出：
eebd2d4 feat(output-parser): 添加流式结构化解析测试文件
2e09934 feat(stream-parser): 添加流式tool calls原始数据解析测试
7ca56e8 feat(stream-parser): 添加流式工具调用解析器功能
5d14db9 feat(xml-output-parser): 添加 XML 输出解析器测试文件
```

第一条提交是 `memory-test/README.md` 的教学总结，不是本目录的代码变化。它确定了这类 README 的写法：先说明问题，再列运行入口，然后解释核心代码和适用场景。本 README 延续这个顺序。

## 一、从普通 JSON 输出开始

入口文件：

```powershell
node .\src\normal.mjs
node .\src\json-output-parser.mjs
```

`normal.mjs` 是最朴素的做法：在 prompt 里要求模型返回 JSON，然后自己解析：

```js
const response = await model.invoke(question);
const jsonResult = JSON.parse(response.content);
```

这个方式很好理解，但有明显问题：

1. 模型可能返回 markdown 代码块。
2. 模型可能在 JSON 前后加解释文本。
3. 字段类型不一定稳定。
4. 一旦格式不标准，`JSON.parse` 就会直接报错。

`json-output-parser.mjs` 使用 `JsonOutputParser` 做了一层封装：

```js
const parser = new JsonOutputParser();

const question = `请介绍一下爱因斯坦的信息。

${parser.getFormatInstructions()}`;

const response = await model.invoke(question);
const result = await parser.parse(response.content);
```

这里最关键的是 `parser.getFormatInstructions()`。它会生成一段格式要求，放进 prompt 里告诉模型应该输出什么形式。然后 `parser.parse()` 再负责把模型文本解析成对象。

可以把 `JsonOutputParser` 理解成：

```text
提示词格式说明 + 返回文本解析
```

它仍然依赖模型听话，但比自己手写格式说明更统一。

## 二、StructuredOutputParser：给字段加描述

对应提交：

```text
65457a4 feat(output-parser): 添加结构化输出解析器示例
```

入口文件：

```powershell
node .\src\structured-output-parser.mjs
node .\src\structured-output-parser2.mjs
```

`structured-output-parser.mjs` 使用 `StructuredOutputParser.fromNamesAndDescriptions()` 定义字段：

```js
const parser = StructuredOutputParser.fromNamesAndDescriptions({
  name: "姓名",
  birth_year: "出生年份",
  nationality: "国籍",
  major_achievements: "主要成就，用逗号分隔的字符串",
  famous_theory: "著名理论",
});
```

这种写法比 `JsonOutputParser` 更明确：不仅要求 JSON，还说明了每个字段的含义。

学习时重点看控制台打印出来的 `question`，里面会包含 parser 自动生成的格式说明。你会发现 output parser 本质上并不是魔法，它仍然是在 prompt 中告诉模型格式，只是 LangChain 帮你生成了更规范的说明。

## 三、StructuredOutputParser + Zod：复杂对象和类型校验

入口文件：

```powershell
node .\src\structured-output-parser2.mjs
```

当输出结构变复杂时，字段描述就不够用了。`structured-output-parser2.mjs` 用 Zod 定义科学家信息：

```js
const scientistSchema = z.object({
  name: z.string().describe("科学家的全名"),
  birth_year: z.number().describe("出生年份"),
  fields: z.array(z.string()).describe("研究领域列表"),
  awards: z.array(
    z.object({
      name: z.string().describe("奖项名称"),
      year: z.number().describe("获奖年份"),
      reason: z.string().optional().describe("获奖原因"),
    }),
  ),
});
```

然后用 schema 创建 parser：

```js
const parser = StructuredOutputParser.fromZodSchema(scientistSchema);
```

Zod 的价值有两个：

1. 用代码描述对象结构，比在 prompt 里手写字段更清晰。
2. 解析后会校验类型，比如 `birth_year` 必须是数字，`awards` 必须是数组。

如果你要把模型输出交给后端服务、数据库、前端表格或业务逻辑，建议从这里开始使用 Zod。

## 四、tool calls：结构化输出的另一条路

同一个提交里还加入了：

```powershell
node .\src\tool-calls-args.mjs
```

这个文件不是 output parser，而是使用模型的工具调用能力：

```js
const modelWithTool = model.bindTools([
  {
    name: "extract_scientist_info",
    description: "Extract structured scientist information.",
    schema: scientistSchema,
  },
]);

const response = await modelWithTool.invoke(
  "请使用 extract_scientist_info 工具提取 Albert Einstein 的信息。",
);
```

如果模型成功调用工具，结构化数据会出现在：

```js
response.tool_calls?.[0]?.args;
```

这个例子里还做了一个兜底：如果模型没有返回 `tool_calls`，就退回到 `StructuredOutputParser` 再解析一次 JSON。

这一步要理解一个区别：

| 方式          | 核心思路                   | 适合场景                          |
| ------------- | -------------------------- | --------------------------------- |
| Output Parser | 让模型输出文本，再解析文本 | 简单结构、通用兼容、教学和脚本    |
| Tool Calls    | 让模型生成工具调用参数     | Agent、函数调用、需要明确动作边界 |

如果你只是要一段固定 JSON，output parser 就够了。如果后面要让模型选择工具、调用函数、执行动作，tool calls 更自然。

## 五、withStructuredOutput：更直接的结构化调用

对应提交：

```text
8325938 feat: 添加结构化输出解析器测试文件
```

入口文件：

```powershell
node .\src\with-structured-output.mjs
```

`withStructuredOutput` 是更高层的封装：

```js
const structuredModel = model.withStructuredOutput(lenientScientistSchema, {
  method: "jsonMode",
});

const result = await structuredModel.invoke(messages);
```

它的目标是让你不再手动写：

```js
const response = await model.invoke(prompt);
const result = await parser.parse(response.content);
```

而是直接得到结构化结果。

这个文件里还定义了 `lenientScientistSchema`：

```js
const lenientScientistSchema = z.preprocess((value) => {
  const item = Array.isArray(value) ? value[0] : value;
  // 把 birth_date、research_fields 等模型可能返回的字段归一化
  return {
    name: item.name,
    birth_year: normalizedBirthYear,
    nationality,
    fields: normalizeStringArray(fields),
  };
}, scientistSchema);
```

这很接近真实项目。模型有时会返回 `birth_date`，有时返回 `birth_year`；有时字段是字符串，有时是数组。`z.preprocess()` 可以先做清洗，再交给严格 schema 校验。

还有一个细节：代码里使用了 `method: "jsonMode"`，并且 system prompt 里显式写了 JSON。很多 OpenAI 兼容接口要求消息中出现 `json` 这个词，否则 JSON mode 可能报错。

## 六、普通流式输出：先理解 chunk

对应提交：

```text
1810604 feat: 普通流式输出
```

入口文件：

```powershell
node .\src\stream-normal.mjs
```

普通流式输出的核心是：

```js
const stream = await model.stream(prompt);

for await (const chunk of stream) {
  const content = chunk.content;
  fullContent += content;
  process.stdout.write(content);
}
```

流式输出不是一次性拿到完整回答，而是一小块一小块接收。适合聊天界面、长文本生成、实时反馈。

这一步先不做结构化，只观察两件事：

1. `chunk.content` 每次只是一小段文本。
2. 如果最终要解析完整 JSON，通常需要先把所有 chunk 拼起来。

## 七、流式结构化输出的两种做法

对应提交：

```text
8617b3a feat:用 withStructuredOutput 做一下流式的结构化输出：
```

入口文件：

```powershell
node .\src\stream-json-text-then-parse.mjs
node .\src\stream-with-structured-output.mjs
```

### 1. 流式接收 JSON 文本，结束后再解析

`stream-json-text-then-parse.mjs` 的做法是：

```js
const stream = await model.stream(messages);
let rawJsonText = "";

for await (const chunk of stream) {
  const text = getMessageText(chunk.content);
  rawJsonText += text;
  process.stdout.write(text);
}

const parsed = lenientSchema.parse(JSON.parse(extractJson(rawJsonText)));
```

这种方式最稳：流式阶段只负责展示和拼接文本，等完整 JSON 收完以后再解析。

缺点是：中间过程还不是可用对象。只有流结束后，才能得到最终结构化数据。

### 2. withStructuredOutput 的流式输出

`stream-with-structured-output.mjs` 使用：

```js
const stream = await structuredModel.stream(messages);

for await (const chunk of stream) {
  result = chunk;
  console.log(JSON.stringify(chunk, null, 2));
}
```

这里每个 chunk 已经是解析过的结构化片段或阶段性对象。适合你希望边生成边观察结构化字段变化的场景。

不过要注意：不同模型、不同兼容接口对结构化流式支持程度不一样。如果遇到不稳定，优先使用“流式 JSON 文本，结束后再解析”的方案。

## 八、流式文本 + StructuredOutputParser

对应提交：

```text
eebd2d4 feat(output-parser): 添加流式结构化解析测试文件
```

入口文件：

```powershell
node .\src\stream-structured-partial.mjs
```

这个文件使用 `StructuredOutputParser.fromZodSchema(schema)` 生成格式说明，再普通流式接收：

```js
const prompt = `详细介绍莫扎特的信息。\n\n${parser.getFormatInstructions()}`;
const stream = await model.stream(prompt);

let fullContent = "";
for await (const chunk of stream) {
  fullContent += chunk.content;
}

const result = await parser.parse(fullContent);
```

它和上一节第一种方法很像：先流式拼完整文本，再统一解析。区别是这里的格式说明和解析逻辑来自 `StructuredOutputParser`，而不是自己手写 JSON prompt 和 `JSON.parse`。

可以把它当作流式场景下最容易理解的 parser 方案。

## 九、流式 tool calls：先看原始参数流

对应提交：

```text
2e09934 feat(stream-parser): 添加流式tool calls原始数据解析测试
```

入口文件：

```powershell
node .\src\stream-tool-calls-raw.mjs
```

这个文件绑定了一个工具：

```js
const modelWithTool = model.bindTools([
  {
    name: "extract_scientist_info",
    description: "提取和结构化科学家的详细信息",
    schema: scientistSchema,
  },
]);
```

然后流式读取工具调用参数：

```js
for await (const chunk of stream) {
  if (chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) {
    process.stdout.write(chunk.tool_call_chunks[0].args || "");
  }
}
```

这一步很适合调试。你可以看到工具参数并不是一次性返回的，而是像普通文本一样被拆成很多小片段。

如果你以后要做“模型一边想，一边逐步生成工具参数”的 UI，这个原始流很重要。

## 十、JsonOutputToolsParser：解析流式工具调用

对应提交：

```text
7ca56e8 feat(stream-parser): 添加流式工具调用解析器功能
```

入口文件：

```powershell
node .\src\stream-tool-calls-parser.mjs
```

这次不直接读 `tool_call_chunks`，而是把模型接到 parser：

```js
const parser = new JsonOutputToolsParser();
const chain = modelWithTool.pipe(parser);

const stream = await chain.stream("详细介绍牛顿的生平和成就");
```

流里拿到的是 parser 处理后的工具调用结果：

```js
for await (const chunk of stream) {
  if (chunk.length > 0) {
    const toolCall = chunk[0];
    console.log(toolCall.args);
  }
}
```

这一步说明：tool calls 也可以走 parser 管道。原始 chunk 适合底层调试，`JsonOutputToolsParser` 适合业务代码消费。

## 十一、XML 输出解析

对应提交：

```text
5d14db9 feat(xml-output-parser): 添加 XML 输出解析器测试文件
```

入口文件：

```powershell
node .\src\xml-output-parser.mjs
```

核心代码：

```js
const parser = new XMLOutputParser();

const question = `请提取以下文本中的人物信息：阿尔伯特·爱因斯坦出生于 1879 年，是一位伟大的物理学家。

${parser.getFormatInstructions()}`;

const response = await model.invoke(question);
const result = await parser.parse(response.content);
```

XML parser 的思路和 JSON parser 类似：生成格式说明，要求模型按 XML 返回，再解析成对象。

现在多数业务会优先用 JSON，因为前后端和数据库生态更自然。但 XML 在某些旧系统、文档处理、标记文本任务里仍然有用。

## 推荐运行顺序

如果你是第一次学，建议按这个顺序跑：

```powershell
node .\src\normal.mjs
node .\src\json-output-parser.mjs
node .\src\structured-output-parser.mjs
node .\src\structured-output-parser2.mjs
node .\src\tool-calls-args.mjs
node .\src\with-structured-output.mjs
node .\src\stream-normal.mjs
node .\src\stream-json-text-then-parse.mjs
node .\src\stream-with-structured-output.mjs
node .\src\stream-structured-partial.mjs
node .\src\stream-tool-calls-raw.mjs
node .\src\stream-tool-calls-parser.mjs
node .\src\xml-output-parser.mjs
```

建议每跑一个文件都观察三件事：

1. prompt 里到底给了模型什么格式要求。
2. 模型原始返回是什么样子。
3. 最终程序拿到的是字符串、普通对象、Zod 校验对象，还是 tool call 参数。

## 几种方案对比

| 方案                         | 代表文件                            | 优点                            | 注意点                                      |
| ---------------------------- | ----------------------------------- | ------------------------------- | ------------------------------------------- |
| 手动 JSON.parse              | `normal.mjs`                        | 最简单，容易理解                | 模型多输出一点文字就可能解析失败            |
| JsonOutputParser             | `json-output-parser.mjs`            | 自动生成格式说明，自动解析 JSON | 只约束 JSON 形状，不强校验复杂类型          |
| StructuredOutputParser       | `structured-output-parser.mjs`      | 字段含义更清楚                  | 仍然依赖模型按格式输出                      |
| StructuredOutputParser + Zod | `structured-output-parser2.mjs`     | 适合复杂对象和类型校验          | schema 要认真设计                           |
| withStructuredOutput         | `with-structured-output.mjs`        | 调用后直接拿结构化对象          | 依赖模型和接口对 json mode/tool mode 的支持 |
| 流式文本后解析               | `stream-json-text-then-parse.mjs`   | 稳定，兼容性好                  | 流结束前不能得到最终对象                    |
| 流式结构化输出               | `stream-with-structured-output.mjs` | 可以观察结构化对象逐步生成      | 不同模型兼容性差异较大                      |
| Tool Calls                   | `tool-calls-args.mjs`               | 适合 Agent 和函数调用           | 要处理模型不调用工具的情况                  |
| 流式 Tool Calls Parser       | `stream-tool-calls-parser.mjs`      | 业务代码更容易消费工具参数      | 调试时仍建议先看 raw chunk                  |
| XML Parser                   | `xml-output-parser.mjs`             | 适合 XML/标签化输出             | 常规业务优先考虑 JSON                       |

## 真实项目里的建议

简单脚本或 demo 可以用 `JsonOutputParser`。

只要结构稍微复杂，就建议用 Zod schema。它能同时承担“告诉模型怎么输出”和“校验模型有没有输出对”的职责。

如果是 Agent 或函数调用场景，优先考虑 tool calls。它比让模型输出一段 JSON 文本更像真实的函数参数传递。

如果是流式页面，优先选择稳定方案：

```text
流式展示原始文本 -> 收完整内容 -> extractJson -> Zod 校验 -> 业务使用
```

当你确认当前模型和接口支持结构化流式输出，再使用 `withStructuredOutput().stream()` 或 `JsonOutputToolsParser` 做更高级的实时结构化展示。

## 常见问题

### 1. Output parser 是不是只是 prompt 工程？

一半是，一半不是。

它确实会把格式要求写进 prompt 里，所以模型仍然需要“听话”。但它还统一封装了解析、格式说明生成、schema 描述等逻辑。复杂场景下，parser 能减少大量重复代码。

### 2. 为什么有些文件写了 lenient schema？

因为模型输出经常会有小偏差。比如你希望字段叫 `birth_year`，模型可能返回 `birth_date`；你希望 `fields` 是数组，模型可能返回一个逗号分隔字符串。

`z.preprocess()` 可以先把这些偏差归一化，再交给严格 schema 校验。这比直接放宽类型更可控。

### 3. Output parser 和 tool calls 该选哪个？

如果只是“抽取一份结构化数据”，选 output parser 或 `withStructuredOutput`。

如果模型后面要“决定调用哪个工具、传什么参数、触发什么动作”，选 tool calls。

### 4. 流式结构化为什么更复杂？

因为 JSON 只有完整闭合后才是合法 JSON。流式过程中你拿到的常常是半个字段、半个数组、半个对象。

所以最稳的做法是先拼接完整文本，再解析。实时解析工具调用或结构化对象，需要 parser 和模型接口共同支持。

### 5. 如果解析失败怎么办？

可以按这个顺序排查：

1. 打印模型原始返回，看是不是 markdown、解释文本或字段不一致。
2. 确认 prompt 中包含 parser 的 `getFormatInstructions()`。
3. 对 JSON 文本先做 `extractJson()`，去掉代码块和前后说明。
4. 用 `z.preprocess()` 兼容常见字段偏差。
5. 对关键业务增加重试或兜底解析。
