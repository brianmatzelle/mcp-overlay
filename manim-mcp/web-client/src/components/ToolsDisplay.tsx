'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Wrench, X, RefreshCw, AlertTriangle, Cog, ChevronUp, ChevronDown } from 'lucide-react';

interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface ToolsData {
  tools: Tool[];
  source: 'mcp-server' | 'fallback';
  error?: string;
}

export default function ToolsDisplay() {
  const [isOpen, setIsOpen] = useState(false);
  const [toolsData, setToolsData] = useState<ToolsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  const fetchTools = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/tools');
      const data = await response.json();
      setToolsData(data);
    } catch (error) {
      console.error('Failed to fetch tools:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !toolsData) {
      fetchTools();
    }
  }, [isOpen, toolsData]);

  const formatJson = (obj: unknown) => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200",
          isOpen
            ? "bg-[#697565] hover:bg-[#697565]/90"
            : "bg-[#1A1C20] hover:bg-[#1A1C20]/80 border border-[#697565]/30"
        )}
        title="View available tools"
      >
        <span className="text-[#ECDFCC]">
          {isOpen ? <X size={20} /> : <Wrench size={20} />}
        </span>
      </button>

      {/* Tools Panel */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 w-96 max-h-[80vh] overflow-hidden rounded-2xl shadow-2xl border border-[#1A1C20]/50 bg-[#0F1014]">
          {/* Header */}
          <div className="sticky top-0 bg-[#1A1C20] border-b border-[#1A1C20]/50 px-4 py-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-[#ECDFCC]">Available Tools</h3>
              <button
                onClick={fetchTools}
                disabled={isLoading}
                className="text-xs text-[#C4B8A8] hover:text-[#ECDFCC] transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
            {toolsData?.source && (
              <div className="mt-1 flex items-center gap-2">
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full",
                  toolsData.source === 'mcp-server'
                    ? "bg-green-500/20 text-green-400"
                    : "bg-yellow-500/20 text-yellow-400"
                )}>
                  {toolsData.source === 'mcp-server' ? '● Connected' : '○ Fallback'}
                </span>
                {toolsData.error && (
                  <span className="text-xs text-red-400 flex items-center gap-1" title={toolsData.error}>
                    <AlertTriangle size={12} /> Error
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Tools List */}
          <div className="overflow-y-auto max-h-[calc(80vh-80px)]">
            {isLoading && !toolsData ? (
              <div className="p-8 text-center text-[#C4B8A8]">
                <div className="w-8 h-8 border-2 border-[#697565] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                Loading tools...
              </div>
            ) : toolsData?.tools && toolsData.tools.length > 0 ? (
              <div className="p-3 space-y-2">
                {toolsData.tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="bg-[#1A1C20]/50 rounded-lg border border-[#1A1C20]/30 overflow-hidden"
                  >
                    {/* Tool Header */}
                    <button
                      onClick={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-[#1A1C20]/80 transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Cog size={12} className="text-[#697565]" />
                        <span className="text-sm font-medium text-[#ECDFCC] truncate">
                          {tool.name}
                        </span>
                      </div>
                      <span className="text-[#C4B8A8]/60">
                        {expandedTool === tool.name ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </button>

                    {/* Tool Details */}
                    {expandedTool === tool.name && (
                      <div className="px-3 pb-3 space-y-2 border-t border-[#1A1C20]/30">
                        <div>
                          <p className="text-xs text-[#C4B8A8]/80 mt-2">
                            {tool.description}
                          </p>
                        </div>

                        {tool.inputSchema && (
                          <div>
                            <h4 className="text-xs font-medium text-[#C4B8A8]/90 mb-1">
                              Input Schema:
                            </h4>
                            <pre className="text-xs text-[#C4B8A8]/70 bg-[#0F1014] rounded p-2 overflow-x-auto">
                              <code>{formatJson(tool.inputSchema)}</code>
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-[#C4B8A8]">
                No tools available
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
