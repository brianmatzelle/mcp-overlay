'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import { LessonStage } from '@/components/lesson';
import { BottomDrawer } from '@/components/drawer';
import { MinimalHeader } from '@/components/layout';
import { HistoryPopover } from '@/components/layout';
import { getUIConfig } from '@/lib/config';
import type { ContentBlock, ToolCall, ViewState, DrawerState, LessonData, LoadingProgress } from '@/components/chat/types';

export default function ChatInterface() {
  const {
    messages,
    conversationHistory,
    conversations,
    currentConversationId,
    addMessage,
    updateMessage,
    addToConversationHistory,
    loadConversation,
    startNewConversation,
    deleteConversation,
  } = useChat();

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [drawerState, setDrawerState] = useState<DrawerState>('peek');
  const [currentLesson, setCurrentLesson] = useState<LessonData | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const toolUiMapRef = useRef<Record<string, string>>({});

  const uiConfig = getUIConfig();

  // When loading a conversation, scan messages for lesson data to restore view state
  useEffect(() => {
    if (messages.length === 0) {
      setViewState('idle');
      setCurrentLesson(null);
      return;
    }

    // Find the last assistant message with resourceHtml
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.type === 'assistant' && msg.contentBlocks) {
        const lessonBlock = msg.contentBlocks.find(
          (b) => b.type === 'tool_call' && b.toolCall?.resourceHtml
        );
        if (lessonBlock && lessonBlock.toolCall) {
          setCurrentLesson({
            toolCall: lessonBlock.toolCall,
            assistantMessageId: msg.id,
            timestamp: msg.timestamp,
          });
          setViewState('lesson-active');
          setDrawerState('peek');
          return;
        }
      }
    }

    // Messages exist but no lesson — show drawer at partial so user can see conversation
    if (!isLoading) {
      setViewState('idle');
      setCurrentLesson(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConversationId]); // Only re-scan when conversation changes

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;

      const userMessage = input.trim();
      setInput('');
      setIsLoading(true);
      setViewState('loading');
      setLoadingProgress({ phase: 'thinking', streamingText: '' });

      // If we were in idle, start showing the drawer
      if (drawerState === 'collapsed' || viewState === 'idle') {
        setDrawerState('peek');
      }

      addMessage({
        type: 'user',
        content: userMessage,
      });

      abortControllerRef.current = new AbortController();

      const assistantMessageId = addMessage({
        type: 'assistant',
        content: '',
        isStreaming: true,
        contentBlocks: [],
      });

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMessage,
            conversationHistory,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to get response');
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) throw new Error('No response body');

        let buffer = '';
        let currentContent = '';
        let currentContentBlocks: ContentBlock[] = [];
        let currentTextBlockId: string | null = null;
        let foundLesson = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const eventData = JSON.parse(line.slice(6));

                switch (eventData.type) {
                  case 'tool_ui_metadata':
                    toolUiMapRef.current = eventData.data.toolUiMap;
                    break;

                  case 'text_start':
                    currentTextBlockId = `text-${Date.now()}-${Math.random()}`;
                    currentContentBlocks = [
                      ...currentContentBlocks,
                      { type: 'text', id: currentTextBlockId, content: '' },
                    ];
                    break;

                  case 'text_delta':
                    currentContent += eventData.data.text;
                    if (currentTextBlockId) {
                      currentContentBlocks = currentContentBlocks.map((block) =>
                        block.id === currentTextBlockId
                          ? { ...block, content: (block.content || '') + eventData.data.text }
                          : block
                      );
                    }
                    updateMessage(assistantMessageId, {
                      content: currentContent,
                      isStreaming: true,
                      contentBlocks: currentContentBlocks,
                    });
                    setLoadingProgress((prev) =>
                      prev ? { ...prev, streamingText: currentContent } : prev
                    );
                    break;

                  case 'text_stop':
                    currentTextBlockId = null;
                    break;

                  case 'tool_use_start': {
                    const newTool: ToolCall = {
                      id: eventData.data.tool.id,
                      name: eventData.data.tool.name,
                      input: eventData.data.tool.input,
                      status: 'executing',
                      resourceUri: toolUiMapRef.current[eventData.data.tool.name],
                    };
                    currentContentBlocks = [
                      ...currentContentBlocks,
                      { type: 'tool_call', id: eventData.data.tool.id, toolCall: newTool },
                    ];
                    updateMessage(assistantMessageId, {
                      content: currentContent,
                      isStreaming: true,
                      contentBlocks: currentContentBlocks,
                    });
                    // Transition to loading when tool starts
                    if (viewState !== 'lesson-active') {
                      setViewState('loading');
                    }
                    setLoadingProgress((prev) =>
                      prev
                        ? { ...prev, phase: 'rendering', toolName: eventData.data.tool.name }
                        : prev
                    );
                    break;
                  }

                  case 'tool_execution_start':
                    currentContentBlocks = currentContentBlocks.map((block) => {
                      if (block.type === 'tool_call' && block.toolCall?.id === eventData.data.tool_id) {
                        return {
                          ...block,
                          toolCall: { ...block.toolCall, status: 'executing' as const },
                        } as ContentBlock;
                      }
                      return block;
                    });
                    updateMessage(assistantMessageId, {
                      content: currentContent,
                      isStreaming: true,
                      contentBlocks: currentContentBlocks,
                    });
                    break;

                  case 'tool_execution_complete':
                    currentContentBlocks = currentContentBlocks.map((block) => {
                      if (block.type === 'tool_call' && block.toolCall?.id === eventData.data.tool_id) {
                        return {
                          ...block,
                          toolCall: {
                            ...block.toolCall,
                            status: 'completed' as const,
                            result: eventData.data.result,
                            resourceHtml: eventData.data.resourceHtml,
                          },
                        } as ContentBlock;
                      }
                      return block;
                    });

                    updateMessage(assistantMessageId, {
                      content: currentContent,
                      isStreaming: true,
                      contentBlocks: currentContentBlocks,
                    });

                    setLoadingProgress((prev) =>
                      prev ? { ...prev, phase: 'finalizing' } : prev
                    );

                    // If this tool produced resourceHtml, it's a lesson!
                    if (eventData.data.resourceHtml) {
                      const completedBlock = currentContentBlocks.find(
                        (b) => b.type === 'tool_call' && b.toolCall?.id === eventData.data.tool_id
                      );
                      if (completedBlock?.toolCall) {
                        setCurrentLesson({
                          toolCall: completedBlock.toolCall,
                          assistantMessageId,
                          timestamp: new Date(),
                        });
                        setViewState('lesson-active');
                        setDrawerState('peek');
                        foundLesson = true;
                      }
                    }
                    break;

                  case 'tool_execution_error':
                    currentContentBlocks = currentContentBlocks.map((block) => {
                      if (block.type === 'tool_call' && block.toolCall?.id === eventData.data.tool_id) {
                        return {
                          ...block,
                          toolCall: {
                            ...block.toolCall,
                            status: 'error' as const,
                            error: eventData.data.error,
                          },
                        } as ContentBlock;
                      }
                      return block;
                    });
                    updateMessage(assistantMessageId, {
                      content: currentContent,
                      isStreaming: true,
                      contentBlocks: currentContentBlocks,
                    });
                    break;

                  case 'complete':
                    updateMessage(assistantMessageId, {
                      content: currentContent,
                      isStreaming: false,
                      contentBlocks: currentContentBlocks,
                    });
                    addToConversationHistory(userMessage, currentContent);
                    setLoadingProgress(null);

                    // If no lesson was produced, show text in drawer
                    if (!foundLesson && viewState === 'loading') {
                      setViewState('idle');
                      setDrawerState('peek');
                    }
                    break;

                  case 'error':
                    throw new Error(eventData.data.error);
                }
              } catch (parseError) {
                console.error('Error parsing streaming data:', parseError);
              }
            }
          }
        }
      } catch (err) {
        console.error('Chat error:', err);

        if (err instanceof Error && err.name === 'AbortError') {
          updateMessage(assistantMessageId, {
            content: 'Request cancelled',
            isStreaming: false,
          });
        } else {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
          updateMessage(assistantMessageId, {
            content: `I apologize, but I encountered an error: ${errorMessage}. Please try again.`,
            isStreaming: false,
          });
        }

        // Revert view state on error
        setLoadingProgress(null);
        if (!currentLesson) {
          setViewState('idle');
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [input, isLoading, conversationHistory, viewState, drawerState, currentLesson, addMessage, updateMessage, addToConversationHistory]
  );

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  }, []);

  const handlePromptClick = useCallback(
    (prompt: string) => {
      setInput(prompt);
      // Auto-submit the prompt after state update
      setTimeout(() => {
        const form = document.querySelector('[data-idle-form]') as HTMLFormElement;
        if (form) form.requestSubmit();
      }, 0);
    },
    []
  );

  const handleNewChat = useCallback(() => {
    startNewConversation();
    setViewState('idle');
    setCurrentLesson(null);
    setLoadingProgress(null);
    setDrawerState('peek');
    setIsHistoryOpen(false);
  }, [startNewConversation]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      loadConversation(id);
      setIsHistoryOpen(false);
    },
    [loadConversation]
  );

  // For idle state: handle form submission from the pill input
  const handleIdleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;
      handleSubmit(e);
    },
    [input, isLoading, handleSubmit]
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      <MinimalHeader
        onToggleHistory={() => setIsHistoryOpen(!isHistoryOpen)}
        onNewChat={handleNewChat}
      />

      <main className="flex-1 min-h-0 relative">
        <LessonStage
          viewState={viewState}
          lessonData={currentLesson}
          loadingProgress={loadingProgress}
          onPromptClick={handlePromptClick}
        />
      </main>

      {/* Idle state: pill-shaped input bar at bottom */}
      {viewState === 'idle' && (
        <div className="flex-shrink-0 pt-2 px-3 sm:px-6" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}>
          <form
            data-idle-form
            onSubmit={handleIdleSubmit}
            className="max-w-2xl mx-auto flex items-center gap-2 idle-input-glow rounded-full bg-[var(--surface)] border border-white/10 px-3 sm:px-4 py-2 transition-all focus-within:border-primary/40"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleIdleSubmit(e);
                }
              }}
              placeholder={uiConfig.inputPlaceholder}
              className="flex-1 bg-transparent text-foreground text-sm outline-none placeholder:text-foreground-muted/50 min-w-0"
              autoFocus
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-primary text-white disabled:opacity-30 disabled:cursor-not-allowed transition-opacity flex-shrink-0"
            >
              <ArrowUp size={16} />
            </button>
          </form>
        </div>
      )}

      {/* Bottom drawer: visible when not idle */}
      {viewState !== 'idle' && (
        <BottomDrawer
          drawerState={drawerState}
          onDrawerStateChange={setDrawerState}
          messages={messages}
          input={input}
          onInputChange={setInput}
          onSubmit={handleSubmit}
          onStop={handleStop}
          isLoading={isLoading}
        />
      )}

      {/* History popover */}
      {isHistoryOpen && (
        <HistoryPopover
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewChat}
          onDeleteConversation={deleteConversation}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}
    </div>
  );
}
