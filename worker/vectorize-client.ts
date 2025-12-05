import type { Env } from './core-utils';
import type { Link } from '@shared/types';
const SIMILARITY_CUTOFF = 0.75;
/**
 * Generates a 384-dimensional embedding vector for a given text using Workers AI.
 * @param ai - The AI binding from the worker environment.
 * @param text - The text to embed.
 * @returns A promise that resolves to the embedding vector.
 */
export async function embedText(ai: Env['AI'], text: string): Promise<number[]> {
  if (!text) return [];
  try {
    const response = await ai.run('@cf/baai/bge-small-en-v1.5', { text: [text] });
    return response.data[0];
  } catch (error) {
    console.error('Failed to embed text with Workers AI:', error);
    throw new Error('Failed to generate text embedding.');
  }
}
/**
 * Upserts a vector into the Vectorize index.
 * @param vectorize - The Vectorize binding from the worker environment.
 * @param link - The link data containing ID and metadata.
 * @param vector - The embedding vector.
 */
export async function upsertVector(vectorize: Env['VECTORIZE'], link: Link, vector: number[]): Promise<void> {
  try {
    await vectorize.upsert([{
      id: link.id,
      values: vector,
      metadata: {
        url: link.url,
        title: link.title,
        description: link.description,
      },
    }]);
  } catch (error) {
    console.error(`Failed to upsert vector for link ID ${link.id}:`, error);
    throw new Error('Failed to save vector.');
  }
}
/**
 * Searches for similar vectors in the Vectorize index.
 * @param vectorize - The Vectorize binding from the worker environment.
 * @param queryVector - The vector to search for.
 * @param limit - The maximum number of results to return.
 * @returns A promise that resolves to search results with scores above the similarity cutoff.
 */
export async function searchVectors(
  vectorize: Env['VECTORIZE'],
  queryVector: number[],
  limit: number = 20
): Promise<{ id: string; score: number }[]> {
  if (queryVector.length === 0) return [];
  try {
    const results = await vectorize.query(queryVector, { topK: limit, returnMetadata: false });
    return results.matches
      .filter(match => match.score > SIMILARITY_CUTOFF)
      .map(match => ({ id: match.id, score: match.score }));
  } catch (error) {
    console.error('Failed to search vectors:', error);
    throw new Error('Vector search failed.');
  }
}