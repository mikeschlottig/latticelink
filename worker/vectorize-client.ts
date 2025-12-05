import type { Env } from './core-utils';
import type { Link } from '@shared/types';
const SIMILARITY_CUTOFF = 0.75;
/**
 * Generates a 384-dimensional embedding vector for a given text using Workers AI.
 */
export async function embedText(ai: Env['AI'], text: string): Promise<number[]> {
  if (!ai) throw new Error('AI binding missing');
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
 */
export async function upsertVector(vectorize: Env['VECTORIZE'], link: Link, vector: number[]): Promise<void> {
  if (!vectorize) throw new Error('VECTORIZE binding missing');
  try {
    await vectorize.upsert([{
      id: String(link.id),
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
 */
export async function searchVectors(
  vectorize: Env['VECTORIZE'],
  queryVector: number[],
  limit: number = 20
): Promise<{ id: string; score: number }[]> {
  if (!vectorize) throw new Error('VECTORIZE binding missing');
  if (queryVector.length === 0) return [];
  try {
    const results = await vectorize.query(queryVector, { topK: limit, returnMetadata: false });
    return results.matches
      .filter((match: { score: number }) => match.score > SIMILARITY_CUTOFF)
      .map((match: { id: string; score: number }) => ({ id: match.id, score: match.score }));
  } catch (error) {
    console.error('Failed to search vectors:', error);
    throw new Error('Vector search failed.');
  }
}