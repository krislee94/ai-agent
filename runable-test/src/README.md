# Runnable：LangChain 的责任链

这个目录演示的是 LangChain 里 Runnable 体系的用法。

如果把 LangChain 应用拆开看，很多流程其实都是“上一步的输出，交给下一步继续处理”：

```text
用户输入
  -> PromptTemplate 格式化 prompt
  -> ChatOpenAI 调用模型
  -> OutputParser 解析结果
  -> 后续业务逻辑
```

以前我们可以手动一步一步写：

```js
const formattedPrompt = await promptTemplate.format(input);
const response = await model.invoke(formattedPrompt);
const result = await outputParser.invoke(response);
```

Runnable 的作用，就是把这些步骤都变成统一接口的“可运行节点”，再像责任链一样串起来、并行执行、分支路由、重试、降级、注入历史和监听回调。

这个目录里的示例可以分成三类：

1. 基础链路：从手动调用到 `RunnableSequence`。
2. Runnable 组件：`RunnableLambda`、`RunnableMap`、`RunnableBranch`、`RouterRunnable` 等。
3. 工程能力：`withConfig`、callbacks、fallbacks、retry、message history，以及 RAG / MCP 综合案例。

## 项目结构

```text
runable-test/
  package.json
  src/
    before.mjs                              # 不使用 Runnable 的手动三步调用
    runnable.mjs                            # Prompt -> Model -> Parser 的 RunnableSequence
    README.md                               # 本教学文档
    runnables/
      RunnableLambda.mjs                    # 把普通函数包装成 Runnable
      RunnableMap.mjs                       # 并行执行多个 Runnable
      RunnableBranch.mjs                    # 按条件分支执行
      RouterRunnable.mjs                    # 按 key 路由到不同 Runnable
      RunnablePassthrough.mjs               # 透传输入，并追加字段
      RunnablePick.mjs                      # 从对象中挑选字段
      RunnableEach.mjs                      # 对数组每个元素运行同一个链
      RunnableWithConfig.mjs                # 使用 config 传运行时配置
      RunnableWithCallbacks.mjs             # 用 callbacks 观察链执行过程
      RunnableWithFallbacks.mjs             # 失败时切换备用 Runnable
      RunnableWithRetry.mjs                 # 失败时自动重试
      RunnableWithMessageHistory.mjs        # 给链加会话历史
    cases/
      ebook-reader-rag.mjs                  # Runnable 写 RAG 检索问答链
      mcp-test.mjs                          # Runnable 写 MCP 工具调用循环
```

## 准备环境

安装依赖：

```powershell
cd G:\ai\ai-agent\runable-test
pnpm install
```

`.env` 至少需要：

```env
MODEL_NAME=你的聊天模型
OPENAI_API_KEY=你的 API Key
OPENAI_BASE_URL=OpenAI 兼容接口地址
```

如果运行 RAG 或 MCP 综合案例，还可能需要：

```env
EMBEDDINGS_MODEL_NAME=你的 embedding 模型
AMAP_MAPS_API_KEY=高德 MCP Key
```

`cases/ebook-reader-rag.mjs` 还依赖本地 Milvus 和已有的 `ebook_collection` 集合。`cases/mcp-test.mjs` 依赖 MCP 相关包和可用的 MCP 服务配置，如果当前 `package.json` 里缺少这些可选依赖，需要先补安装。

## 推荐学习顺序

建议按这个顺序跑：

```powershell
node .\src\before.mjs
node .\src\runnable.mjs
node .\src\runnables\RunnableLambda.mjs
node .\src\runnables\RunnableMap.mjs
node .\src\runnables\RunnableBranch.mjs
node .\src\runnables\RouterRunnable.mjs
node .\src\runnables\RunnablePassthrough.mjs
node .\src\runnables\RunnablePick.mjs
node .\src\runnables\RunnableEach.mjs
node .\src\runnables\RunnableWithConfig.mjs
node .\src\runnables\RunnableWithCallbacks.mjs
node .\src\runnables\RunnableWithFallbacks.mjs
node .\src\runnables\RunnableWithRetry.mjs
node .\src\runnables\RunnableWithMessageHistory.mjs
```

