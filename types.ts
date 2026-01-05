
export type Language = 'en' | 'ar';

export interface DocNode {
  index: string; // e.g., "1", "1.1", "1.1.a"
  title?: string;
  text: string;
  children?: DocNode[];
}

export interface ParseResponse {
  status: 'SUCCESS' | 'ERROR';
  errorMessage?: string;
  document?: DocNode[];
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
