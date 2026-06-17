import {
  getToolName,
  isToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from 'ai'
import { StreamdownText } from './StreamdownText'
import './MessagePart.css'

type AnyToolPart = ToolUIPart | DynamicToolUIPart

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

type WebSearchInput = {
  query: string
  count?: number
}

type WebSearchResult = {
  ref: string
  title: string
  url: string
  summary: string
  siteName?: string
  publishedAt?: string
}

export type MessagePartProps = {
  part: UIMessage['parts'][number]
  textStreamActive?: boolean
}

export function MessagePart({ part, textStreamActive = false }: MessagePartProps) {
  if (part.type === 'text') {
    return (
      <StreamdownText isStreaming={textStreamActive}>{part.text}</StreamdownText>
    )
  }

  if (part.type === 'reasoning') {
    return (
      <details className="reasoning-panel">
        <summary>推理过程</summary>
        <StreamdownText isStreaming={part.state === 'streaming'}>
          {part.text}
        </StreamdownText>
      </details>
    )
  }

  if (isToolUIPart(part)) {
    return <ToolPart part={part} />
  }

  if (part.type === 'source-url') {
    return (
      <a className="source-chip" href={part.url} target="_blank" rel="noreferrer">
        {part.title ?? part.url}
      </a>
    )
  }

  if (part.type === 'file') {
    return (
      <a className="source-chip" href={part.url} target="_blank" rel="noreferrer">
        {part.filename ?? part.mediaType}
      </a>
    )
  }

  return null
}

function ToolPart({ part }: { part: AnyToolPart }) {
  const name = getToolName(part)

  if (part.state === 'output-error') {
    return (
      <div className="tool-card tool-card--error" role="alert">
        <ToolHeader label={name} title="工具执行失败" />
        <p>{part.errorText ?? '工具返回了错误，但没有提供详细信息。'}</p>
      </div>
    )
  }

  if (part.state !== 'output-available') {
    return (
      <div className="tool-card tool-card--pending" aria-busy="true">
        <ToolHeader label={name} title="正在调用工具" />
        <p>{getPendingText(name, streamValueToJson(readInput(part)))}</p>
      </div>
    )
  }

  const input = streamValueToJson(readInput(part))
  const output = part.output

  if (name === 'web_search') {
    const webInput = parseWebSearchInput(input)
    const outputText = stringifyToolValue(output)
    const results = parseWebSearchResults(outputText)

    return (
      <div className="tool-card tool-card--search">
        <ToolHeader
          label="web_search"
          title={webInput?.query ? `联网搜索：${webInput.query}` : '联网搜索'}
        />
        {results.length > 0 ? (
          <ul className="search-results">
            {results.map((result, index) => (
              <li key={`${result.ref}-${result.url}-${index}`}>
                <div className="search-result-topline">
                  {result.ref ? <span>引用 {result.ref}</span> : null}
                  {result.siteName ? <span>{result.siteName}</span> : null}
                </div>
                {result.title ? <strong>{result.title}</strong> : null}
                {result.url ? (
                  <a href={result.url} target="_blank" rel="noreferrer">
                    {result.url}
                  </a>
                ) : null}
                {result.summary ? <p>{result.summary}</p> : null}
                {result.publishedAt ? <time>{result.publishedAt}</time> : null}
              </li>
            ))}
          </ul>
        ) : (
          <pre className="tool-raw">{outputText}</pre>
        )}
      </div>
    )
  }

  return (
    <div className="tool-card">
      <ToolHeader label={name} title="工具输出" />
      <pre className="tool-raw">{stringifyToolValue(output)}</pre>
    </div>
  )
}

function ToolHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="tool-header">
      <span>{label}</span>
      <strong>{title}</strong>
    </div>
  )
}

function readInput(part: AnyToolPart) {
  return 'input' in part ? part.input : undefined
}

function getPendingText(name: string, input: JsonValue | undefined) {
  if (name === 'web_search') {
    const webInput = parseWebSearchInput(input)
    return webInput?.query ? `正在搜索「${webInput.query}」...` : '正在准备搜索参数...'
  }
  return '工具参数正在生成，请稍候...'
}

// AI SDK 的 dynamic tool 输入输出类型是 unknown，这里只在展示层做安全收窄。
function streamValueToJson(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (Array.isArray(value)) return value as JsonValue[]
  if (typeof value === 'object') return value as { [key: string]: JsonValue }
  return undefined
}

function parseWebSearchInput(input: JsonValue | undefined): WebSearchInput | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const record = input as Record<string, JsonValue>
  if (typeof record.query !== 'string' || record.query.trim().length === 0) {
    return undefined
  }
  return {
    query: record.query,
    count: typeof record.count === 'number' ? record.count : undefined,
  }
}

function stringifyToolValue(value: unknown) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function parseWebSearchResults(text: string): WebSearchResult[] {
  return text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({
      ref: pickLine(block, '引用'),
      title: pickLine(block, '标题'),
      url: pickLine(block, 'URL'),
      summary: pickMultiline(block, '摘要', ['网站名称', '网站图标', '发布时间']),
      siteName: pickLine(block, '网站名称'),
      publishedAt: pickLine(block, '发布时间'),
    }))
    .filter((item) => item.title || item.url || item.summary)
}

function pickLine(block: string, label: string) {
  const match = block.match(new RegExp(`${label}:\\s*(.+)`))
  return match?.[1]?.replace(/\u00a0/g, ' ').trim() ?? ''
}

function pickMultiline(block: string, label: string, stopLabels: string[]) {
  const stops = stopLabels.map((stopLabel) => `\\n\\s*${stopLabel}:`).join('|')
  const match = block.match(new RegExp(`${label}:\\s*([\\s\\S]*?)(?=${stops}|$)`))
  return match?.[1]?.replace(/\u00a0/g, ' ').trim() ?? ''
}
