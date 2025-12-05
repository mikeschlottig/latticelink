export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string | ZodIssue[];
}
// From Zod, but defined here to avoid frontend dependency
export interface ZodIssue {
  message: string;
  path: (string | number)[];
}
// Core data structure for a link stored in the system
export interface Link {
  id: string;
  url: string;
  title: string;
  description: string;
  h1: string;
  mime: string;
  byteSize: number;
  lastModified: string | null;
  ingestedAt: string;
  tags: string[];
}
// Search result includes the Link data plus a relevance score
export type SearchResult = Link & {
  score: number | null;
};
// API Request/Response Payloads
export type IngestRequest = {
  url: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};
export type IngestResponse = {
  id: string;
  existed: boolean;
  link: Link;
};
export type QueryRequest = {
  naturalLanguageQuery: string;
  filters?: {
    tags?: string[];
    mime?: string;
  };
};
export type SuggestResponse = string[];
export type HealthResponse = {
  version: string;
  vectorizeCount: number;
  d1Count: number;
  status: string;
  timestamp: string;
};