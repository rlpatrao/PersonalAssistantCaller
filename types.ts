export interface CallRecord {
  id: string;
  timestamp: number;
  recipient: string;
  summary: string;
  status: 'completed' | 'failed' | 'scheduled' | 'pending';
  context: string;
}

export interface UserMemory {
  preferences: string[];
  lastInteraction: number;
}

export interface AudioConfig {
  sampleRate: number;
}

export enum AgentState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  LISTENING = 'LISTENING',
  SPEAKING = 'SPEAKING',
  PROCESSING = 'PROCESSING',
  ERROR = 'ERROR',
  IN_CALL = 'IN_CALL', // Simulating an active phone call
}

export interface LogEntry {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'tool' | 'error' | 'success' | 'alert';
}

export interface TranscriptEntry {
  id: string;
  speaker: 'user' | 'agent';
  text: string;
  timestamp: string;
  isFinal: boolean;
}