import { createCodePlugin } from '@streamdown/code'
import { mermaid } from '@streamdown/mermaid'
import { Streamdown, type ThemeInput } from 'streamdown'
import 'streamdown/styles.css'
import './StreamdownText.css'

const shikiTheme: [ThemeInput, ThemeInput] = ['github-light', 'github-dark']
const codePlugin = createCodePlugin({ themes: shikiTheme })

export type StreamdownTextProps = {
  children: string
  isStreaming?: boolean
}

export function StreamdownText({
  children,
  isStreaming = false,
}: StreamdownTextProps) {
  return (
    <div className="streamdown-wrap">
      <Streamdown
        mode="streaming"
        isAnimating={isStreaming}
        parseIncompleteMarkdown
        shikiTheme={shikiTheme}
        plugins={{ mermaid, code: codePlugin }}
        className="streamdown-content"
      >
        {children}
      </Streamdown>
    </div>
  )
}
