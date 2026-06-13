# Prompt Template：组件化管理 Prompt

这个目录演示的是 LangChain 里 Prompt Template 相关 API 的使用方式。

如果只是写一个很短的 prompt，直接用字符串也可以。但真实项目里的 prompt 往往会越来越长，里面会混合很多内容：

1. 角色设定：你是谁、用什么口吻回答。
2. 业务背景：公司、团队、用户、上下文。
3. 任务说明：这次要完成什么。
4. 输入数据：Git、Jira、对话历史、检索结果等。
5. 输出格式：Markdown、JSON、表格、邮件、周报等。
6. 示例样本：希望模型模仿的 few-shot 示例。

如果这些内容都写在一个大字符串里，后面会很难维护。Prompt Template 的价值，就是把 prompt 拆成可复用、可组合、可动态填充的组件。

这个目录里的示例都围绕一个场景展开：根据工程团队的 Git / Jira / 运维信息，生成技术周报、OKR 回顾或周报片段。

## 项目结构

```text
prompt-template-test/
  package.json
  src/
    prompt-template1.mjs                    # PromptTemplate 基础用法
    pipeline-prompt-template.mjs            # PipelinePromptTemplate：拆分并组合 prompt
    pipeline-prompt-template2.mjs           # 复用 Pipeline 中的模块，生成 OKR 回顾邮件
    partial.mjs                             # partial：预填固定变量
    chat-prompt-template.mjs                # ChatPromptTemplate 基础用法
    chat-prompt-template2.mjs               # System/Human MessagePromptTemplate 写法
    pipeline-prompt-template3.mjs           # PipelinePromptTemplate + ChatPromptTemplate
    messages-placeholder.mjs                # MessagesPlaceholder 插入历史消息
    fewshot-prompt-template.mjs             # FewShotPromptTemplate 固定示例
    example-selector1.mjs                   # LengthBasedExampleSelector 按长度选示例
    weekly-report-examples-writer-milvus.mjs # 写入周报示例到 Milvus
    example-selector2.mjs                   # SemanticSimilarityExampleSelector 从 Milvus 选示例
    fewshot-chat-prompt-template.mjs        # FewShotChatMessagePromptTemplate 聊天版 few-shot
```

## 准备环境

安装依赖：

```powershell
cd G:\ai\ai-agent\prompt-template-test
pnpm install
```

`.env` 里至少需要这些配置：

```env
MODEL_NAME=你的聊天模型
OPENAI_API_KEY=你的 API Key
OPENAI_BASE_URL=OpenAI 兼容接口地址
```

如果要运行 Milvus 语义示例选择器，还需要：

```env
EMBEDDINGS_MODEL_NAME=你的 embedding 模型
MILVUS_ADDRESS=localhost:19530
MILVUS_COLLECTION_NAME=weekly_report_examples
```

普通 PromptTemplate、PipelinePromptTemplate、ChatPromptTemplate、FewShotPromptTemplate 的大部分示例只需要聊天模型。`example-selector2.mjs` 和 `weekly-report-examples-writer-milvus.mjs` 需要 embedding 模型和 Milvus。

## 推荐学习顺序

建议按这个顺序跑：

```powershell
node .\src\prompt-template1.mjs
node .\src\pipeline-prompt-template.mjs
node .\src\pipeline-prompt-template2.mjs
node .\src\partial.mjs
node .\src\chat-prompt-template.mjs
node .\src\chat-prompt-template2.mjs
node .\src\pipeline-prompt-template3.mjs
node .\src\messages-placeholder.mjs
node .\src\fewshot-prompt-template.mjs
node .\src\example-selector1.mjs
node .\src\weekly-report-examples-writer-milvus.mjs
node .\src\example-selector2.mjs
node .\src\fewshot-chat-prompt-template.mjs
```

学习时每个文件重点观察三件事：

1. 哪些内容被做成了模板变量。
2. 最终发送给模型的是字符串，还是 messages 数组。
3. 示例、历史、固定变量是怎样被插入 prompt 的。

## 一、PromptTemplate：最基础的字符串模板

入口文件：

```powershell
node .\src\prompt-template1.mjs
```

`PromptTemplate` 是最基础的提示词模板。它的作用是：先定义一个带占位符的字符串，运行时再填入变量。

