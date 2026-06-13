# LangChain Memory 教学示例

这个目录演示的是 LangChain 里“记忆”的几种常见做法。这里的 memory 不再是一个神秘的 `ConversationBufferMemory` 黑盒，而是把三件事拆开自己控制：

1. 把历史消息存在哪里。
2. 从历史消息里保留哪些内容。
3. 把选出来的历史内容怎样放回下一次模型调用。

这也是新版 LangChain 更推荐的思路：用 `ChatMessageHistory` 管存储，用 `trimMessages`、总结、检索等策略管上下文选择，最后手动把消息数组传给 `model.invoke()`。

## 项目结构

```text
memory-test/
  chat_history.json                  # 文件型历史记录示例产生的数据
  src/
    history-test.mjs                 # 内存版聊天历史
    history-test2.mjs                # 文件版聊天历史，写入 chat_history.json
    history-test3.mjs                # 从 chat_history.json 恢复后继续对话
    memory/
      truncation-memory.mjs          # 按消息数和 token 数截断历史
      summarization-memory.mjs       # 按消息条数触发总结
      summarization-memory2.mjs      # 按 token 数触发总结
      insert-conversations.mjs       # 把历史对话写入 Milvus 向量库
      retrieval-memory.mjs           # 从 Milvus 检索相关历史，再增强回答
```

## 准备环境

先安装依赖：

```powershell
cd G:\ai\ai-agent\memory-test
pnpm install
```

`.env` 里需要这些变量：

```env
MODEL_NAME=你的聊天模型
OPENAI_API_KEY=你的 API Key
OPENAI_BASE_URL=OpenAI 兼容接口地址
EMBEDDINGS_MODEL_NAME=你的 embedding 模型
```

基础历史、截断、总结示例只需要聊天模型。检索式 memory 还需要 embedding 模型和本地 Milvus 服务。

## 一、最小 Memory：把历史消息重新传给模型

入口文件：

```powershell
node .\src\history-test.mjs
```

这个文件用的是 `InMemoryChatMessageHistory`。它只存在当前进程内，程序结束后历史就没了。

核心流程是：

```js
const history = new InMemoryChatMessageHistory();

await history.addMessage(userMessage);

const messages = [systemMessage, ...(await history.getMessages())];
const response = await model.invoke(messages);

await history.addMessage(response);
```

这里最重要的一点是：模型本身没有记忆。所谓“记得上一轮”，其实是我们把上一轮的 `HumanMessage` 和 `AIMessage` 再次拼进下一次请求里。

`history-test.mjs` 里第二轮用户只问“好吃吗？”。如果没有历史，模型不知道“什么好吃”。但因为第一轮和第二轮消息都被放进了 `messages`，模型就可以结合之前的做菜上下文回答。

## 二、持久化 Memory：把消息存到文件

入口文件：

```powershell
node .\src\history-test2.mjs
node .\src\history-test3.mjs
```

`history-test2.mjs` 使用 `FileSystemChatMessageHistory` 把消息写入 `chat_history.json`：

```js
const history = new FileSystemChatMessageHistory({
  filePath,
  sessionId: "user_session_001",
});
```

`sessionId` 用来区分不同用户或不同会话。同一个 `filePath` 里可以保存多个 session 的消息。

`history-test3.mjs` 再用同一个 `filePath` 和 `sessionId` 读取历史：

```js
const restoredHistory = new FileSystemChatMessageHistory({
  filePath,
  sessionId,
});

const restoredMessages = await restoredHistory.getMessages();
```

这个例子说明了 memory 的第一层含义：存储层。你可以把消息存在内存、文件、Redis、数据库，甚至对象存储里。只要能在下一轮取出来并组装成消息数组，就能成为模型上下文的一部分。

## 三、为什么需要截断

如果每轮对话都把全部历史发给模型，会遇到两个问题：

1. token 越来越多，调用越来越贵。
2. 超过模型上下文窗口后，请求会失败或被截断。

所以 memory 的第二层含义是：选择哪些历史要保留。

入口文件：

```powershell
node .\src\memory\truncation-memory.mjs
```

### 1. 按消息条数截断

最简单的办法是只保留最近几条：

```js
const maxMessages = 4;
const allMessages = await history.getMessages();
const trimmedMessages = allMessages.slice(-maxMessages);
```

这个策略很直接，适合快速 demo，但不够精确。因为一条消息可能只有几个字，也可能有几千字。

### 2. 按 token 截断

更贴近真实模型限制的方式是按 token 计算：

```js
const trimmedMessages = await trimMessages(allMessages, {
  maxTokens,
  tokenCounter: async (msgs) => countTokens(msgs, enc),
  strategy: "last",
});
```

这里的 `strategy: "last"` 表示优先保留最近的消息。`countTokens` 使用 `js-tiktoken` 粗略估算消息内容的 token 数。

这种策略适合短期记忆，也就是“最近几轮聊了什么”。

## 四、总结式 Memory：把旧历史压缩成摘要

只截断会丢信息。比如用户在很早之前说过“我对花生过敏”，后面点餐时仍然很重要。如果简单保留最近消息，这条信息可能被丢掉。

总结式 memory 的做法是：

1. 保留最近几条原始消息。
2. 把更早的消息交给模型总结。
3. 下一轮对话时，把“摘要 + 最近消息”一起作为上下文。

入口文件：

```powershell
node .\src\memory\summarization-memory.mjs
node .\src\memory\summarization-memory2.mjs
```

