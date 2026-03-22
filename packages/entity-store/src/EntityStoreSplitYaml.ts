import { mkdir, readdir, unlink } from "node:fs/promises";

import {
  type Static,
  type TObject,
  type TProperties,
  type TString,
  Type as t,
} from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import type { Logger } from "@drsmile1001/logger";
import { AsyncLock } from "@drsmile1001/utils";

import type { EntityStore } from "./EntityStore";
import type { EntityStoreTransformer } from "./EntityStoreTransformer";
import type { Migration } from "./MigrationBuilder";

export type EntityStoreSplitYamlOptions<
  TEntitySchema extends TObject,
  TEntityInfo extends Partial<Static<TEntitySchema>> & { id: string },
  TPersisted = Static<TEntitySchema>,
> = {
  path: string;
  schema: TEntitySchema;
  toEntityInfo: (entity: Static<TEntitySchema>) => TEntityInfo;
  logger?: Logger;
  migrations?: Migration[];
  transformer?: EntityStoreTransformer<Static<TEntitySchema>, TPersisted>;
};

const singleYamlDataWithMetaSchema = t.Object({
  version: t.Number(),
  data: t.Object(
    {
      id: t.String(),
    },
    { additionalProperties: true }
  ),
});

type SingleYamlDataWithMeta = Static<typeof singleYamlDataWithMetaSchema>;

function hasIdProperty<T extends TObject>(
  schema: T
): schema is T & TObject<{ id: TString }> {
  if ("properties" in schema) {
    const properties = (schema as T & TObject).properties as TProperties;
    return "id" in properties && properties.id.type === "string";
  }
  return false;
}

export class EntityStoreSplitYaml<
  TEntitySchema extends TObject,
  TEntityInfo extends Partial<Static<TEntitySchema>> & { id: string },
  TPersisted = Static<TEntitySchema>,