核心代码：

```js
const naiveTemplate = PromptTemplate.fromTemplate(`
你是一名严谨但不失人情味的工程团队负责人，需要根据本周数据写一份周报。

公司名称：{company_name}
部门名称：{team_name}
直接汇报对象：{manager_name}
本周时间范围：{week_range}

本周团队核心目标：
{team_goal}

本周开发数据（Git 提交 / Jira 任务）：
{dev_activities}

请根据以上信息生成一份【Markdown 周报】。
`);

const prompt = await naiveTemplate.format({
  company_name: "星航科技",
  team_name: "数据智能平台组",
  manager_name: "刘总",
  week_range: "2025-03-10 ~ 2025-03-16",
  team_goal: "完成用户画像服务的灰度上线，并验证核心指标是否达标。",
  dev_activities: "...",
});
```

这里 `{company_name}`、`{team_name}`、`{dev_activities}` 都是模板变量。调用 `format()` 后，LangChain 会把变量填进去，生成最终的字符串 prompt。

这个例子还演示了同一个模板可以填两套不同数据：

```js
const prompt = await naiveTemplate.format({...});
const prompt2 = await naiveTemplate.format({...});
```

所以 `PromptTemplate` 的第一层价值是复用。模板不变，数据变化。

最后代码把格式化后的 prompt 传给模型：

```js
const stream = await model.stream(prompt);

for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
```

这说明 `PromptTemplate` 最终产出的是普通字符串。它适合简单任务，比如“把一段数据整理成一份周报”。

## 二、PipelinePromptTemplate：把一个大 prompt 拆成模块

入口文件：

```powershell
node .\src\pipeline-prompt-template.mjs
```

当 prompt 变长后，一个大模板会不好维护。`pipeline-prompt-template.mjs` 把周报 prompt 拆成 4 个模块：

1. 人设模块：负责角色和写作风格。
2. 背景模块：负责公司、团队、时间范围和目标。
3. 任务模块：负责说明要从原始数据里提炼什么。
4. 格式模块：负责说明最终输出格式。

代码里的人设模块：

```js
export const personaPrompt = PromptTemplate.fromTemplate(
  `你是一名资深工程团队负责人，写作风格：{tone}。
你擅长把枯燥的技术细节写得既专业又有温度。\n`,
);
```

背景模块：

```js
export const contextPrompt = PromptTemplate.fromTemplate(
  `公司：{company_name}
部门：{team_name}
直接汇报对象：{manager_name}
本周时间范围：{week_range}
本周部门核心目标：{team_goal}\n`,
);
```

最后再定义一个总模板，把上面的模块拼起来：

```js
const finalWeeklyPrompt = PromptTemplate.fromTemplate(
  `{persona_block}
{context_block}
{task_block}
{format_block}

现在请生成本周的最终周报：`,
);
```

真正负责组合的是 `PipelinePromptTemplate`：

```js
export const pipelinePrompt = new PipelinePromptTemplate({
  pipelinePrompts: [
    { name: "persona_block", prompt: personaPrompt },
    { name: "context_block", prompt: contextPrompt },
    { name: "task_block", prompt: taskPrompt },
    { name: "format_block", prompt: formatPrompt },
  ],
  finalPrompt: finalWeeklyPrompt,
});
```

这里要注意两个名字：

1. `pipelinePrompts` 里的 `name`，会变成最终模板里的变量名。
2. `finalPrompt` 里的 `{persona_block}`、`{context_block}`，就是接收模块渲染结果的位置。

可以把它理解成：

```text
personaPrompt.format(...) -> persona_block
contextPrompt.format(...) -> context_block
taskPrompt.format(...)    -> task_block
formatPrompt.format(...)  -> format_block

finalPrompt.format({
  persona_block,
  context_block,
  task_block,
  format_block
})
```

这样拆分之后，每块 prompt 都能独立维护、独立复用。

## 三、复用 Pipeline 模块：同样的人设，不同的任务

入口文件：

```powershell
node .\src\pipeline-prompt-template2.mjs
```

`pipeline-prompt-template2.mjs` 演示了 Pipeline 的复用价值。它没有重新写人设和背景，而是从上一个文件里导入：

```js
import {
  personaPrompt,
  contextPrompt,
} from "./pipeline-prompt-template.mjs";
```