最后再看综合案例：

```powershell
node .\src\cases\ebook-reader-rag.mjs
node .\src\cases\mcp-test.mjs
```

## 一、先看没有 Runnable 的写法

入口文件：

```powershell
node .\src\before.mjs
```

这个文件实现了一个简单任务：把中文文本翻译成英文，并总结 3 个关键词，最后用结构化 parser 解析结果。

代码里有三个核心对象：

```js
const promptTemplate = PromptTemplate.fromTemplate(
  "将以下文本翻译成英文，然后总结为3个关键词。\n\n文本：{text}\n\n{format_instructions}",
);

const model = new ChatOpenAI({...});

const outputParser = StructuredOutputParser.fromZodSchema(schema);
```

手动调用流程是：

```js
const formattedPrompt = await promptTemplate.format(input);
const response = await model.invoke(formattedPrompt);
const result = await outputParser.invoke(response);
```

这三个步骤本身没有问题，但当流程变复杂后会有几个麻烦：

1. 中间变量越来越多。
2. 每个步骤的调用方式不统一。
3. 不方便插入重试、回调、fallback、批量处理等通用能力。
4. 不方便把这条链作为一个整体继续组合。

Runnable 就是为了解决这些问题。

## 二、Runnable Chain：把步骤串成链

入口文件：

```powershell
node .\src\runnable.mjs
```

同样的翻译和关键词提取流程，用 Runnable 可以写成：

```js
const chain = RunnableSequence.from([
  promptTemplate,
  model,
  outputParser,
]);

const result = await chain.invoke(input);
```

也可以用 `.pipe()`：

```js
const chain = promptTemplate
  .pipe(model)
  .pipe(outputParser);
```

这两种写法的含义一样：

```text
input
  -> promptTemplate
  -> model
  -> outputParser
  -> result
```

这里最关键的是：`PromptTemplate`、`ChatOpenAI`、`StructuredOutputParser` 都实现了 Runnable 接口，所以它们可以被放进同一条链里。

Runnable 的统一接口主要包括：

| 方法 | 含义 |
| --- | --- |
| `invoke(input)` | 单次调用 |
| `stream(input)` | 流式调用 |
| `batch(inputs)` | 批量调用 |
| `pipe(next)` | 接到下一个 Runnable |
| `withConfig(config)` | 绑定运行配置 |
| `withRetry(options)` | 增加重试 |
| `withFallbacks(options)` | 增加降级链 |

后面的文件就是围绕这些能力展开。

## 三、RunnableLambda：把普通函数变成 Runnable

入口文件：

```powershell
node .\src\runnables\RunnableLambda.mjs
```

`RunnableLambda` 可以把一个普通函数包装成 Runnable。

示例代码：

```js
const addOne = RunnableLambda.from((input) => {
  console.log(`输入: ${input}`);
  return input + 1;
});

const multiplyTwo = RunnableLambda.from((input) => {
  console.log(`输入: ${input}`);
  return input * 2;
});
```

然后用 `RunnableSequence` 串起来：

```js
const chain = RunnableSequence.from([
  addOne,
  multiplyTwo,
  addOne,
]);

const result = await chain.invoke(5);
```

执行过程是：

```text
5
  -> addOne       得到 6
  -> multiplyTwo  得到 12
  -> addOne       得到 13
```

所以最终输出是 `13`。

`RunnableLambda` 的典型用途是把自己的业务函数塞进 LangChain 链路中，例如：

1. 清洗输入。
2. 构造状态对象。
3. 转换模型输出。
4. 调数据库或接口。
5. 写日志、做校验、做分支判断。

只要一个函数能接收输入并返回输出，就可以包装成 Runnable。

## 四、RunnableMap：并行执行多个 Runnable

入口文件：

```powershell
node .\src\runnables\RunnableMap.mjs
```

`RunnableMap` 用来把同一个输入同时交给多个 Runnable 处理，然后把结果合并成对象。

