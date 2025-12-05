import type { Env } from './core-utils';
import type { Link } from '@shared/types';
const SIMILARITY_CUTOFF = 0.75;
/**
 * Generates a 384-dimensional embedding vector for a given text using Workers AI.
 */
export async function embedText(ai: Env['AI'], text: string): Promise<number[]> {
  if (!ai) throw new Error('AI binding missing: cannot embed text');
  if (!text) return [];
  try {
    const response = await ai.run('@cf/baai/bge-small-en-v1.5', { text: [text] });
    // Workers AI returns { data: [ [vector1], [vector2] ] }
    const responseAny = response as any;
    if (Array.isArray(responseAny.data) && responseAny.data.length > 0 && Array.isArray(responseAny.data[0])) {
      return responseAny.data[0];
    }
    return [];
  } catch (error) {
    console.error('Failed to embed text with Workers AI:', error);
    throw new Error('Failed to generate text embedding.');
  }
}
/**
 * Upserts a vector into the Vectorize index.
 */
export async function upsertVector(vectorize: Env['VECTORIZE'], link: Link, vector: number[]): Promise<void> {
  if (!vectorize) throw new Error('VECTORIZE binding missing: cannot upsert vector');
  try {
    const metadata: any = {
      url: link.url,
      title: link.title,
      description: link.description,
      mime: link.mime,
      byteSize: link.byteSize,
    };
    if (link.lastModified != null) {
      metadata.lastModified = link.lastModified;
    }
    await vectorize.upsert([{
      id: String(link.id),
      values: vector,
      metadata,
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
  if (!vectorize) throw new Error('VECTORIZE binding missing: cannot search vectors');
  if (queryVector.length === 0) return [];
  try {
    const results = await vectorize.query(queryVector, { topK: limit, returnMetadata: false });
    // Type assertion to help TypeScript understand the shape
    const typedMatches = results.matches as Array<{ id: string; score: number }>;
    return typedMatches
      .filter((match) => typeof match.score === 'number' && match.score > SIMILARITY_CUTOFF)
      .map((match) => ({ id: match.id, score: match.score }));
  } catch (error) {
    console.error('Failed to search vectors:', error);
    throw new Error('Vector search failed.');
  }
}