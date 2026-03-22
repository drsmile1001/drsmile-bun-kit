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
import { type EntityStoreTransformer } from "./EntityStoreTransformer";
import type { Migration } from "./MigrationBuilder";

export type EntityStoreYamlOptions<
  TEntitySchema extends TObject,
  TPersist = Static<TEntitySchema>,
> = {
  path: string;
  schema: TEntitySchema;
  logger?: Logger;
  migrations?: Migration[];
  transformer?: EntityStoreTransformer<Static<TEntitySchema>, TPersist>;
};

export const yamlDataWithMetaSchema = t.Object({
  version: t.Number(),
  data: t.Array(
    t.Object(
      {
        id: t.String(),
      },
      { additionalProperties: true }
    )
  ),
});

export type YamlDataWithMeta = Static<typeof yamlDataWithMetaSchema>;

function hasIdProperty<T extends TObject>(
  schema: T
): schema is T & TObject<{ id: TString }> {
  if ("properties" in schema) {
    const properties = (schema as T & TObject).properties as TProperties;
    return "id" in properties && properties.id.type === "string";
  }
  return false;
}

export class EntityStoreYaml<
  TEntitySchema extends TObject,
  TPersisted = Static<TEntitySchema>,
> implements EntityStore<Static<TEntitySchema>> {
  private cache = new Map<string, Static<TEntitySchema>>();
  private logger?: Logger;
  private lock = new AsyncLock();
  private path: string;
  private schema: TEntitySchema;
  private migrations: Migration[];
  private transformer?: EntityStoreTransformer<
    Static<TEntitySchema>,
    TPersisted
  >;

  constructor(options: EntityStoreYamlOptions<TEntitySchema, TPersisted>) {
    const { path, schema, logger, migrations = [], transformer } = options;
    if (!hasIdProperty(schema)) {
      throw new Error("實體必須有 id 屬性，且為 string 類型");
    }
    this.path = path;
    this.schema = schema;
    this.migrations = migrations;
    this.transformer = transformer;
    this.logger = logger?.extend("EntityStoreYaml", { path });
  }

  async init(): Promise<void> {
    let migrated = false;
    try {
      let fileExists = true;
      let yaml = "";
      try {
        yaml = await Bun.file(this.path).text();
      } catch (_error) {
        fileExists = false;
      }

      let version = 0;
      let data: unknown[] = [];
      if (!fileExists) {
        version = this.migrations.length;
        data = [];
        migrated = true;
      } else {
        const parsed = Bun.YAML.parse(yaml);
        if (Array.isArray(parsed)) {
          data = parsed;
          version = 0;
        } else if (Value.Check(yamlDataWithMetaSchema, parsed)) {
          version = parsed.version;
          data = parsed.data;
        } else {
          this.logger?.error(`${this.path} 格式錯誤，回傳空清單`);
          this.cache.clear();
          return;
        }
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

      if (!migrated) {
        data = data.map((item) => {
          const after = this.transformer
            ? this.transformer.fromPersist(item as TPersisted)
            : (item as Static<TEntitySchema>);
          if (!Value.Check(this.schema, after)) {
            this.logger?.error(
              {
                item: after,
              },
              `${this.path} 資料格式錯誤`
            );
            throw new Error(
              `${this.path} 資料格式錯誤: ${JSON.stringify(after)}`
            );
          }
          return after;
        });
      }

      if (migrated) {
        const out = { version, data };
        const outYaml = Bun.YAML.stringify(out, null, 2);
        await Bun.file(this.path).write(outYaml);
      }

      this.cache.clear();
      for (const item of data as Static<TEntitySchema>[]) {
        const id = (item as { id: string }).id;
        this.cache.set(id, item);
      }
    } catch (error) {
      this.logger?.error({ error }, `無法讀取 ${this.path}`);
      throw new Error(`無法讀取 ${this.path}: ${(error as Error).message}`);
    }
  }

  list(): Promise<Static<TEntitySchema>[]> {
    return Promise.resolve(Array.from(this.cache.values()));
  }

  get(id: string): Promise<Static<TEntitySchema> | undefined> {
    return Promise.resolve(this.cache.get(id));
  }

  async set(item: Static<TEntitySchema>): Promise<void> {
    await this.lock.run(async () => {
      const id = (item as { id: string }).id;
      this.cache.set(id, item);
      await this.persist();
    });
  }

  async replaceAll(items: Static<TEntitySchema>[]): Promise<void> {
    await this.lock.run(async () => {
      this.cache.clear();
      for (const item of items) {
        const id = (item as { id: string }).id;
        this.cache.set(id, item);
      }
      await this.persist();
    });
  }

  async remove(id: string): Promise<void> {
    await this.lock.run(async () => {
      this.cache.delete(id);
      await this.persist();
    });
  }

  private async persist(): Promise<void> {
    const items: unknown[] = Array.from(this.cache.values()).map((item) =>
      this.transformer ? this.transformer.toPersist(item) : item
    );
    const version = this.migrations.length;
    const out = { version, data: items };
    const yaml = Bun.YAML.stringify(out, null, 2);
    await Bun.file(this.path).write(yaml);
  }
}
