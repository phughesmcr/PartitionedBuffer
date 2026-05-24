// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert@^1.0.9";
import {
  getEntitySize,
  getPartitionByteSize,
  isSchema,
  isValidName,
  Partition,
  PartitionedBuffer,
  type Schema,
} from "../mod.ts";

Deno.test("Public API - exported entrypoint supports documented dense usage", () => {
  type Vec2 = { x: number; y: number };
  const schema: Schema<Vec2> = { x: Float32Array, y: Float32Array };
  const buffer = new PartitionedBuffer(1024, 16);
  const position = buffer.addPartition(new Partition<Vec2>({ name: "position", schema }));

  position.set("x", 0, 1);
  position.set("y", 0, 2);

  assertEquals(isSchema(schema), true);
  assertEquals(isValidName("position"), true);
  assertEquals(getEntitySize(schema), 8);
  assertEquals(getPartitionByteSize(schema, 16), position.byteLength);
  assertEquals(position.get("x", 0), 1);
  assertEquals(position.get("y", 0), 2);
});

Deno.test("Public API - exported entrypoint supports documented sparse usage", () => {
  type Vec2 = { x: number; y: number };
  const schema: Schema<Vec2> = { x: Float32Array, y: Float32Array };
  const buffer = new PartitionedBuffer(1024, 16);
  const position = buffer.addPartition<Vec2>({
    name: "sparsePosition",
    schema,
    maxOwners: 2,
    maxEntityId: 100,
  });

  position.set("x", 42, 1.5);
  position.set("y", 42, 2.5);

  assertEquals(position.partitions.x.length, 2);
  assertEquals(position.get("x", 42), 1.5);
  assertEquals(position.get("y", 42), 2.5);
  assertEquals(position.get("x", 43), undefined);
});
