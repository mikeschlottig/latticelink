// @ts-ignore - Env is a global type
import type { Env } from './core-utils';
/**
 * Generates a mock embedding vector.
 * In a real implementation, this would call a Workers AI model.
 * @param env - The worker environment.
 * @param text - The text to embed.
 * @returns A promise that resolves to a mock embedding vector.
 */
export async function embedText(env: Env, text: string): Promise<number[]> {
  // In Phase 1, we return a deterministic, mock vector.
  // The length 384 matches the @cf/baai/bge-small-en-v1.5 model.
  if (!text) return [];
  return Array(384).fill(0).map((_, i) => Math.sin(i / 10 + text.length));
}
interface VectorizeResult {
  id: string;
  score: number;
}
interface VectorizeSearchOptions {
  tags?: string[];
  mime?: string;
  limit?: number;
}
/**
 * Searches for vectors in the Vectorize index.
 * In a real implementation, this would call the Vectorize binding.
 * @param env - The worker environment.
 * @param queryVector - The vector to search for.
 * @param options - Search filter options.
 * @returns A promise that resolves to mock search results.
 */
export async function searchVectors(
  env: Env,
  queryVector: number[],
  options?: VectorizeSearchOptions
): Promise<VectorizeResult[]> {
  // In Phase 1, we return a mock search response.
  if (queryVector.length === 0) return [];
  // Simulate a search result with decreasing scores.
  return [
    { id: '1', score: 0.92 },
    { id: '2', score: 0.88 },
    { id: '3', score: 0.81 },
  ].slice(0, options?.limit ?? 3);
}