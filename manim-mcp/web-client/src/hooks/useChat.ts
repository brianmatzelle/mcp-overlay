import { useState, useRef, useEffect, useCallback } from 'react';
import { type Message, type Conversation } from '../components/chat/types';
import {
  getConversations,
  saveConversation,
  deleteConversation as deleteConversationFromStorage,
  getConversation,
  generateConversationId,
} from '../services/chatStorage';

export interface UseChatReturn {
  messages: Message[];
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  conversations: Conversation[];
  currentConversationId: string | null;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  clearChat: () => void;
  addToConversationHistory: (userMessage: string, assistantMessage: string) => void;
  loadConversation: (id: string) => void;
  startNewConversation: () => void;
  deleteConversation: (id: string) => void;
  refreshConversations: () => void;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  // Use refs to track current values synchronously (avoids stale closure issues)
  const currentConversationIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const conversationHistoryRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  const messageCounterRef = useRef<number>(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    conversationHistoryRef.current = conversationHistory;
  }, [conversationHistory]);

  // Load conversations from localStorage on mount
  useEffect(() => {
    const loaded = getConversations();
    setConversations(loaded);
  }, []);

  // Save and refresh conversations list
  const saveAndRefresh = useCallback(
    (convId: string, msgs: Message[], history: Array<{ role: 'user' | 'assistant'; content: string }>) => {
      if (msgs.length > 0) {
        saveConversation(convId, msgs, history);
        setConversations(getConversations());
      }
    },
    []
  );

  // Debounced save function
  const debouncedSave = useCallback(
    (convId: string, msgs: Message[], history: Array<{ role: 'user' | 'assistant'; content: string }>) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveAndRefresh(convId, msgs, history);
      }, 500);
    },
    [saveAndRefresh]
  );

  const addMessage = (message: Omit<Message, 'id' | 'timestamp'>) => {
    messageCounterRef.current += 1;
    const newMessage: Message = {
      ...message,
      id: `message-${messageCounterRef.current}-${Date.now()}`,
      timestamp: new Date(),
    };

    // Create a new conversation ID if we don't have one (synchronously via ref)
    let convId = currentConversationIdRef.current;
    if (!convId) {
      convId = generateConversationId();
      currentConversationIdRef.current = convId;
      setCurrentConversationId(convId);
    }

    setMessages((prev) => {
      const updated = [...prev, newMessage];
      messagesRef.current = updated;
      return updated;
    });

    return newMessage.id;
  };

  const updateMessage = (id: string, updates: Partial<Message>) => {
    setMessages((prev) => {
      const updated = prev.map((msg) => (msg.id === id ? { ...msg, ...updates } : msg));
      messagesRef.current = updated;

      // Save after streaming completes (when isStreaming becomes false)
      const convId = currentConversationIdRef.current;
      if (convId && updates.isStreaming === false) {
        debouncedSave(convId, updated, conversationHistoryRef.current);
      }

      return updated;
    });
  };

  const clearChat = () => {
    setMessages([]);
    setConversationHistory([]);
    setCurrentConversationId(null);
    currentConversationIdRef.current = null;
    messagesRef.current = [];
    conversationHistoryRef.current = [];
    messageCounterRef.current = 0;
  };

  const startNewConversation = () => {
    clearChat();
  };

  const addToConversationHistory = (userMessage: string, assistantMessage: string) => {
    setConversationHistory((prev) => {
      const updated = [
        ...prev,
        { role: 'user' as const, content: userMessage },
        { role: 'assistant' as const, content: assistantMessage },
      ];
      conversationHistoryRef.current = updated;

      // Save the conversation with updated history
      const convId = currentConversationIdRef.current;
      if (convId) {
        debouncedSave(convId, messagesRef.current, updated);
      }

      return updated;
    });
  };

  const loadConversation = (id: string) => {
    const conversation = getConversation(id);
    if (conversation) {
      setMessages(conversation.messages);
      setConversationHistory(conversation.conversationHistory);
      setCurrentConversationId(id);

      // Update refs synchronously
      messagesRef.current = conversation.messages;
      conversationHistoryRef.current = conversation.conversationHistory;
      currentConversationIdRef.current = id;

      // Update counter based on existing messages
      messageCounterRef.current = conversation.messages.length;
    }
  };

  const deleteConversation = (id: string) => {
    deleteConversationFromStorage(id);
    setConversations(getConversations());

    // If we deleted the current conversation, clear the chat
    if (currentConversationIdRef.current === id) {
      clearChat();
    }
  };

  const refreshConversations = () => {
    setConversations(getConversations());
  };

  return {
    messages,
    conversationHistory,
    conversations,
    currentConversationId,
    addMessage,
    updateMessage,
    clearChat,
    addToConversationHistory,
    loadConversation,
    startNewConversation,
    deleteConversation,
    refreshConversations,
  };
}
