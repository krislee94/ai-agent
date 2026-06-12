# Memory

1. 拦截

2. 总结

3. 检索

你用 cursor 或者 claude code 的时候，会有一个 token 的计数，当达到的时候，会触发总结，然后开始新的一轮计数：

达到上下文限制，会自动触发总结。

达到限制自动触发总结，或者也可以 /compact 手动总结（compact 是压实压紧的意思）还有一个问题，就是 messages 存在哪，现在都是存在内存中的，而实际上可以做持久化，存在文件、redis、数据库等。

所以之前 memory 一共有两个维度的 api：

1. ChatMessageHistory ，它是存储层，也就是 messages 存在哪，可以是内存、文件、数据库等。

然后是逻辑层，也就是截断、总结、向量数据库这些：2. BaseMemory ，每个 xxMemory 类都有一个 chatHistory 属性，关联着存储层。

刚才提到的所有 Memory api 都被废弃了：

因为它们不够灵活，像之前提到的截断、总结、检索（向量数据库）完全可以自己实现：

用 memory 这些 api 反而更黑盒而且也不灵活，所以新版干脆都去掉了。但是加了一个 trimMessages 的 api，可以根据 token 来截断消息所以现在 Memory 相关就剩下了 history + trimMessages 的 api