`summarization-memory.mjs` 按消息条数触发总结：

```js
const keepRecent = 2;
const recentMessages = allMessages.slice(-keepRecent);
const messagesToSummarize = allMessages.slice(0, -keepRecent);

const summary = await summarizeHistory(messagesToSummarize);

await history.clear();
for (const msg of recentMessages) {
  await history.addMessage(msg);
}
```

真正生成摘要的是 `summarizeHistory`：

```js
const conversationText = getBufferString(messages, {
  humanPrefix: "用户",
  aiPrefix: "助手",
});

const summaryResponse = await model.invoke([
  new SystemMessage(summaryPrompt),
]);
```

`summarization-memory2.mjs` 更进一步，按 token 触发总结，并保留最近一部分 token：

```js
const maxTokens = 200;
const keepRecentTokens = 80;
```

这个策略接近很多 Agent 工具里的 `/compact`：当上下文太长时，把旧对话压缩成摘要，给新对话腾空间。

## 五、检索式 Memory：需要时再想起相关历史

总结适合压缩连续对话，但它仍然会把很多细节揉成一段文字。检索式 memory 更像“长期记忆”：把历史对话向量化存进数据库，当前问题来了之后，只取语义最相关的几段历史。

这个目录用 Milvus 演示检索式 memory。

运行顺序：

```powershell
node .\src\memory\insert-conversations.mjs
node .\src\memory\retrieval-memory.mjs
```

第一步把历史对话写入 Milvus：

```js
const conversationData = await Promise.all(
  conversations.map(async (conv) => ({
    ...conv,
    vector: await getEmbedding(conv.content),
  })),
);

await client.insert({
  collection_name: COLLECTION_NAME,
  data: conversationData,
});
```

第二步根据当前问题检索相关历史：

```js
const queryVector = await getEmbedding(query);

const searchResult = await client.search({
  collection_name: COLLECTION_NAME,
  vector: queryVector,
  limit: k,
  metric_type: MetricType.COSINE,
  output_fields: ["id", "content", "round", "timestamp"],
});
```

然后把检索到的历史拼到 prompt 里：

```js
const contextMessages = relevantHistory
  ? [
      new HumanMessage(
        `相关历史对话：\n${relevantHistory}\n\n用户问题: ${input}`,
      ),
    ]
  : [userMessage];

const response = await model.invoke(contextMessages);
```

最后，当前新对话也会被写回 Milvus：

```js
const conversationText = `用户: ${input}\n助手: ${response.content}`;
const convVector = await getEmbedding(conversationText);

await client.insert({
  collection_name: COLLECTION_NAME,
  data: [{ id: convId, vector: convVector, content: conversationText }],
});
```

这就是一个简化版长期记忆闭环：

```text
用户输入
  -> 当前问题向量化
  -> 从 Milvus 找相关历史
  -> 历史内容加入 prompt
  -> 模型回答
  -> 把新对话写回 Milvus
```

## 三种 Memory 策略对比

| 策略 | 适合场景 | 优点 | 缺点 |
| --- | --- | --- | --- |
| 截断 | 最近几轮上下文 | 简单、稳定、成本低 | 旧信息直接丢失 |
| 总结 | 长对话压缩 | 能保留旧对话主线 | 摘要可能遗漏细节 |
| 检索 | 长期记忆、跨会话回忆 | 只取相关历史，扩展性好 | 依赖 embedding 和向量库 |

实际项目里经常混合使用：

```text
短期记忆：最近 N 条原始消息
中期记忆：旧消息摘要
长期记忆：向量数据库检索结果
```

## 学习建议

建议按这个顺序跑：

```powershell
node .\src\history-test.mjs
node .\src\history-test2.mjs
node .\src\history-test3.mjs
node .\src\memory\truncation-memory.mjs
node .\src\memory\summarization-memory.mjs
node .\src\memory\summarization-memory2.mjs
node .\src\memory\insert-conversations.mjs
node .\src\memory\retrieval-memory.mjs
```

前六个脚本帮助你理解“消息怎么保存、怎么裁剪、怎么总结”。最后两个脚本帮助你理解“长期记忆怎么做成 RAG 检索”。

## 常见问题

### 1. 为什么每次调用都要重新传历史消息？

因为大模型 API 默认是无状态的。它不会自动知道你上一轮说了什么。历史能生效，是因为你把历史消息重新放进了本轮请求。

### 2. `SystemMessage` 要不要存进 history？

当前代码没有把 `SystemMessage` 存进 history，而是在每次调用时手动放到消息数组最前面：

```js
const messages = [systemMessage, ...(await history.getMessages())];
```

这样做的好处是系统提示词稳定、可控，不会和普通聊天历史混在一起。

### 3. 文件历史和数据库历史有什么区别？

文件历史适合本地 demo 或小工具。真实服务里更常见的是 Redis、PostgreSQL、MongoDB 之类的存储，因为它们更容易做并发、查询、备份和权限控制。

### 4. 检索式 memory 和 RAG 有什么关系？

检索式 memory 本质上就是把“历史对话”当成知识库来做 RAG。普通 RAG 检索的是文档，memory 检索的是用户过去说过的话、偏好、任务背景和历史结论。

### 5. 如果 embedding 接口报错怎么办？

`insert-conversations.mjs` 和 `retrieval-memory.mjs` 需要 embedding 模型。如果接口返回欠费、模型不可用或 503，需要换一个可用的 embedding 配置，或者参考 `milvus-test` 里的本地 fallback embedding 做演示兜底。
