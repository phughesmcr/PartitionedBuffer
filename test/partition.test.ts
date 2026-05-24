// deno-lint-ignore-file no-explicit-any no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals, assertThrows } from "jsr:@std/assert@^1.0.9";
import { isValidPartitionSpec, Partition, type PartitionSpec } from "../src/Partition.ts";

Deno.test("Partition - stores tag and component metadata", () => {
  const tag = new Partition({ name: "alive" });
  assertEquals(tag.name, "alive");
  assertEquals(tag.schema, null);
  assertEquals(tag.size, 0);
  assertEquals(tag.isTag, true);
  assertEquals(tag.maxOwners, null);
  assertEquals(tag.maxEntityId, null);

  type Position = { x: number; y: number };
  const component = new Partition<Position>({
    name: "position",
    schema: { x: Float32Array, y: Float64Array },
    maxOwners: 128,
    maxEntityId: 10_000,
  });

  assertEquals(component.name, "position");
  assertEquals(component.size, Float32Array.BYTES_PER_ELEMENT + Float64Array.BYTES_PER_ELEMENT);
  assertEquals(component.isTag, false);
  assertEquals(component.maxOwners, 128);
  assertEquals(component.maxEntityId, 10_000);
});

Deno.test("Partition - validates sparse metadata and schema entries", () => {
  assertEquals(isValidPartitionSpec({ name: "position", schema: { x: Float32Array }, maxOwners: 1 }), true);
  assertEquals(isValidPartitionSpec({ name: "position", schema: { x: Float32Array }, maxEntityId: 0 }), true);

  assertEquals(isValidPartitionSpec({ name: "1position", schema: { x: Float32Array } }), false);
  assertEquals(isValidPartitionSpec({ name: "position", schema: {} }), false);
  assertEquals(isValidPartitionSpec({ name: "position", schema: { "1x": Float32Array } }), false);
  assertEquals(isValidPartitionSpec({ name: "position", schema: { x: Array } }), false);
  assertEquals(isValidPartitionSpec({ name: "position", schema: { x: [Uint8Array, -1] } }), false);
  assertEquals(isValidPartitionSpec({ name: "position", schema: { x: Float32Array }, maxOwners: 0 }), false);
  assertEquals(isValidPartitionSpec({ name: "position", schema: { x: Float32Array }, maxOwners: 1.5 }), false);
  assertEquals(isValidPartitionSpec({ name: "position", schema: { x: Float32Array }, maxEntityId: -1 }), false);
  assertEquals(isValidPartitionSpec({ name: "position", schema: { x: Float32Array }, maxEntityId: 1.5 }), false);
});

Deno.test("Partition - constructor rejects invalid specs", () => {
  assertThrows(
    () => new Partition({ name: "bad-name", schema: { x: Float32Array } } as any),
    SyntaxError,
    "Invalid partition specification",
  );

  assertThrows(
    () =>
      new Partition({
        name: "position",
        schema: { x: [Uint8Array, 256] },
      } as PartitionSpec<{ x: number }>),
    SyntaxError,
    "Invalid partition specification",
  );

  assertThrows(
    () =>
      new Partition({
        name: "position",
        schema: { x: Float32Array },
        maxEntityId: -1,
      } as PartitionSpec<{ x: number }>),
    SyntaxError,
    "Invalid partition specification",
  );
});