然后本文件只定义自己的任务模块和格式模块，用来生成“季度 OKR 回顾邮件”：

```js
const okrReviewTaskPrompt = PromptTemplate.fromTemplate(`
以下是本季度与你所在团队相关的关键事实与数据（OKR 进展、重要事件等）：
{okr_facts}

请你基于这些信息，整理一份发给 {manager_name} 的【季度 OKR 回顾邮件】。
`);
```

组合时仍然使用同样的结构：

```js
const okrReviewPipeline = new PipelinePromptTemplate({
  pipelinePrompts: [
    { name: "persona_block", prompt: personaPrompt },
    { name: "context_block", prompt: contextPrompt },
    { name: "task_block", prompt: okrReviewTaskPrompt },
    { name: "format_block", prompt: okrReviewFormatPrompt },
  ],
  finalPrompt: PromptTemplate.fromTemplate(`...`),
});
```

这个例子说明：Prompt 模块化不是为了炫技，而是为了复用稳定部分。比如一个团队的语气、人设、业务背景可能长期不变，但任务可能从“周报”变成“OKR 回顾”“事故复盘”“晋升材料”“项目总结”。

## 四、partial：预填固定变量

入口文件：

```powershell
node .\src\partial.mjs
```

有些变量每次都一样，比如公司名、价值观、默认语气。如果每次调用都填一遍，会重复又容易写错。

`partial.mjs` 使用 `partial()` 先预填一部分变量：

```js
const pipelineWithPartial = await pipelinePrompt.partial({
  company_name: "星航科技",
  company_values: "「极致、开放、靠谱」的价值观",
  tone: "偏正式但不僵硬",
});
```

`pipelineWithPartial` 是一个新的模板。后面调用它时，只需要填剩下的变量：

```js
const partialFormatted = await pipelineWithPartial.format({
  team_name: "AI 平台组",
  manager_name: "刘东",
  week_range: "2025-02-10 ~ 2025-02-16",
  team_goal: "上线周报 Agent 到内部试用环境，并收集反馈。",
  dev_activities: "...",
});
```

它适合这些场景：

1. 公司、部门、产品名固定。
2. 输出格式固定。
3. 系统角色固定。
4. 多个业务调用共享同一套 prompt，只是输入数据不同。

可以把 `partial()` 理解成“生成一个预配置版本的 prompt 模板”。

## 五、ChatPromptTemplate：用 messages 数组管理 prompt

入口文件：

```powershell
node .\src\chat-prompt-template.mjs
```

前面的 `PromptTemplate` 最终生成字符串。但 Chat 模型更常见的输入形式是 messages 数组：

```js
[
  new SystemMessage("..."),
  new HumanMessage("..."),
  new AIMessage("...")
]
```

`ChatPromptTemplate` 就是用模板的方式生成 messages。

基础写法：

```js
const chatPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一名资深工程团队负责人。
写作风格要求：{tone}。`,
  ],
  [
    "human",
    `本周信息如下：

公司名称：{company_name}
团队名称：{team_name}
本周开发数据：
{dev_activities}

请据此输出一份 Markdown 周报。`,
  ],
]);
```

填充变量：

```js
const chatMessages = await chatPrompt.formatMessages({
  tone: "专业、清晰、略带鼓励",
  company_name: "星航科技",
  team_name: "智能应用平台组",
  dev_activities: "...",
});
```

这里返回的是消息数组，可以直接传给模型：

```js
const response = await model.invoke(chatMessages);
```

相比单个字符串，messages 的好处是角色边界更清楚：

1. `system` 放稳定规则和角色设定。
2. `human` 放用户当前输入和业务数据。
3. `ai` 可以放示例回答。
4. 多轮对话可以直接追加历史消息。

实际项目里，`ChatPromptTemplate` 通常比纯字符串 `PromptTemplate` 更常用。

## 六、ChatPromptTemplate 的另一种写法

入口文件：

```powershell
node .\src\chat-prompt-template2.mjs
```

除了数组简写，也可以用专门的 MessagePromptTemplate：

```js
const systemTemplate = SystemMessagePromptTemplate.fromTemplate(
  `你是一名资深工程团队负责人。
写作风格要求：{tone}。`,
);