示例里定义了几个处理器：

```js
const addOne = RunnableLambda.from((input) => input.num + 1);
const multiplyTwo = RunnableLambda.from((input) => input.num * 2);
const square = RunnableLambda.from((input) => input.num * input.num);

const greetTemplate = PromptTemplate.fromTemplate("你好，{name}！");
const weatherTemplate = PromptTemplate.fromTemplate("今天天气{weather}。");
```

然后组合成 map：

```js
const runnableMap = RunnableMap.from({
  add: addOne,
  multiply: multiplyTwo,
  square,
  greeting: greetTemplate,
  weather: weatherTemplate,
});
```

输入：

```js
const input = {
  name: "神光",
  weather: "多云",
  num: 5,
};
```

输出会类似：

```js
{
  add: 6,
  multiply: 10,
  square: 25,
  greeting: "你好，神光！",
  weather: "今天天气多云。"
}
```

`RunnableMap` 适合用在需要并行准备多个字段的场景。比如 RAG 里同时准备：

```text
{
  question: 原始问题,
  context: 检索结果,
  userProfile: 用户画像,
  currentTime: 当前时间
}
```

这些字段互不依赖，就可以并行计算，再交给下一个 PromptTemplate。

## 五、RunnableBranch：条件分支，本质是 if else

入口文件：

```powershell
node .\src\runnables\RunnableBranch.mjs
```

`RunnableBranch` 用来按条件选择不同处理逻辑，类似 `if / else if / else`。

示例里先定义条件：

```js
const isPositive = RunnableLambda.from((input) => input > 0);
const isNegative = RunnableLambda.from((input) => input < 0);
const isEven = RunnableLambda.from((input) => input % 2 === 0);
```

再定义处理函数：

```js
const handlePositive = RunnableLambda.from((input) => `正数: ${input} + 10 = ${input + 10}`);
const handleNegative = RunnableLambda.from((input) => `负数: ${input} - 10 = ${input - 10}`);
const handleEven = RunnableLambda.from((input) => `偶数: ${input} * 2 = ${input * 2}`);
const handleDefault = RunnableLambda.from((input) => `默认: ${input}`);
```

组合分支：

```js
const branch = RunnableBranch.from([
  [isPositive, handlePositive],
  [isNegative, handleNegative],
  [isEven, handleEven],
  handleDefault,
]);
```

执行时会从上到下判断，命中第一个条件就执行对应 runnable。如果都不命中，就执行最后的默认 runnable。

一个容易忽略的点：条件顺序很重要。比如输入 `4`，它既是正数也是偶数，但因为 `isPositive` 写在 `isEven` 前面，所以会先进入正数分支。

真实项目里可以用 `RunnableBranch` 做：

1. 根据用户意图走不同链路。
2. 有检索结果时走 RAG，没有检索结果时走兜底回答。
3. 有 tool calls 时调用工具，没有 tool calls 时直接结束。
4. 根据权限判断是否继续执行敏感操作。

## 六、RouterRunnable：根据 key 路由到不同 Runnable

入口文件：

```powershell
node .\src\runnables\RouterRunnable.mjs
```

`RouterRunnable` 和 `RunnableBranch` 都能做“选择”，但选择方式不一样：

| 组件 | 选择依据 |
| --- | --- |
| `RunnableBranch` | 依次执行条件判断 |
| `RouterRunnable` | 根据输入里的 `key` 直接选 runnable |

示例里定义两个 Runnable：

```js
const toUpperCase = RunnableLambda.from((text) => text.toUpperCase());
const reverseText = RunnableLambda.from((text) => text.split("").reverse().join(""));
```

然后注册到 router：

```js
const router = new RouterRunnable({
  runnables: {
    toUpperCase,
    reverseText,
  },
});
```

调用时传：

```js
await router.invoke({
  key: "reverseText",
  input: "Hello World",
});
```

Router 会找到 `reverseText` 这个 runnable，并把 `input` 传给它。

`RouterRunnable` 适合“前面已经算出了路由 key”的场景。比如你先用模型做意图识别：

