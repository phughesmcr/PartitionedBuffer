// deno-lint-ignore-file no-explicit-any no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals, assertThrows } from "jsr:@std/assert@^1.0.9";
import { Partition } from "../src/Partition.ts";
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

Deno.test("PartitionedBuffer - sparse map-mode partition shares owner capacity across fields", () => {
  const buffer = new PartitionedBuffer(1024, 16);
  type Position = { x: number; y: number };
  const position = buffer.addPartition<Position>({
    name: "position",
    schema: {
      x: Float32Array,
      y: Float32Array,
    },
    maxOwners: 2,
  });

  position.set("x", 10, 1);
  position.set("y", 20, 2);

  assertEquals(position.get("x", 10), 1);
  assertEquals(position.get("y", 10), 0);
  assertEquals(position.get("x", 20), 0);
  assertEquals(position.get("y", 20), 2);
  assertThrows(
    () => position.set("x", 30, 3),
    RangeError,
    "exhausted",
  );

  delete position.partitions.y[20];
  position.set("x", 30, 3);

  assertEquals(position.get("y", 20), undefined);
  assertEquals(position.get("x", 30), 3);
  assertEquals(position.get("y", 30), 0);
});

Deno.test("PartitionedBuffer - sparse clearSparse clears shared mappings across fields", () => {
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
  (position.partitions.x as any).clearSparse();

  assertEquals(position.get("x", 42), undefined);
  assertEquals(position.get("y", 42), undefined);
  assertEquals(Array.from(position.partitions.x), [0, 0]);
  assertEquals(Array.from(position.partitions.y), [0, 0]);

  position.set("y", 7, 7.5);
  assertEquals(position.get("x", 7), 0);
  assertEquals(position.get("y", 7), 7.5);
});

Deno.test("PartitionedBuffer - clear unregisters sparse and tag partitions while zeroing old handles", () => {
  const buffer = new PartitionedBuffer(1024, 16);
  type Position = { x: number; y: number };
  const partition = new Partition<Position>({
    name: "position",
    schema: {
      x: Float32Array,
      y: Float32Array,
    },
    maxOwners: 2,
    maxEntityId: 100,
  });
  const position = buffer.addPartition(partition);
  buffer.addPartition({ name: "visible" });

  position.set("x", 42, 1.5);
  position.set("y", 42, 2.5);

  buffer.clear();

  assertEquals(buffer.hasPartition(partition), false);
  assertEquals(buffer.hasPartition("visible"), false);
  assertEquals(buffer.getPartition(partition), undefined);
  assertEquals(position.get("x", 42), undefined);
  assertEquals(position.get("y", 42), undefined);
  assertEquals(Array.from(position.partitions.x), [0, 0]);
  assertEquals(Array.from(position.partitions.y), [0, 0]);

  const replacement = buffer.addPartition<Position>({
    name: "position",
    schema: {
      x: Float32Array,
      y: Float32Array,
    },
    maxOwners: 2,
  });
  assertEquals(replacement.byteOffset, 0);
});
