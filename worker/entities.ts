import { IndexedEntity, Entity, Index, type Env } from "./core-utils";
import type { Link } from "@shared/types";
export type LinkState = Link;
// A simple entity to map a URL to a Link ID for idempotency checks (DO FALLBACK ONLY).
class UrlIndexEntity extends Entity<{ id: string }> {
  static readonly entityName = "url-index";
  static readonly initialState = { id: "" };
}
// Helper to format D1 results into LinkState
function formatD1Result(row: any): LinkState {
  return {
    ...row,
    tags: row.tags_str ? row.tags_str.split(',') : [],
    byteSize: row.byteSize || 0,
  } as LinkState;
}
export class LinkEntity extends IndexedEntity<LinkState> {
  static readonly entityName = "link";
  static readonly indexName = "links";
  static readonly initialState: LinkState = {
    id: "",
    url: "",
    title: "",
    description: "",
    h1: "",
    mime: "",
    byteSize: 0,
    lastModified: null,
    ingestedAt: "",
    tags: [],
  };
  /**
   * Creates a new link if it doesn't exist, or returns the existing one.
   * Idempotency is based on the URL.
   */
  static async createOrGet(env: Env, state: Omit<LinkState, 'id' | 'ingestedAt'>): Promise<{ link: LinkState, existed: boolean }> {
    // D1 Native Implementation
    if (env.LINKS_D1) {
      const db = env.LINKS_D1;
      // Check if URL exists
      let existing = await db.prepare('SELECT id FROM links WHERE url = ?').bind(state.url).first<{ id: string }>();
      if (existing) {
        const fullLink = await this.getById(env, existing.id);
        return { link: fullLink!, existed: true };
      }
      // Insert new link
      const newId = crypto.randomUUID();
      const ingestedAt = new Date().toISOString();
      await db.prepare('INSERT INTO links (id, url, ingestedAt) VALUES (?, ?, ?)')
        .bind(newId, state.url, ingestedAt)
        .run();
      const newLink: LinkState = {
        ...this.initialState,
        ...state,
        id: newId,
        ingestedAt,
      };
      await this.putTags(env, newId, state.tags);
      return { link: newLink, existed: false };
    }
    // Fallback to DO implementation
    const urlIndex = new UrlIndexEntity(env, state.url);
    const existingId = (await urlIndex.getState()).id;
    if (existingId) {
      const existingLink = new LinkEntity(env, existingId);
      return { link: await existingLink.getState(), existed: true };
    }
    const id = crypto.randomUUID();
    const newState: LinkState = {
      ...state,
      id,
      ingestedAt: new Date().toISOString(),
    };
    const inst = new this(env, id);
    await inst.save(newState);
    const idx = new Index<string>(env, this.indexName);
    await idx.add(id);
    await urlIndex.save({ id });
    return { link: newState, existed: false };
  }
  static async putTags(env: Env, linkId: string, tags: string[]): Promise<void> {
    if (env.LINKS_D1) {
      const db = env.LINKS_D1;
      await db.prepare('DELETE FROM tags WHERE linkId = ?').bind(linkId).run();
      if (tags.length > 0) {
        const placeholders = tags.map(() => '(?, ?)').join(',');
        const values = tags.flatMap(tag => [linkId, tag]);
        await db.prepare(`INSERT INTO tags (linkId, tag) VALUES ${placeholders}`).bind(...values).run();
      }
      return;
    }
    // DO fallback has tags within the main entity state, no separate action needed here.
  }
  static async getById(env: Env, id: string): Promise<LinkState | null> {
    if (env.LINKS_D1) {
      const db = env.LINKS_D1;
      const row = await db.prepare(
        `SELECT l.*, GROUP_CONCAT(t.tag) as tags_str 
         FROM links l 
         LEFT JOIN tags t ON l.id = t.linkId 
         WHERE l.id = ? 
         GROUP BY l.id`
      ).bind(id).first();
      return row ? formatD1Result(row) : null;
    }
    // Fallback
    return new this(env, id).getState();
  }
  static async suggestTags(env: Env, partial: string): Promise<string[]> {
    if (env.LINKS_D1) {
        const { results } = await env.LINKS_D1.prepare(
            'SELECT DISTINCT tag FROM tags WHERE tag LIKE ? ORDER BY tag LIMIT 10'
        ).bind(`${partial}%`).all<{ tag: string }>();
        return results.map(r => r.tag);
    }
    // Fallback
    const allLinks = await super.list(env, null, 1000);
    const allTags = [...new Set(allLinks.items.flatMap(l => l.tags))];
    return partial
      ? allTags.filter(tag => tag.toLowerCase().startsWith(partial.toLowerCase()))
      : allTags;
  }
  // Helper to get the underlying index instance
  protected _getIndex() {
    const Ctor = this.constructor as typeof LinkEntity;
    return new (this._getIndexClass())(this.env, Ctor.indexName);
  }
  protected _getIndexClass() {
    return Index;
  }
}