```text
用户问题 -> 意图分类 -> { key: "rag", input: question }
```

然后用 RouterRunnable 路由到：

```text
rag / calculator / weather / normal_chat
```

## 七、RunnablePassthrough：保留原输入并追加字段

入口文件：

```powershell
node .\src\runnables\RunnablePassthrough.mjs
```

`RunnablePassthrough` 的意思是“透传”。它常用于保留原始输入，同时追加一些新字段。

示例链路的意图是：

```js
const chain = RunnableSequence.from([
  (input) => ({ concept: input }),
  RunnablePassthrough.assign({
    original: new RunnablePassthrough(),
    processed: (obj) => ({
      concept: obj.concept,
      upper: obj.concept.toUpperCase(),
      length: obj.concept.length,
    }),
  }),
]);
```

输入：

```js
"神说要有光"
```

第一步变成：

```js
{ concept: "神说要有光" }
```

`RunnablePassthrough.assign()` 会在保留原对象的基础上，追加新字段：

```js
{
  concept: "神说要有光",
  original: { concept: "神说要有光" },
  processed: {
    concept: "神说要有光",
    upper: "神说要有光",
    length: 5
  }
}
```

注意：当前示例代码里 `processed` 中写的是 `concept: input`，这个 `input` 在该作用域里没有定义。如果要实际运行，建议改成 `concept: obj.concept`。

`RunnablePassthrough.assign()` 在真实链路里非常常用，尤其适合构造 state：

```text
原始 question
  -> assign({ context: retriever })
  -> prompt
  -> model
```

这样后面的 prompt 既能拿到原始问题，也能拿到追加的检索上下文。

## 八、RunnablePick：从对象中挑选字段

入口文件：

```powershell
node .\src\runnables\RunnablePick.mjs
```

`RunnablePick` 用来从对象里选出需要的字段。

示例输入：

```js
const inputData = {
  name: "神光",
  age: 30,
  city: "北京",
  country: "中国",
  email: "shenguang@example.com",
  phone: "+86-13800138000",
};
```

链路第一步先追加 `fullInfo`：

```js
(input) => ({
  ...input,
  fullInfo: `${input.name}，${input.age}岁，来自${input.city}`,
})
```

第二步只保留 `name` 和 `fullInfo`：

```js
new RunnablePick(["name", "fullInfo"])
```

输出：

```js
{
  name: "神光",
  fullInfo: "神光，30岁，来自北京"
}
```

它适合在链路中控制传给下一步的数据形状，避免把不需要的字段继续往后传。

## 九、RunnableEach：对数组逐项执行同一个链

入口文件：

```powershell
node .\src\runnables\RunnableEach.mjs
```

`RunnableEach` 用来对数组里的每个元素执行同一个 Runnable。

示例里先定义单个元素的处理链：

```js
const toUpperCase = RunnableLambda.from((input) => input.toUpperCase());
const addGreeting = RunnableLambda.from((input) => `你好，${input}！`);

const processItem = RunnableSequence.from([
  toUpperCase,
  addGreeting,
]);
```

再包成 `RunnableEach`：

```js
const chain = new RunnableEach({
  bound: processItem,
});
```

输入：

```js
["alice", "bob", "carol"]
```

输出：

```js
["你好，ALICE！", "你好，BOB！", "你好，CAROL！"]
```

真实项目中可以用它批量处理：

1. 多个文档片段摘要。
2. 多条用户评论分类。
3. 多个检索结果重排序。
4. 多个任务逐项生成结果。

## 十、RunnableWithConfig：给链传运行时配置

入口文件：

```powershell
node .\src\runnables\RunnableWithConfig.mjs
```

Runnable 的每一步除了接收 `input`，还可以接收 `config`。

示例里有三个节点：

1. 根据 `config.configurable.userId` 查用户。
2. 根据 `config.configurable.role` 判断权限。
3. 根据 `config.configurable.locale` 生成中文或英文通知。

节点函数签名是：

```js
const fetchUserFromConfig = RunnableLambda.from(async (input, config) => {
  const userId = config?.configurable?.userId;
  ...
});
```

