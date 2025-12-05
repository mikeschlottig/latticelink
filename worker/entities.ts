import { IndexedEntity, type Env } from "./core-utils";
import type { Link } from "@shared/types";
export type LinkState = Link;
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
    // We use a separate index for URL -> ID mapping to check for existence
    // This is more efficient than listing all entities.
    const urlIndex = new IndexedEntity< { id: string } >(env, `link-url:${state.url}`);
    await urlIndex.getState(); // ensure state is loaded
    const existingId = urlIndex.state.id;
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
    const idx = new this(env, this.indexName)._getIndex();
    await idx.add(id);
    // Add to URL -> ID index
    await urlIndex.save({ id });
    const urlIdx = new this(env, `index:link-urls`)._getIndex();
    await urlIdx.add(state.url);
    return { link: newState, existed: false };
  }
  // Helper to get the underlying index instance
  _getIndex() {
    const Ctor = this.constructor as typeof LinkEntity;
    return new (this._getIndexClass())(this.env, Ctor.indexName);
  }
}