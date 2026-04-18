'use client';

import { useState, useCallback } from 'react';
import type { MCPTool, MCPToolResult } from '@/lib/mcp-client';

interface UseMCPReturn {
  tools: MCPTool[];
  loading: boolean;
  error: string | null;
  listTools: () => Promise<void>;
  callTool: (toolName: string, args?: Record<string, unknown>) => Promise<MCPToolResult | null>;
  clearError: () => void;
}

export function useMCP(server: 'espn'): UseMCPReturn {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const listTools = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/mcp/${server}/tools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (response.ok) {
        setTools(data);
      } else {
        setError(data.error || 'Failed to fetch tools');
      }
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [server]);

  const callTool = useCallback(async (toolName: string, args: Record<string, unknown> = {}): Promise<MCPToolResult | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/mcp/${server}/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tool: toolName,
          arguments: args,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        if (data.isError) {
          setError(data.content);
          return null;
        }
        return data;
      } else {
        setError(data.error || 'Failed to call tool');
        return null;
      }
    } catch (err) {
      const errorMessage = `Network error: ${err instanceof Error ? err.message : 'Unknown error'}`;
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, [server]);

  return {
    tools,
    loading,
    error,
    listTools,
    callTool,
    clearError,
  };
}

// Specialized hook for ESPN fantasy operations
export function useESPNFantasy() {
  const mcp = useMCP('espn');
  
  const getRoster = useCallback(async () => {
    return await mcp.callTool('get_roster');
  }, [mcp]);

  const getMatchups = useCallback(async () => {
    return await mcp.callTool('get_matchups');
  }, [mcp]);

  const getLeagueTeams = useCallback(async () => {
    return await mcp.callTool('get_league_teams');
  }, [mcp]);

  const getFreeAgents = useCallback(async (position?: string) => {
    return await mcp.callTool('get_free_agents', position ? { position } : {});
  }, [mcp]);

  return {
    ...mcp,
    getRoster,
    getMatchups,
    getLeagueTeams,
    getFreeAgents,
  };
}