绑定配置：

```js
const chainWithConfig = chain.withConfig({
  tags: ["demo", "withConfig", "notification"],
  metadata: {
    demoName: "RunnableWithConfig",
  },
  configurable: {
    userId: "user-123",
    role: "管理员",
    locale: "zh-CN",
  },
});
```

然后调用时只需要传业务输入：

```js
const result = await chainWithConfig.invoke("你有一条新的系统通知，请及时查看。");
```

`configurable` 适合放运行时配置，比如：

1. 当前用户 ID。
2. 租户 ID。
3. 语言和地区。
4. 权限角色。
5. 模型参数或开关。

`tags` 和 `metadata` 更多用于 tracing、日志、观测和调试。

## 十一、RunnableWithCallbacks：观察链执行过程

入口文件：

```powershell
node .\src\runnables\RunnableWithCallbacks.mjs
```

这个例子构造了一条文本处理链：

```text
clean -> tokenize -> count
```

代码：

```js
const clean = RunnableLambda.from((text) => {
  return text.trim().replace(/\s+/g, " ");
});

const tokenize = RunnableLambda.from((text) => {
  return text.split(" ");
});

const count = RunnableLambda.from((tokens) => {
  return { tokens, wordCount: tokens.length };
});

const chain = RunnableSequence.from([clean, tokenize, count]);
```

然后定义 callbacks：

```js
const callback = {
  handleChainStart(chain) {
    const step = chain?.id?.[chain.id.length - 1] ?? "unknown";
    console.log(`[START] ${step}`);
  },
  handleChainEnd(output) {
    console.log(`[END]   output=${JSON.stringify(output)}\n`);
  },
  handleChainError(err) {
    console.log(`[ERROR] ${err.message}\n`);
  },
};
```

调用时传入：

```js
const result = await chain.invoke("  hello   world   from   langchain  ", {
  callbacks: [callback],
});
```

callbacks 可以帮助你观察链路每一步什么时候开始、什么时候结束、输出是什么、是否报错。

真实项目中，callbacks 常用于：

1. 打印调试日志。
2. 上报 tracing。
3. 统计耗时和 token。
4. 记录错误。
5. 做流式 UI 状态更新。

## 十二、RunnableWithFallbacks：失败时降级

入口文件：

```powershell
node .\src\runnables\RunnableWithFallbacks.mjs
```

`withFallbacks()` 用来给 Runnable 增加备用方案。当前一个 Runnable 抛错时，会依次尝试 fallback。

示例里模拟了三个翻译服务：

```js
const premiumTranslator = RunnableLambda.from(async (text) => {
  throw new Error("Premium 服务超时");
});

const standardTranslator = RunnableLambda.from(async (text) => {
  return "xxx";
});

const localTranslator = RunnableLambda.from(async (text) => {
  const dict = { hello: "你好", world: "世界", goodbye: "再见" };
  ...
});
```

组合：

```js
const translator = premiumTranslator.withFallbacks({
  fallbacks: [standardTranslator, localTranslator],
});
```

执行顺序是：

```text
premiumTranslator
  如果成功，直接返回
  如果抛错，尝试 standardTranslator
    如果成功，直接返回
    如果抛错，尝试 localTranslator
```

注意：fallback 只有在前一个 Runnable 抛出错误时才会触发。当前示例里 `standardTranslator` 返回 `"xxx"`，所以不会再执行 `localTranslator`。如果你想看到本地翻译 fallback，可以把 `standardTranslator` 里的 `return "xxx"` 改成 `throw new Error("Standard 服务限流")`。

它适合这些场景：

1. 主模型失败时切换备用模型。
2. 在线服务失败时切换本地规则。
3. 远程检索失败时返回缓存。
4. 高级链路失败时切换简化链路。

## 十三、RunnableWithRetry：失败时自动重试

入口文件：

```powershell
node .\src\runnables\RunnableWithRetry.mjs
```

`withRetry()` 用来处理临时失败，比如网络抖动、限流、偶发服务错误。