const humanTemplate = HumanMessagePromptTemplate.fromTemplate(
  `本周信息如下：
公司名称：{company_name}
团队名称：{team_name}
本周开发数据：
{dev_activities}`,
);
```

再组合：

```js
const composedTemplate = ChatPromptTemplate.fromMessages([
  systemTemplate,
  humanTemplate,
]);
```

两种写法本质一样。数组写法更短，适合普通场景；`SystemMessagePromptTemplate`、`HumanMessagePromptTemplate` 这种写法更显式，适合你想把不同消息模板拆出去复用的场景。

## 七、PipelinePromptTemplate + ChatPromptTemplate

入口文件：

```powershell
node .\src\pipeline-prompt-template3.mjs
```

前面的 Pipeline 最终生成的是字符串。这个文件演示的是：Pipeline 的 `finalPrompt` 也可以是 `ChatPromptTemplate`。

先定义普通 PromptTemplate 模块：

```js
const weeklyTaskPrompt = PromptTemplate.fromTemplate(
  `以下是本周与你所在团队相关的关键事实与数据：
{dev_activities}

请你基于这些信息，帮我生成一份【技术周报】。`,
);
```

再定义最终的 ChatPromptTemplate：

```js
const finalChatPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一名资深工程团队负责人，擅长把复杂的技术细节总结成结构化、易读的周报。`,
  ],
  [
    "human",
    `人设与写作风格：
{persona_block}

团队与本周背景：
{context_block}

任务与输入数据：
{task_block}

输出格式要求：
{format_block}

现在请基于以上信息，直接输出最终的周报内容。`,
  ],
]);
```

组合时：

```js
const weeklyChatPipelinePrompt = new PipelinePromptTemplate({
  pipelinePrompts: [
    { name: "persona_block", prompt: personaPrompt },
    { name: "context_block", prompt: contextPrompt },
    { name: "task_block", prompt: weeklyTaskPrompt },
    { name: "format_block", prompt: weeklyFormatPrompt },
  ],
  finalPrompt: finalChatPrompt,
});
```

因为最终结果是 ChatPromptTemplate，所以这里使用：

```js
const promptValue = await weeklyChatPipelinePrompt.formatPromptValue({...});
console.log(promptValue.toChatMessages());
```

这一步很重要：如果最终 prompt 是普通 `PromptTemplate`，常用 `format()` 得到字符串；如果最终 prompt 是 `ChatPromptTemplate`，常用 `formatPromptValue()` 或 `formatMessages()` 得到消息。

## 八、MessagesPlaceholder：插入对话历史

入口文件：

```powershell
node .\src\messages-placeholder.mjs
```

`ChatPromptTemplate` 的普通变量只能填字符串、数字这类值。但真实聊天应用里，经常要插入一段历史对话。

这时用 `MessagesPlaceholder`：

```js
const chatPromptWithHistory = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一名资深工程效率顾问，善于在多轮对话的上下文中给出具体、可执行的建议。`,
  ],
  new MessagesPlaceholder("history"),
  [
    "human",
    `这是用户本轮的新问题：{current_input}

请结合上面的历史对话，一并给出你的建议。`,
  ],
]);
```

调用时给 `history` 传入消息数组：

```js
const historyMessages = [
  {
    role: "human",
    content: "我们团队最近在做一个内部的周报自动生成工具。",
  },
  {
    role: "ai",
    content: "可以先把数据源梳理清楚，再考虑 Prompt 模块化设计。",
  },
];

