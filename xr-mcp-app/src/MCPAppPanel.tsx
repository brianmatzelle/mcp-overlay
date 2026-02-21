import { useMemo } from 'react'
import { AppRenderer } from '@mcp-ui/client'
import type { MCPData } from './hooks/useMCPData.ts'
import './MCPAppPanel.css'

interface MCPAppPanelProps {
  mcpData: MCPData
}

export function MCPAppPanel({ mcpData }: MCPAppPanelProps) {
  const { appHtml, status, error, toolInput, toolResult, handleCallTool, handleReadResource } = mcpData

  const sandboxConfig = useMemo(
    () => ({ url: new URL('/sandbox_proxy.html', window.location.origin) }),
    [],
  )

  if (status === 'error') {
    return (
      <div className="mcp-panel">
        <div className="mcp-status error">{error}</div>
      </div>
    )
  }

  if (!appHtml) {
    return (
      <div className="mcp-panel">
        <div className="mcp-status">
          {status === 'connecting' ? 'Connecting to MCP server...' : 'Loading subway arrivals...'}
        </div>
      </div>
    )
  }

  return (
    <div className="mcp-panel">
      <div className="mcp-app-container">
        <AppRenderer
          toolName="subway-arrivals"
          sandbox={sandboxConfig}
          html={appHtml}
          toolInput={toolInput}
          toolResult={toolResult as any}
          onCallTool={handleCallTool as any}
          onReadResource={handleReadResource as any}
          onError={(err: unknown) => console.error('MCP App error:', err)}
        />
      </div>
    </div>
  )
}