> implements EntityStore<Static<TEntitySchema>, TEntityInfo> {
  private readonly cache = new Map<string, Static<TEntitySchema>>();
  private readonly lock = new AsyncLock();
  private readonly logger?: Logger;
  private readonly migrations: Migration[];
  private readonly path: string;
  private readonly schema: TEntitySchema;
  private readonly toEntityInfo: (entity: Static<TEntitySchema>) => TEntityInfo;
  private readonly transformer?: EntityStoreTransformer<
    Static<TEntitySchema>,
    TPersisted
  >;
  private listCache: TEntityInfo[] | null = null;

  constructor(
    options: EntityStoreSplitYamlOptions<TEntitySchema, TEntityInfo, TPersisted>
  ) {
    const {
      path,
      schema,
      toEntityInfo,
      logger,
      migrations = [],
      transformer,
    } = options;

    if (!hasIdProperty(schema)) {
      throw new Error("實體必須有 id 屬性，且為 string 類型");
    }

    this.path = path;
    this.schema = schema;
    this.toEntityInfo = toEntityInfo;
    this.migrations = migrations;
    this.transformer = transformer;
    this.logger = logger?.extend("EntityStoreSplitYaml", { path });
  }

  async init(): Promise<void> {
    await mkdir(this.path, { recursive: true });
    this.cache.clear();
    this.listCache = null;
  }

  async list(): Promise<TEntityInfo[]> {
    if (this.listCache) {
      return this.listCache;
    }

    const list: TEntityInfo[] = [];

    try {
      const fileNames = (await readdir(this.path)).sort();

      for (const fileName of fileNames) {
        if (!fileName.endsWith(".yaml")) {
          continue;
        }

        const filePath = this.getFilePathByFileName(fileName);
        const entity = await this.readEntityFile(filePath);

        this.cache.set(this.getEntityId(entity), entity);
        list.push(this.toEntityInfo(entity));
      }

      this.listCache = list;
      return list;
    } catch (error) {
      this.logger?.error({ error }, `無法列出 ${this.path}`);
      throw new Error(`無法列出 ${this.path}: ${(error as Error).message}`);
    }
  }

  async get(id: string): Promise<Static<TEntitySchema> | undefined> {
    const cached = this.cache.get(id);
    if (cached) {
      return cached;
    }

    const filePath = this.getFilePath(id);

    try {
      const entity = await this.readEntityFile(filePath);
      this.cache.set(id, entity);
      return entity;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }

      this.logger?.warn({ error, id }, `無法讀取實體：${filePath}`);
      throw error;
    }
  }

  async set(item: Static<TEntitySchema>): Promise<void> {
    await this.lock.run(async () => {
      this.cache.set(this.getEntityId(item), item);
      await this.writeEntityFile(item);
      this.updateListCache(item);
    });
  }

  async replaceAll(items: Static<TEntitySchema>[]): Promise<void> {
    await this.lock.run(async () => {
      await mkdir(this.path, { recursive: true });

      const nextIds = new Set(items.map((item) => item.id));
      const fileNames = await readdir(this.path);

      for (const fileName of fileNames) {
        if (!fileName.endsWith(".yaml")) {
          continue;
        }

        const id = this.getIdFromFileName(fileName);
        if (!nextIds.has(id)) {
          await unlink(this.getFilePathByFileName(fileName));
        }
      }

      this.cache.clear();

      for (const item of items) {
        this.cache.set(this.getEntityId(item), item);
        await this.writeEntityFile(item);
      }

      if (this.listCache) {
        this.rebuildListCache();
      }
    });
  }

  async remove(id: string): Promise<void> {
    await this.lock.run(async () => {
      this.cache.delete(id);

      const filePath = this.getFilePath(id);
      try {
        await unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      this.removeFromListCache(id);
    });
  }

  private getFilePath(id: string): string {
    return `${this.path}/${id}.yaml`;
  }

  private getEntityId(item: Static<TEntitySchema>): string {
    return (item as { id: string }).id;
  }

  private getFilePathByFileName(fileName: string): string {
    return `${this.path}/${fileName}`;
  }

  private getIdFromFileName(fileName: string): string {
    return fileName.replace(/\.yaml$/, "");
  }

  private rebuildListCache() {
    this.listCache = Array.from(this.cache.values()).map((item) =>
      this.toEntityInfo(item)
    );
  }

  private updateListCache(item: Static<TEntitySchema>) {
    const entityInfo = this.toEntityInfo(item);
    const itemId = this.getEntityId(item);

    if (!this.listCache) {
      this.listCache = [entityInfo];
      return;
    }

    const index = this.listCache.findIndex((current) => current.id === itemId);

    if (index === -1) {
      this.listCache.push(entityInfo);
      return;
    }

    this.listCache[index] = entityInfo;
  }

  private removeFromListCache(id: string) {
    if (!this.listCache) {
      return;
    }

    this.listCache = this.listCache.filter((item) => item.id !== id);
  }

  private async readEntityFile(
    filePath: string
  ): Promise<Static<TEntitySchema>> {
    let migrated = false;
    const yaml = await Bun.file(filePath).text();
    const parsed = Bun.YAML.parse(yaml);

    let version = 0;
    let data: unknown[] = [];

    if (Value.Check(singleYamlDataWithMetaSchema, parsed)) {
      version = parsed.version;
      data = [parsed.data];
    } else if (Value.Check(this.schema, parsed)) {
      data = [parsed];
    } else {
      this.logger?.error(`${filePath} 格式錯誤，無法讀取`);
      throw new Error(`${filePath} 格式錯誤`);
    }

    let currentMigration = 0;
    for (const migration of this.migrations) {
      currentMigration += 1;
      if (currentMigration > version) {
        data = migration.migrate(data);
        version = currentMigration;
        migrated = true;
        this.logger?.info(`執行 migration: ${migration.description}`);
      }
    }

    const item = data[0];
    const entity = this.transformer
      ? this.transformer.fromPersist(item as TPersisted)
      : (item as Static<TEntitySchema>);

    if (!Value.Check(this.schema, entity)) {
      this.logger?.error(
        {
          item: entity,
        },
        `${filePath} 資料格式錯誤`
      );
      throw new Error(`${filePath} 資料格式錯誤: ${JSON.stringify(entity)}`);
    }

    if (migrated) {
      await this.writeEntityFile(entity);
    }

    return entity;
  }

  private async writeEntityFile(item: Static<TEntitySchema>): Promise<void> {
    await mkdir(this.path, { recursive: true });

    const filePath = this.getFilePath(this.getEntityId(item));
    const data = this.transformer ? this.transformer.toPersist(item) : item;
    const out: SingleYamlDataWithMeta = {
      version: this.migrations.length,
      data: data as SingleYamlDataWithMeta["data"],
    };
    const yaml = Bun.YAML.stringify(out, null, 2);
    await Bun.write(filePath, yaml);
  }
}
