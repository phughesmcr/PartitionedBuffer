// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert@^1.0.9";
import { PartitionedBuffer } from "../src/PartitionedBuffer.ts";

Deno.test("PartitionedBuffer - sparse multi-field partition clears stale dense slots on delete", () => {
  const buffer = new PartitionedBuffer(1024, 16);
  type Position = { x: number; y: number };
  const position = buffer.addPartition<Position>({
    name: "position",
    schema: {
      x: Float32Array,
      y: Float32Array,
    },
    maxOwners: 2,
    maxEntityId: 100,
  });

  position.set("x", 42, 1.5);
  position.set("y", 42, 2.5);

  assertEquals(position.get("x", 42), 1.5);
  assertEquals(position.get("y", 42), 2.5);

  delete position.partitions.x[42];

  assertEquals(position.get("x", 42), undefined);
  assertEquals(position.get("y", 42), undefined);

  position.set("x", 7, 7.5);

  assertEquals(position.get("x", 7), 7.5);
  assertEquals(position.get("y", 7), 0);
});
