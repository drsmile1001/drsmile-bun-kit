import { expect, test } from "bun:test";

import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe } from "node:test";

import { Type as t } from "@sinclair/typebox";
import { ulid } from "ulid";

import { createDefaultLoggerFromEnv } from "@drsmile1001/logger";

import { EntityStoreSplitYaml, MigrationBuilder } from "../index";

const logger = createDefaultLoggerFromEnv();

function createCrudRepo(path: string) {
  return new EntityStoreSplitYaml({
    path,
    schema: t.Object({
      id: t.String(),
      name: t.String(),
      age: t.Optional(t.Number()),
    }),
    toEntityInfo: (entity) => ({
      id: entity.id,
      name: entity.name,
    }),
    logger,
  });
}

function createMigratedRepo(path: string) {
  return new EntityStoreSplitYaml({
    path,
    schema: t.Object({
      id: t.String(),
      name: t.String(),
      age: t.Union([t.Number(), t.Null()]),
      phone: t.Union([t.String(), t.Null()]),
    }),
    toEntityInfo: (entity) => ({
      id: entity.id,
      name: entity.name,
    }),
    logger,
    migrations: MigrationBuilder.create<{
      id: string;
      name: string;
      age: number | null;
    }>()
      .addMigration("新增 phone 欄位，預設為 null", (data) =>
        data.map((item) => ({
          ...item,
          phone: null,
        }))
      )
      .build(),
  });
}

function createTransformedRepo(path: string) {
  return new EntityStoreSplitYaml({
    path,
    schema: t.Object({
      id: t.String(),
      counter: t.Number(),
    }),
    toEntityInfo: (entity) => ({
      id: entity.id,
    }),
    logger,
    transformer: {
      toPersist: (data) => ({
        id: data.id,
        counter: `${data.counter}`,
      }),
      fromPersist: (data) => ({
        id: data.id,
        counter: Number(data.counter),
      }),
    },
  });
}

describe("EntityStoreSplitYaml", () => {
  test("CRUD: 可從空白資料夾讀取", async () => {
    const testDirPath = `${tmpdir()}/${ulid()}`;
    const repo = createCrudRepo(testDirPath);

    await repo.init();

    expect(await repo.list()).toEqual([]);
  });

  test("CRUD: list 只回傳 entity info", async () => {
    const testDirPath = `${tmpdir()}/${ulid()}`;
    const repo = createCrudRepo(testDirPath);

    await repo.init();
    await repo.set({ id: "1", name: "Alice", age: 30 });
    await repo.set({ id: "2", name: "Bob", age: 25 });

    expect(await repo.get("1")).toEqual({ id: "1", name: "Alice", age: 30 });
    expect(await repo.list()).toEqual([
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ]);

    const parsed = Bun.YAML.parse(
      await Bun.file(`${testDirPath}/1.yaml`).text()
    );
    expect(parsed).toEqual({
      version: 0,
      data: { id: "1", name: "Alice", age: 30 },
    });
  });

  test("CRUD: 可執行 remove 與 replaceAll", async () => {
    const testDirPath = `${tmpdir()}/${ulid()}`;
    const repo = createCrudRepo(testDirPath);

    await repo.init();
    await repo.set({ id: "1", name: "Alice", age: 30 });
    await repo.set({ id: "2", name: "Bob", age: 25 });
    await repo.remove("1");

    expect(await repo.get("1")).toBeUndefined();
    expect(await repo.list()).toEqual([{ id: "2", name: "Bob" }]);

    await repo.replaceAll([
      { id: "3", name: "Carol", age: 40 },
      { id: "4", name: "Dave", age: 20 },
    ]);

    expect(await repo.list()).toEqual([
      { id: "3", name: "Carol" },
      { id: "4", name: "Dave" },
    ]);
    expect(await Bun.file(`${testDirPath}/1.yaml`).exists()).toBe(false);
    expect(await Bun.file(`${testDirPath}/3.yaml`).exists()).toBe(true);
  });

  test("init: 可從多檔案重建 cache 與 list cache", async () => {
    const testDirPath = `${tmpdir()}/${ulid()}`;
    const repo = createCrudRepo(testDirPath);

    await repo.init();
    await repo.set({ id: "1", name: "Alice", age: 30 });
    await repo.set({ id: "2", name: "Bob", age: 25 });

    const nextRepo = createCrudRepo(testDirPath);
    await nextRepo.init();

    expect(await nextRepo.list()).toEqual([
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ]);
    expect(await nextRepo.get("1")).toEqual({
      id: "1",
      name: "Alice",
      age: 30,
    });
  });

  test("get: 未先 list 也可直接載入單一實體", async () => {
    const testDirPath = `${tmpdir()}/${ulid()}`;
    const repo = createCrudRepo(testDirPath);

    await repo.init();
    await repo.set({ id: "1", name: "Alice", age: 30 });

    const nextRepo = createCrudRepo(testDirPath);
    await nextRepo.init();

    expect(await nextRepo.get("1")).toEqual({
      id: "1",
      name: "Alice",
      age: 30,
    });
  });

  test("list cache: 建立後 set 與 remove 會增量更新", async () => {
    const testDirPath = `${tmpdir()}/${ulid()}`;
    const repo = createCrudRepo(testDirPath);

    await repo.init();
    await repo.set({ id: "1", name: "Alice", age: 30 });

    expect(await repo.list()).toEqual([{ id: "1", name: "Alice" }]);

    await repo.set({ id: "2", name: "Bob", age: 25 });
    expect(await repo.list()).toEqual([
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ]);

    await repo.remove("1");
    expect(await repo.list()).toEqual([{ id: "2", name: "Bob" }]);
  });

  test("遷移: 可從舊版單檔資料遷移", async () => {
    const testDirPath = `${tmpdir()}/${ulid()}`;
    await mkdir(testDirPath, { recursive: true });
    await Bun.write(
      `${testDirPath}/1.yaml`,
      Bun.YAML.stringify(
        {
          version: 0,
          data: {
            id: "1",
            name: "Alice",
            age: 30,
          },
        },
        null,
        2
      )
    );

    const repo = createMigratedRepo(testDirPath);
    await repo.init();

    expect(await repo.get("1")).toEqual({
      id: "1",
      name: "Alice",
      age: 30,
      phone: null,
    });

    const parsed = Bun.YAML.parse(
      await Bun.file(`${testDirPath}/1.yaml`).text()
    );
    expect(parsed).toEqual({
      version: 1,
      data: {
        id: "1",
        name: "Alice",
        age: 30,
        phone: null,
      },
    });
  });

  test("transformer: 可將持久化資料轉換為實體", async () => {
    const testDirPath = `${tmpdir()}/${ulid()}`;
    await mkdir(testDirPath, { recursive: true });
    await Bun.write(
      `${testDirPath}/1.yaml`,
      Bun.YAML.stringify(
        {
          version: 0,
          data: {
            id: "1",
            counter: "123",
          },
        },
        null,
        2
      )
    );

    const repo = createTransformedRepo(testDirPath);
    await repo.init();

    expect(await repo.get("1")).toEqual({ id: "1", counter: 123 });
    expect(await repo.list()).toEqual([{ id: "1" }]);
  });
});