const formattedMessages = await chatPromptWithHistory.formatPromptValue({
  history: historyMessages,
  current_input: "现在我们想再优化一下多人协同编辑周报的流程，有什么建议？",
});
```

最终消息顺序会变成：

```text
system 规则
历史 human 消息
历史 ai 消息
当前 human 消息
```

这就是很多聊天机器人、Agent、memory 示例里常见的结构。

如果你只是填一个变量，用 `{current_input}`。如果你要插入一整段消息历史，用 `MessagesPlaceholder`。

## 九、FewShotPromptTemplate：把示例放进 prompt

入口文件：

```powershell
node .\src\fewshot-prompt-template.mjs
```

Few-shot 的意思是：给模型几条示例，让它模仿示例的结构、语气和输出方式。

这个文件先定义“单条示例长什么样”：

```js
const examplePrompt = PromptTemplate.fromTemplate(
  `用户输入：{user_requirement}
期望周报结构：{expected_style}
模型示例输出片段：
{report_snippet}
---`,
);
```

然后准备示例数据：

```js
const examples = [
  {
    user_requirement: "重点突出稳定性治理...",
    expected_style: "语气稳健、偏保守...",
    report_snippet: "- 支付链路本周共处理线上 P1 Bug 2 个...",
  },
  {
    user_requirement: "偏向对外展示成果...",
    expected_style: "语气积极、突出成果...",
    report_snippet: "- 新上线「订单实时看板」...",
  },
];
```

最后用 `FewShotPromptTemplate` 组合：

```js
const fewShotPrompt = new FewShotPromptTemplate({
  examples,
  examplePrompt,
  prefix: "下面是几条已经写好的【周报示例】...",
  suffix: "基于上面的示例风格，请帮我写一份新的周报。",
  inputVariables: [],
});
```

最终生成的 prompt 结构是：

```text
prefix

示例 1
示例 2