示例里定义了一个 70% 概率失败的 Runnable：

```js
let attempt = 0;

const unstableRunnable = RunnableLambda.from(async (input) => {
  attempt += 1;

  if (Math.random() < 0.7) {
    throw new Error("模拟的随机错误");
  }

  return `成功处理: ${input}`;
});
```

加重试：

```js
const runnableWithRetry = unstableRunnable.withRetry({
  stopAfterAttempt: 5,
});
```

最多尝试 5 次。如果中间某一次成功，就返回结果；如果 5 次都失败，就进入 `catch`。

重试适合临时错误，不适合逻辑错误。比如：

| 适合重试 | 不适合重试 |
| --- | --- |
| 网络超时 | 参数格式错误 |
| 429 限流 | 用户无权限 |
| 上游服务 503 | prompt 变量缺失 |
| 偶发连接失败 | schema 明确不匹配 |

## 十四、RunnableWithMessageHistory：给链加记忆

入口文件：

```powershell
node .\src\runnables\RunnableWithMessageHistory.mjs
```

这个文件演示如何给一条 Chat 链增加会话历史。

先定义一个带 `MessagesPlaceholder` 的 prompt：

```js
const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "你是一个简洁、有帮助的中文助手，会用 1-2 句话回答用户问题。",
  ],
  new MessagesPlaceholder("history"),
  ["human", "{question}"],
]);
```

普通链是：

```js
const simpleChain = prompt
  .pipe(model)
  .pipe(new StringOutputParser());
```

再准备一个 sessionId 到历史记录的映射：

```js
const messageHistories = new Map();

const getMessageHistory = (sessionId) => {
  if (!messageHistories.has(sessionId)) {
    messageHistories.set(sessionId, new InMemoryChatMessageHistory());
  }
  return messageHistories.get(sessionId);
};
```

最后用 `RunnableWithMessageHistory` 包装：

```js
const chain = new RunnableWithMessageHistory({
  runnable: simpleChain,
  getMessageHistory: (sessionId) => getMessageHistory(sessionId),
  inputMessagesKey: "question",
  historyMessagesKey: "history",
});
```

调用时通过 config 传 `sessionId`：

```js
const result = await chain.invoke(
  { question: "我的名字是神光，我来自山东，我喜欢编程、写作、金铲铲。" },
  {
    configurable: {
      sessionId: "user-123",
    },
  },
);
```

第二次、第三次用同一个 `sessionId` 调用，链会自动把之前的消息放进 `history`：

```js
await chain.invoke(
  { question: "我刚才说我来自哪里？" },
  { configurable: { sessionId: "user-123" } },
);
```

这就是 Runnable 版本的 memory 封装：

```text
根据 sessionId 取历史
  -> 填入 MessagesPlaceholder("history")
  -> 调模型
  -> 自动把本轮 human/ai 消息写回历史
```

真实项目里可以把 `InMemoryChatMessageHistory` 换成文件、Redis、数据库等持久化实现。

## 十五、综合案例：Runnable 写 RAG 链

入口文件：

```powershell
node .\src\cases\ebook-reader-rag.mjs
```

这个文件演示了一个《天龙八部》小说问答 RAG 链，流程是：

```text
用户问题
  -> 生成 embedding
  -> Milvus 检索相关片段
  -> 构造 prompt 输入
  -> PromptTemplate
  -> ChatOpenAI
  -> StringOutputParser
  -> 流式输出答案
```

检索节点被包装成 `RunnableLambda`：

```js
const milvusSearch = new RunnableLambda({
  func: async (input) => {
    const { question, k = 5 } = input;
    const queryVector = await embeddings.embedQuery(question);
    const searchResult = await milvusClient.search({...});
    return { question, retrievedContent };
  },
});
```

构造 prompt 输入也是一个 Runnable：

```js
const buildPromptInput = new RunnableLambda({
  func: async (input) => {
    const { question, retrievedContent } = input;
    const context = retrievedContent.map(...).join("\n\n━━━━━\n\n");
    return { hasContext: true, question, context, retrievedContent };
  },
});
```

