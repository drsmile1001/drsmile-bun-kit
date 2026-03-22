import type { EntityStore } from "./EntityStore";

export class EntityStoreInMemory<
  TEntity extends { id: string },
> implements EntityStore<TEntity> {
  private readonly cache = new Map<string, TEntity>();

  constructor(options: { initialItems?: TEntity[] } = {}) {
    const { initialItems = [] } = options;
    for (const item of initialItems) {
      this.cache.set(item.id, item);
    }
  }

  async init(): Promise<void> {
    return;
  }

  list(): Promise<TEntity[]> {
    return Promise.resolve(Array.from(this.cache.values()));
  }

  get(id: string): Promise<TEntity | undefined> {
    return Promise.resolve(this.cache.get(id));
  }

  async set(item: TEntity): Promise<void> {
    this.cache.set(item.id, item);
  }

  async replaceAll(items: TEntity[]): Promise<void> {
    this.cache.clear();
    for (const item of items) {
      this.cache.set(item.id, item);
    }
  }

  async remove(id: string): Promise<void> {
    this.cache.delete(id);
  }
}