suffix
```

Few-shot 很适合这些场景：

1. 你希望模型模仿固定文风。
2. 输出结构不只是靠文字说明能讲清楚。
3. 你有一些高质量样例，想让模型学习。

注意：示例会消耗 token。示例越多，成本越高，上下文越长。所以示例不是越多越好，后面就需要 ExampleSelector。

## 十、LengthBasedExampleSelector：根据长度选择示例

入口文件：

```powershell
node .\src\example-selector1.mjs
```

当示例很多时，不一定每次都全部塞进 prompt。`LengthBasedExampleSelector` 可以根据长度预算选择合适数量的示例。

代码里先定义示例模板和 examples，然后创建 selector：

```js
const exampleSelector = await LengthBasedExampleSelector.fromExamples(examples, {
  examplePrompt,
  maxLength: 700,
  getTextLength: (text) => text.length,
});
```

这里的意思是：把示例格式化后的总长度控制在 `maxLength` 附近。示例选择器会尽量放入长度合适的示例。

再把 selector 交给 `FewShotPromptTemplate`：

```js
const fewShotPrompt = new FewShotPromptTemplate({
  examplePrompt,
  exampleSelector,
  prefix: "下面是一些不同风格和长度的周报片段示例...",
  suffix: "场景描述：{current_requirement}",
  inputVariables: ["current_requirement"],
});
```

这时不再传 `examples`，而是传 `exampleSelector`。

`LengthBasedExampleSelector` 适合解决 token 预算问题：示例池可以很多，但每次只选择一部分，避免 prompt 太长。

不过它只关心长度，不理解语义。比如当前需求是“稳定性治理”，它不一定优先选稳定性相关示例，只会按长度策略选择。要按语义选择，就要用下一节的 `SemanticSimilarityExampleSelector`。

## 十一、SemanticSimilarityExampleSelector：根据语义选择示例

入口文件：

```powershell
node .\src\weekly-report-examples-writer-milvus.mjs
node .\src\example-selector2.mjs
```

这一组示例使用 Milvus 做向量检索。运行顺序是：

1. 先运行 `weekly-report-examples-writer-milvus.mjs`，把周报示例写入 Milvus。
2. 再运行 `example-selector2.mjs`，根据当前场景从 Milvus 检索语义最相近的示例。

### 1. 写入示例到 Milvus

`weekly-report-examples-writer-milvus.mjs` 里准备了一批周报示例：

```js
const EXAMPLES = [
  {
    scenario: "支付系统稳定性治理，强调风险防控、告警收敛和应急预案完善。",
    report_snippet: "- 本周聚焦支付链路稳定性...",
  },
  {
    scenario: "新功能首发，更多是对外展示亮点...",
    report_snippet: "- 上线「运营实时看板」...",
  },
];
```

然后创建 embedding：

```js
const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.EMBEDDINGS_MODEL_NAME,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  dimensions: VECTOR_DIM,
});
```

写入时，用 `scenario + report_snippet` 生成向量：

```js
const vector = await getEmbedding(example.scenario + example.report_snippet);
```

再插入 Milvus：

```js
await client.insert({
  collection_name: COLLECTION_NAME,
  data: insertData,
});
```

这个脚本本质上是在构建一个“周报示例库”。

### 2. 从 Milvus 中选择语义相近示例

`example-selector2.mjs` 先连接已存在的 Milvus 集合：

```js
const vectorStore = await Milvus.fromExistingCollection(embeddings, {
  collectionName: COLLECTION_NAME,
  clientConfig: {
    address: milvusAddress,
  },
});
```

然后创建语义选择器：

```js
const exampleSelector = new SemanticSimilarityExampleSelector({
  vectorStore,
  k: 2,
});
```

`k: 2` 表示每次选 2 条最相近的示例。

再放进 FewShotPromptTemplate：

```js
const fewShotPrompt = new FewShotPromptTemplate({
  examplePrompt,
  exampleSelector,
  prefix: "下面是一些不同类型的周报示例...",
  suffix: "场景描述：{current_scenario}",
  inputVariables: ["current_scenario"],
});
```

代码里故意准备了两个不同场景：

```js
const currentScenario1 = "我们本周主要是在清理历史技术债...";
const currentScenario2 = "本周完成新一代运营看板的首批功能上线...";
```

运行后可以观察：技术债场景会更容易选到重构、单测、文档相关示例；新功能上线场景会更容易选到发布、看板、对外宣传相关示例。

这就是语义示例选择的价值：不是固定塞示例，而是根据当前任务动态挑选最相关的示例。

## 十二、FewShotChatMessagePromptTemplate：聊天版 few-shot

入口文件：

```powershell
node .\src\fewshot-chat-prompt-template.mjs
```

前面的 `FewShotPromptTemplate` 生成的是字符串。聊天模型里更自然的 few-shot 形式是：

```text
human: 示例问题 1
ai: 示例回答 1
human: 示例问题 2
ai: 示例回答 2
human: 当前问题
```

`FewShotChatMessagePromptTemplate` 就是用来生成这种聊天格式的 few-shot 示例。

先准备示例：

```js
const EXAMPLES = [
  {
    input: "本周主要推进支付稳定性治理，做了事故处置、告警优化和演练。",
    output: "- 本周围绕支付链路稳定性开展治理工作...",
  },
  {
    input: "本周交付了新运营看板，并给业务同学做了多场分享。",
    output: "- 上线新一代「运营实时看板」...",
  },
];
```

然后定义每条示例如何变成 human/ai 消息：

```js
const fewShotExamples = new FewShotChatMessagePromptTemplate({
  examplePrompt: ChatPromptTemplate.fromMessages([
    [
      "human",
      "下面是本周的工作概述：\n{input}\n\n请帮我整理成适合发在团队周报里的要点列表。",
    ],
    ["ai", "{output}"],
  ]),
  examples: EXAMPLES,
  inputVariables: [],
});
```

最后把 few-shot 示例插入完整的 ChatPromptTemplate：

```js
const chatPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "你是一名资深技术负责人，请根据给定的工作内容，参考上面的示例，帮我写一段结构清晰、重点突出的周报片段。",
  ],
  [
    "system",
    "下面是若干参考示例，请重点学习它们的表达方式和结构。",
  ],
  fewShotExamples,
  [
    "human",
    "这是我本周的实际工作内容，请帮我整理成周报：\n{current_work}",
  ],
]);
```

这个方式适合聊天模型，因为它保留了“用户问、AI 答”的示例结构。模型更容易理解：前面这些不是普通说明文字，而是应该模仿的对话样例。

## API 对比

| API | 代表文件 | 产物 | 适合场景 |
| --- | --- | --- | --- |
| `PromptTemplate` | `prompt-template1.mjs` | 字符串 | 单段 prompt、简单变量填充 |
| `PipelinePromptTemplate` | `pipeline-prompt-template.mjs` | 字符串或 PromptValue | 多模块 prompt 组合 |
| `partial()` | `partial.mjs` | 预填后的模板 | 固定公司、角色、格式等重复变量 |
| `ChatPromptTemplate` | `chat-prompt-template.mjs` | messages 数组 | Chat 模型、多角色消息 |
| `MessagesPlaceholder` | `messages-placeholder.mjs` | 插入一段消息列表 | 多轮对话、memory、Agent 历史 |
| `FewShotPromptTemplate` | `fewshot-prompt-template.mjs` | 字符串 few-shot prompt | 给模型示例，控制风格和结构 |
| `LengthBasedExampleSelector` | `example-selector1.mjs` | 被选中的示例 | 控制 few-shot token 长度 |
| `SemanticSimilarityExampleSelector` | `example-selector2.mjs` | 语义相近示例 | 根据当前 query 动态选样例 |
| `FewShotChatMessagePromptTemplate` | `fewshot-chat-prompt-template.mjs` | few-shot messages | 聊天模型里的 human/ai 示例 |

## 实际项目里的组合方式

一个比较常见的项目结构是：

```text
固定系统规则
  -> ChatPromptTemplate(system)

