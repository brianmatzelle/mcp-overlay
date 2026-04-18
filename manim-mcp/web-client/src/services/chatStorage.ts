import type { Message, Conversation } from '../components/chat/types';

const STORAGE_KEY = 'manim-mcp-conversations';

/**
 * Generate a title from the first user message
 */
function generateTitle(messages: Message[]): string {
  const firstUserMessage = messages.find((m) => m.type === 'user');
  if (!firstUserMessage) return 'New Conversation';

  const content = firstUserMessage.content.trim();
  if (content.length <= 40) return content;
  return content.substring(0, 40) + '...';
}

/**
 * Get all saved conversations from localStorage
 */
export function getConversations(): Conversation[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const conversations: Conversation[] = JSON.parse(stored);
    // Parse date strings back to Date objects
    return conversations.map((conv) => ({
      ...conv,
      createdAt: new Date(conv.createdAt),
      updatedAt: new Date(conv.updatedAt),
      messages: conv.messages.map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      })),
    }));
  } catch (error) {
    console.error('Error loading conversations from localStorage:', error);
    return [];
  }
}

/**
 * Save or update a conversation in localStorage
 */
export function saveConversation(
  id: string,
  messages: Message[],
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Conversation {
  const conversations = getConversations();
  const existingIndex = conversations.findIndex((c) => c.id === id);

  const now = new Date();
  const title = generateTitle(messages);

  const conversation: Conversation = {
    id,
    title,
    messages,
    conversationHistory,
    createdAt: existingIndex >= 0 ? conversations[existingIndex].createdAt : now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    conversations[existingIndex] = conversation;
  } else {
    conversations.unshift(conversation); // Add new conversations at the beginning
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (error) {
    console.error('Error saving conversation to localStorage:', error);
  }

  return conversation;
}

/**
 * Delete a conversation from localStorage
 */
export function deleteConversation(id: string): void {
  const conversations = getConversations();
  const filtered = conversations.filter((c) => c.id !== id);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error deleting conversation from localStorage:', error);
  }
}

/**
 * Get a single conversation by ID
 */
export function getConversation(id: string): Conversation | null {
  const conversations = getConversations();
  return conversations.find((c) => c.id === id) || null;
}

/**
 * Generate a new unique conversation ID
 */
export function generateConversationId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
