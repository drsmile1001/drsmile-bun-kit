export interface EntityStore<
  TEntity,
  TEntityInfo extends Partial<TEntity> = TEntity,
> {
  init(): Promise<void>;
  list(): Promise<TEntityInfo[]>;
  get(id: string): Promise<TEntity | undefined>;
  set(item: TEntity): Promise<void>;
  replaceAll(items: TEntity[]): Promise<void>;
  remove(id: string): Promise<void>;
}
