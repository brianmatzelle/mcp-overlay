import { useState, useEffect, useCallback, useMemo } from 'react'
import { MCPClient } from '../mcp.ts'
import type { ToolResult } from '../mcp.ts'

export type MCPStatus = 'connecting' | 'loading' | 'ready' | 'error'

export interface MCPData {
  client: MCPClient | null
  toolResult: ToolResult | null
  /** Raw JSON content text from tool result (for 3D rendering) */
  toolResultContent: string | null
  appHtml: string | null
  status: MCPStatus
  error: string
  toolInput: Record<string, unknown>
  handleCallTool: (params: { name: string; arguments?: Record<string, unknown> }) => Promise<ToolResult>
  handleReadResource: (params: { uri: string }) => Promise<unknown>
}

export function useMCPData(): MCPData {
  const [client, setClient] = useState<MCPClient | null>(null)
  const [appHtml, setAppHtml] = useState<string | null>(null)
  const [status, setStatus] = useState<MCPStatus>('connecting')
  const [error, setError] = useState('')
  const [toolResult, setToolResult] = useState<ToolResult | null>(null)
  const [toolResultContent, setToolResultContent] = useState<string | null>(null)

  const toolInput = useMemo(() => ({ line: 'G', station: 'Greenpoint Av' }), [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const c = new MCPClient('/mcp')
        await c.connect()
        if (cancelled) return
        setClient(c)
        setStatus('loading')

        const res = await c.callTool('subway-arrivals', toolInput)
        if (cancelled) return
        setToolResult(res)

        // Extract raw content text for 3D rendering
        const contentText = res?.content?.[0]?.text
        if (contentText) {
          setToolResultContent(contentText)
        }

        // Fetch HTML for browser-mode AppRenderer
        const uri = res?.structuredContent?.resource?.uri
        if (uri) {
          const resourceResult = await c.readResource(uri)
          const html = resourceResult?.contents?.[0]?.text
          if (html && !cancelled) {
            setAppHtml(html)
          }
        }

        if (!cancelled) {
          setStatus('ready')
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setStatus('error')
        }
      }
    }

    init()
    return () => { cancelled = true }
  }, [toolInput])

  const handleCallTool = useCallback(
    async (params: { name: string; arguments?: Record<string, unknown> }) => {
      if (!client) throw new Error('Not connected')
      return client.callTool(params.name, params.arguments || {})
    },
    [client],
  )

  const handleReadResource = useCallback(
    async (params: { uri: string }) => {
      if (!client) throw new Error('Not connected')
      return client.readResource(params.uri)
    },
    [client],
  )

  return {
    client,
    toolResult,
    toolResultContent,
    appHtml,
    status,
    error,
    toolInput,
    handleCallTool,
    handleReadResource,
  }
}
