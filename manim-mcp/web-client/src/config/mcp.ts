// ⚠️ DEPRECATED: This file is no longer used.
// 
// MCP configuration has moved to /config.json at the project root.
// Please use the new config system:
//
// import { getMCPConfig, getMCPServer } from '@/lib/config';
// const mcpConfig = getMCPConfig();
// const primaryServer = getMCPServer('primary');
//
// See CONFIG.md for full documentation.

// Legacy export for backward compatibility
export const MCP_CONFIG = {
  servers: {
    espn: {
      url: process.env.NEXT_PUBLIC_ESPN_MCP_URL || 'https://api.poop.football',
      name: 'ESPN Fantasy Football'
    }
  },
  endpoints: {
    tools: '/tools',
    call: '/call'
  }
} as const;

export type ServerType = keyof typeof MCP_CONFIG.servers;
