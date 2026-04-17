export interface User {
  id: string;
  email: string;
}

export interface Session {
  id: string;
  title: string;
  snippet: string;
  created: number;
  updated: number;
  messageCount: number;
}

export interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  ts: number;
  durationMs?: number;
  costUsd?: number;
  isError?: boolean;
}

export interface ActivityEntry {
  tool: string;
  label: string;
  icon: string;
  done: boolean;
}
