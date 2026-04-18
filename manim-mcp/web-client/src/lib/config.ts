import type { Config } from '@/types/config';
import configData from '../../config.json';

// Load and validate config
export const config: Config = configData as Config;

// Helper functions to access config values
export const getAppConfig = () => config.app;
export const getThemeConfig = () => config.theme;
export const getAIConfig = () => config.ai;
export const getUIConfig = () => config.ui;

// Get primary MCP server
export const getPrimaryMCPServer = () => config.mcp.servers.primary;

// Get MCP server by ID
export const getMCPServer = (serverId: string) => {
  if (serverId === 'primary') {
    return config.mcp.servers.primary;
  }
  return config.mcp.servers[serverId];
};

/**
 * Get the MCP server URL, with environment variable override support.
 * 
 * Environment variables checked (in order of priority):
 * 1. NEXT_PUBLIC_MCP_SERVER_URL - Simple override for the primary server URL
 * 2. Server URL from config.json as fallback
 * 
 * For local development: NEXT_PUBLIC_MCP_SERVER_URL=http://localhost:8000
 * For production: NEXT_PUBLIC_MCP_SERVER_URL=https://api.startingsoftware.com
 */
export const getMCPServerURL = (serverId: string = 'primary') => {
  const server = getMCPServer(serverId);
  if (!server) {
    throw new Error(`MCP server '${serverId}' not found in config`);
  }
  
  // Check for environment variable override (simple single env var)
  const envUrl = process.env.NEXT_PUBLIC_MCP_SERVER_URL;
  
  const baseUrl = envUrl || server.url;
  return `${baseUrl}${server.endpoint}`;
};

// Get MCP config with dynamic URL resolution
export const getMCPConfig = () => {
  const baseConfig = config.mcp;
  
  // Override primary server URL if env var is set
  const envUrl = process.env.NEXT_PUBLIC_MCP_SERVER_URL;
  if (envUrl) {
    return {
      ...baseConfig,
      servers: {
        ...baseConfig.servers,
        primary: {
          ...baseConfig.servers.primary,
          url: envUrl
        }
      }
    };
  }
  
  return baseConfig;
};

export default config;

