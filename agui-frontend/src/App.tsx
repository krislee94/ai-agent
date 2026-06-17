import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MessagePart } from './components/MessagePart'
import './App.css'

const CHAT_API = '/ai/chat'

const EXAMPLE_PROMPTS = [
  '帮我总结一下 Vercel AI SDK 的前端聊天流程',
  '联网查一下今天 AI 行业有什么重要新闻',
  '用表格比较一下 LangChain 和 Vercel AI SDK 的适用场景',
]

export default function App() {
  const [input, setInput] = useState('')
  const viewportRef = useRef<HTMLDivElement>(null)

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: CHAT_API,
        // 后端接口与 curl demo 保持一致：只接收 { messages }。
        // AI SDK 默认还会带 id/trigger/messageId，这里裁掉，避免后端协议被隐式字段绑住。
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { messages },
        }),
      }),
    [],
  )

  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    clearError,
    regenerate,
  } = useChat<UIMessage>({
    transport,
  })

  const busy = status === 'submitted' || status === 'streaming'
  const canSend = status === 'ready' && input.trim().length > 0
  const lastAssistant = messages.filter((message) => message.role === 'assistant').at(-1)

  // 新消息和流式片段到达时，自动把视口带到最新回答附近。
  useEffect(() => {
    viewportRef.current?.scrollTo({
      top: viewportRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, status])

  async function submitMessage(text = input) {
    const content = text.trim()
    if (status !== 'ready' || content.length === 0) return
    clearError()
    setInput('')
    await sendMessage({ text: content })
  }

  return (
    <main className="chat-shell">
      <aside className="chat-sidebar" aria-label="聊天信息">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">
            AI
          </span>
          <div>
            <h1>AGUI Chat</h1>
            <p>基于 Vercel AI SDK 的本地智能助手</p>
          </div>
        </div>

        <dl className="endpoint-card">
          <div>
            <dt>接口</dt>
            <dd>{CHAT_API}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{getStatusLabel(status)}</dd>
          </div>
        </dl>

        <div className="prompt-panel">
          <h2>试试这些问题</h2>
          <div className="prompt-list">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void submitMessage(prompt)}
                disabled={status !== 'ready'}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="chat-main" aria-label="AI 聊天窗口">
        <header className="chat-topbar">
          <div>
            <span className="eyebrow">Local AI Agent</span>
            <h2>和助手对话</h2>
          </div>
          <div className={`status-pill status-pill--${status}`} role="status">
            <span aria-hidden="true" />
            {getStatusLabel(status)}
          </div>
        </header>

        <div ref={viewportRef} className="message-viewport" role="log" aria-live="polite">
          {messages.length === 0 ? (
            <section className="empty-state">
              <span className="empty-icon" aria-hidden="true">
                ✦
              </span>
              <h3>开始一次清爽的 AI 对话</h3>
              <p>
                输入你的问题，前端会通过 Vercel AI SDK 调用本地后端并实时渲染流式回复。
              </p>
            </section>
          ) : (
            messages.map((message) => {
              const textPartIndices = message.parts
                .map((part, index) => (part.type === 'text' ? index : -1))
                .filter((index) => index >= 0)
              const lastTextPartIndex = textPartIndices.at(-1)

              return (
                <article
                  key={message.id}
                  className={`message-row message-row--${message.role}`}
                >
                  <div className="message-avatar" aria-hidden="true">
                    {message.role === 'user' ? '你' : 'AI'}
                  </div>
                  <div className="message-stack">
                    <div className="message-meta">
                      {message.role === 'user' ? '你' : 'AI 助手'}
                    </div>
                    <div className="message-bubble">
                      {message.parts.map((part, index) => (
                        <MessagePart
                          key={`${message.id}-${index}`}
                          part={part}
                          textStreamActive={
                            part.type === 'text' &&
                            message.role === 'assistant' &&
                            message.id === lastAssistant?.id &&
                            index === lastTextPartIndex &&
                            busy
                          }
                        />
                      ))}
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>

        {error ? (
          <div className="chat-error" role="alert">
            <div>
              <strong>请求失败</strong>
              <span>{error.message}</span>
            </div>
            <button type="button" onClick={() => clearError()}>
              关闭
            </button>
          </div>
        ) : null}

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault()
            void submitMessage()
          }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void submitMessage()
              }
            }}
            placeholder="输入问题，Enter 发送，Shift + Enter 换行"
            rows={3}
            disabled={status !== 'ready'}
            aria-label="聊天输入"
          />
          <div className="composer-footer">
            <span>{busy ? '正在接收流式回复...' : '支持 Markdown、代码块和联网搜索工具展示'}</span>
            <div className="composer-actions">
              {busy ? (
                <button type="button" className="ghost-button" onClick={() => void stop()}>
                  停止
                </button>
              ) : messages.some((message) => message.role === 'assistant') ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void regenerate()}
                  disabled={status !== 'ready'}
                >
                  重新生成
                </button>
              ) : null}
              <button type="submit" className="send-button" disabled={!canSend}>
                发送
              </button>
            </div>
          </div>
        </form>
      </section>
    </main>
  )
}

function getStatusLabel(status: 'submitted' | 'streaming' | 'ready' | 'error') {
  switch (status) {
    case 'submitted':
      return '已发送'
    case 'streaming':
      return '生成中'
    case 'error':
      return '出错'
    default:
      return '就绪'
  }
}