最后组合成 RAG chain：

```js
const ragChain = RunnableSequence.from([
  milvusSearch,
  buildPromptInput,
  new RunnableLambda({
    func: async (input) => {
      if (!input.hasContext) {
        return {
          question: input.question,
          context: "",
          answer: "抱歉，我没有找到相关的《天龙八部》内容。",
          noContext: true,
        };
      }

      return {
        question: input.question,
        context: input.context,
        noContext: false,
      };
    },
  }),
  promptTemplate,
  model,
  new StringOutputParser(),
]);
```

这个案例说明：RAG 本质上也可以看成一条 Runnable 链。检索、拼 context、格式化 prompt、调用模型、解析输出，每一步都可以作为独立 Runnable 维护。

## 十六、综合案例：Runnable 写 MCP 工具循环

入口文件：

```powershell
node .\src\cases\mcp-test.mjs
```

这个文件演示了一个更接近 Agent 的流程：模型可以调用 MCP 工具，工具结果再写回 messages，继续让模型思考，直到没有工具调用。

核心流程：

```text
messages
  -> prompt
  -> modelWithTools
  -> 如果没有 tool_calls：结束
  -> 如果有 tool_calls：执行工具
  -> 把 ToolMessage 追加回 messages
  -> 下一轮继续
```

模型绑定工具：

```js
const tools = await mcpClient.getTools();
const modelWithTools = model.bindTools(tools);
```

工具执行器被封装成 Runnable：

```js
const toolExecutor = new RunnableLambda({
  func: async (input) => {
    const { response, tools } = input;
    const toolResults = [];

    for (const toolCall of response.tool_calls ?? []) {
      const foundTool = tools.find((t) => t.name === toolCall.name);
      const toolResult = await foundTool.invoke(toolCall.args);

      toolResults.push(new ToolMessage({
        content: contentStr,
        tool_call_id: toolCall.id,
      }));
    }

    return toolResults;
  },
});
```

每一轮 agent step 是一条 Runnable 链：

```js
const agentStepChain = RunnableSequence.from([
  RunnablePassthrough.assign({
    response: llmChain,
  }),
  RunnableBranch.from([
    [
      (state) => !state.response?.tool_calls || state.response.tool_calls.length === 0,
      new RunnableLambda({ func: async (state) => ({ ...state, done: true }) }),
    ],
    RunnableSequence.from([
      RunnablePassthrough.assign({
        toolMessages: toolExecutor,
      }),
      new RunnableLambda({
        func: async (state) => ({
          ...state,
          messages: [...state.messages, ...(state.toolMessages ?? [])],
          done: false,
        }),
      }),
    ]),
  ]),
]);
```

这里用了三个前面学过的能力：

1. `RunnablePassthrough.assign()`：把模型响应挂到 state 上。
2. `RunnableBranch`：判断有没有工具调用。
3. `RunnableLambda`：执行工具和更新 messages。

这个案例说明：Runnable 不只是能串 prompt 和 model，也能组织 Agent 的状态流转。

## API 对比

| API | 代表文件 | 作用 |
| --- | --- | --- |
| `RunnableSequence` | `runnable.mjs` | 按顺序串联多个 Runnable |
| `RunnableLambda` | `RunnableLambda.mjs` | 把普通函数包装成 Runnable |
| `RunnableMap` | `RunnableMap.mjs` | 同一个输入并行送给多个 Runnable |
| `RunnableBranch` | `RunnableBranch.mjs` | 按条件选择分支 |
| `RouterRunnable` | `RouterRunnable.mjs` | 按 key 路由到指定 Runnable |
| `RunnablePassthrough` | `RunnablePassthrough.mjs` | 透传原输入，常配合 `assign` 追加字段 |
| `RunnablePick` | `RunnablePick.mjs` | 从对象中挑选字段 |
| `RunnableEach` | `RunnableEach.mjs` | 对数组每个元素执行同一个 Runnable |
| `withConfig` | `RunnableWithConfig.mjs` | 给链绑定 tags、metadata、configurable 配置 |
| callbacks | `RunnableWithCallbacks.mjs` | 监听链开始、结束、错误等事件 |
| `withFallbacks` | `RunnableWithFallbacks.mjs` | 主链失败时尝试备用链 |
| `withRetry` | `RunnableWithRetry.mjs` | 失败时自动重试 |
| `RunnableWithMessageHistory` | `RunnableWithMessageHistory.mjs` | 给链增加 session 级消息历史 |