业务背景、角色、人设、格式
  -> 多个 PromptTemplate
  -> PipelinePromptTemplate 组合

用户当前输入
  -> Human message

历史消息
  -> MessagesPlaceholder

高质量示例
  -> FewShotPromptTemplate 或 FewShotChatMessagePromptTemplate
  -> ExampleSelector 控制数量和相关性
```

对应到本目录的周报场景，可以这么理解：

```text
公司/团队固定信息
  -> partial 预填

周报人设、背景、任务、格式
  -> PipelinePromptTemplate 拆分

多轮协作上下文
  -> MessagesPlaceholder 注入 history

不同类型周报样例
  -> FewShot + ExampleSelector 动态选择

最终调用 Chat 模型
  -> ChatPromptTemplate 生成 messages
```

## 常见问题

### 1. PromptTemplate 和 ChatPromptTemplate 选哪个？

如果模型调用只需要一个字符串，用 `PromptTemplate`。

如果你用的是 Chat 模型，或者需要 system/human/ai 多角色消息，优先用 `ChatPromptTemplate`。

### 2. PipelinePromptTemplate 是不是一定要用？

不是。短 prompt 没必要拆。只有当 prompt 里明显出现“人设、背景、任务、格式、示例”等多个部分，并且这些部分会被多个场景复用时，Pipeline 才有价值。

### 3. partial 和直接写死变量有什么区别？

直接写死变量会让模板不灵活。`partial()` 会生成一个“预填后的模板”，既减少重复填写，又保留后续动态填充能力。

### 4. MessagesPlaceholder 和普通 `{history}` 有什么区别？

普通 `{history}` 通常会被当成字符串填进去。`MessagesPlaceholder` 插入的是一组真正的消息，能保留 human/ai/system 角色信息。

### 5. Few-shot 示例要放多少条？

越多不一定越好。示例会占 token，也可能干扰模型。一般先放 2 到 5 条高质量示例，再根据效果决定是否使用 ExampleSelector 动态选择。

### 6. LengthBasedExampleSelector 和 SemanticSimilarityExampleSelector 有什么区别？

`LengthBasedExampleSelector` 主要控制长度，避免 prompt 太长。

`SemanticSimilarityExampleSelector` 主要控制相关性，根据当前输入选语义最接近的示例。它需要 embedding 和向量库。

### 7. 为什么 Milvus 示例要先运行 writer？

`example-selector2.mjs` 是从已有 Milvus 集合中查示例。如果集合里还没有数据，就没有可选示例。所以需要先运行：

```powershell
node .\src\weekly-report-examples-writer-milvus.mjs
```

再运行：

```powershell
node .\src\example-selector2.mjs
```

## 总结

这节主要学了 Prompt Template 相关 API：

1. `PromptTemplate`：最基础的字符串模板，用 `{变量}` 填充内容。
2. `PipelinePromptTemplate`：把多个 PromptTemplate 组合成一个大模板。
3. `partial()`：预填固定变量，减少重复配置。
4. `ChatPromptTemplate`：用模板生成 Chat 模型需要的 messages 数组。
5. `MessagesPlaceholder`：在 ChatPromptTemplate 中插入历史消息。
6. `FewShotPromptTemplate`：生成带示例的字符串 prompt。
7. `LengthBasedExampleSelector`：根据长度预算选择示例。
8. `SemanticSimilarityExampleSelector`：根据语义相似度选择示例。
9. `FewShotChatMessagePromptTemplate`：生成聊天形式的 few-shot 示例。

Prompt Template 的核心不是“少写几行字符串”，而是让 prompt 可以像代码一样被拆分、复用、组合和测试。项目越复杂，这种组件化管理越有价值。
