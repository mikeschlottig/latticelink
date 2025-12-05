import { IndexedEntity, Entity, Index, type Env } from "./core-utils";
import type { Link } from "@shared/types";
export type LinkState = Link;
// A simple entity to map a URL to a Link ID for idempotency checks.
class UrlIndexEntity extends Entity<{ id: string }> {
  static readonly entityName = "url-index";
  static readonly initialState = { id: "" };
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
    // Add to main ID index
    const idx = new Index<string>(env, this.indexName);
    await idx.add(id);
    // Add to URL -> ID index
    await urlIndex.save({ id });
    return { link: newState, existed: false };
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