## 实际项目里的常见组合

### 1. 普通 LLM 结构化链

```text
PromptTemplate
  -> ChatOpenAI
  -> OutputParser
```

对应 `runnable.mjs`。

### 2. RAG 链

```text
question
  -> Retriever Runnable
  -> RunnablePassthrough.assign({ context })
  -> PromptTemplate
  -> Model
  -> StringOutputParser
```

对应 `cases/ebook-reader-rag.mjs`。

### 3. Agent 工具循环

```text
messages
  -> modelWithTools
  -> RunnableBranch 判断 tool_calls
  -> toolExecutor
  -> ToolMessage 追加回 messages
  -> 下一轮
```

对应 `cases/mcp-test.mjs`。

### 4. 可观测和稳定性增强

```text
chain
  -> withRetry
  -> withFallbacks
  -> withConfig(tags, metadata)
  -> invoke(input, { callbacks })
```

对应 `RunnableWithRetry.mjs`、`RunnableWithFallbacks.mjs`、`RunnableWithConfig.mjs`、`RunnableWithCallbacks.mjs`。

## 常见问题

### 1. Runnable 是不是就是链式调用？

不只是链式调用。链式调用是最基础的能力。Runnable 更重要的是统一了调用接口，让 prompt、model、parser、普通函数、检索器、工具执行器都能被组合、流式、批量、重试、降级和观测。

### 2. `RunnableSequence.from([...])` 和 `.pipe()` 有什么区别？

功能上很接近。

`RunnableSequence.from([...])` 更适合步骤多、需要一眼看到完整链路的场景。

`.pipe()` 更适合从一个对象开始，逐步接下一个对象：

```js
const chain = prompt.pipe(model).pipe(parser);
```

### 3. 什么时候用 RunnableMap，什么时候用 RunnableSequence？

如果步骤有先后依赖，用 `RunnableSequence`。

如果多个步骤可以基于同一个输入并行产生字段，用 `RunnableMap`。

### 4. RunnableBranch 和 RouterRunnable 怎么选？

如果要动态判断条件，用 `RunnableBranch`。

如果输入里已经有明确的 `key`，用 `RouterRunnable`。

### 5. withRetry 和 withFallbacks 有什么区别？

`withRetry` 是同一个 Runnable 失败后再试几次。

`withFallbacks` 是一个 Runnable 失败后换另一个 Runnable。

它们可以组合使用，例如主模型先重试，仍失败后再切备用模型。

### 6. config 里的 configurable 有什么用？

它是运行时配置通道。业务输入放在 `input`，用户 ID、角色、locale、开关、trace 信息这类运行配置可以放在 `config.configurable`。

### 7. MessageHistory 和手动传 history 有什么区别？

手动传 history 需要你自己读取、拼接、保存历史。`RunnableWithMessageHistory` 会根据 `sessionId` 自动读取历史、注入 prompt，并在调用结束后写回历史。

## 总结

Runnable 是 LangChain JS 里非常核心的抽象。它把不同类型的处理单元统一成同一套接口：

```text
invoke / stream / batch / pipe / withConfig / withRetry / withFallbacks
```

学会 Runnable 之后，你就可以把一个 AI 应用拆成很多小节点：

```text
输入清洗
  -> 检索
  -> prompt 构造
  -> 模型调用
  -> 输出解析
  -> 工具执行
  -> 历史写入
  -> 错误重试和降级
```

每个节点都可以独立测试，也可以像积木一样组合成更复杂的 RAG、Agent、MCP 工具调用流程。Runnable 的核心价值，就是让 AI 应用从“脚本式调用”变成“可组合、可观测、可扩展的执行链”。
