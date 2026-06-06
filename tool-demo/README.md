# tools

mjs 是 es module 格式的 js 文件的意思，可以用 import、export 语法

具体的消息有四种：
SystemMessage、HumanMessage、AIMessage、ToolMessageSystemMessage：设置 AI 是谁，可以干什么，有什么能力，以及一些回答、行为的规范等
HumanMessage：用户输入的信息
AIMessage：AI 的回复信息
ToolMessage：调用工具的结果返回

我们用 system message 告诉 ai，它是一个代码助手，可以读取文件并解释代码内容，给出建议

node里如何执行命令呢？
用child_process 这个内置模块。

创建 src/node-exec.mjs

```js
import { spawn } from "node:child_process";

const command = "ls -la";
const cwd = process.cwd();

// 解析命令和参数
const [cmd, ...args] = command.split(" ");

const child = spawn(cmd, args, {
  cwd,
  stdio: "inherit", // 实时输出到控制台
  shell: true,
});

let errorMsg = "";

child.on("error", (error) => {
  errorMsg = error.message;
});

child.on("close", (code) => {
  if (code === 0) {
    process.exit(0);
  } else {
    if (errorMsg) {
      console.error(`错误: ${errorMsg}`);
    }
    process.exit(code || 1);
  }
});
```

我们已经写了一些 tool 了：读写文件和目录、执行命令

只要声明 tool 的名字、描述、参数格式，模型会在发现需要用 tool 的时候自动解析出参数传入来调用，然后把执行结果封装成 ToolMessage 传入 chat。

比如上节我们实现了简易的 cursor，就是声明了读写文件和目录、执行命令的 tool，这样你让大模型创建 react + vite 项目，它就会自动判断什么时候调用哪个 tool，自动实现目录、文件的创建，以及 pnpm install 和 pnpn run dev 的执行。

我们只是告诉他要创建的项目，然后安装依赖跑起来。这些 tool 怎么调用、参数是什么都是大模型自己决定的。

tool 给大模型扩展了做事情的能力，本来它只能思考，不能做事情，但是现在可以自己调用 tool 来帮你做事情了。但你有没有发现 tool 有个问题：node 写的 ai agent 的代码，你的 tool 也得是 node 写。如果你之前有一些工具是 java、python、rust 写的呢？你想封装成 tool 怎么办呢？有的同学说：现在不是可以执行命令么，通过单独进程把这些其他语言写的代码跑一下就行啊。确实，也就是这样：

这里的 stdio 就是标准输入输出流，也就是键盘输入、控制台输出。当你进程跑一个子进程，就可以用这种方式通信。还有的同学说：简单，用 http 啊！本地跑个服务就好了。也就是这样：

现在是解决了跨语言调用工具的问题。那如果每个人都这样搞，它们提供的服务都不一样，我想接入别的 tool，是不是要了解每个服务都是怎么定义的呢？能不能定义一个统一的通信协议，我们都按照这个格式来沟通，这样所有的跨进程工具调用就都可以接入了。也就是这样：

想跨进程调用某个工具，通过这个协议通信就行。不管是本地工具，直接跑那个进程，然后 stdio 通信。还是远程工具，通过 http 连接远程服务进程。这个协议叫什么呢？是给 Model 扩展 Context 上下文，让它能做的更多，知道的更多的 Protocal 协议。就叫 MCP 吧。恭喜你，你发明了 MCP！

MCP 最大的特点就是可以跨进程调用工具。

跨本地的进程调用，就是用 stdio。跨远程的进程调用，就是用 http。提到 MCP 都会提到这张图：

![image.png](./imgs/640.png)

安装 mcp 的包：
pnpm install @modelcontextprotocol/sdk

参考代码，my-mcp-server.mjs

![mcp代码](./imgs/619a4d1e-de9a-477d-9cc7-988826b19728.png)

这就是 mcp 的好处，写好之后可以插拔到任何地方当 tool 用。

那 resource 呢？它其实不是用来作为 tool 触发的，主要是你可以引用用来写 prompt 之类的。
