// deno-lint-ignore-file no-explicit-any
/// <reference lib="deno.ns" />

import { assertEquals, assertThrows } from "jsr:@std/assert@^1.0.9";
import { alignOffset, columnLayout, getEntityStride, getPartitionByteSize, MAX_PARTITION_SIZE } from "../src/layout.ts";
import { Partition, type PartitionSpec } from "../src/Partition.ts";
import { PartitionedBuffer } from "../src/PartitionedBuffer.ts";
import { getEntitySize, isSchema } from "../src/Schema.ts";

Deno.test("Layout - getEntityStride matches getEntitySize", () => {
  const schema = { x: Float32Array, y: Float32Array };
  assertEquals(getEntityStride(schema), getEntitySize(schema));
  assertEquals(getEntitySize(schema), 8);
});

Deno.test("Layout - alignOffset handles exact end and large offsets without 32-bit overflow", () => {
  assertEquals(alignOffset(8, 8, 8), 8);
  assertEquals(alignOffset(2 ** 31, 8, 2 ** 31 + 8), 2 ** 31);
  assertEquals(alignOffset(2 ** 31 + 1, 8, 2 ** 31 + 16), 2 ** 31 + 8);
});

Deno.test("Layout - alignOffset rejects invalid alignment and insufficient space", () => {
  assertThrows(
    () => alignOffset(0, 12, 64),
    RangeError,
    "power of 2",
  );
  assertThrows(
    () => alignOffset(9, 8, 10),
    RangeError,
    "Insufficient space",
  );
});

Deno.test("Layout - mixed alignment stride vs partition bytes", () => {
  const schema = {
    int8: Int8Array,
    float64: Float64Array,
    int32: Int32Array,
  };
  assertEquals(getEntitySize(schema), 13);
  const rowCount = 8;
  const layoutSize = getPartitionByteSize(schema, rowCount);
  assertEquals(layoutSize % 8, 0);
  assertEquals(layoutSize > 13, true);

  const buffer = new PartitionedBuffer(layoutSize, rowCount);
  type Mixed = { int8: number; float64: number; int32: number };
  const spec: PartitionSpec<Mixed> = { name: "mixed", schema };
  const before = buffer.getFreeSpace();
  buffer.addPartition(new Partition(spec));
  const consumed = before - buffer.getFreeSpace();
  assertEquals(consumed, layoutSize);
});

Deno.test("Layout - columnLayout byteLength matches getPartitionByteSize", () => {
  const schema = { a: Float32Array, b: Int32Array };
  const rowCount = 16;
  assertEquals(columnLayout(schema, rowCount).byteLength, getPartitionByteSize(schema, rowCount));
});

Deno.test("Layout - columnLayout rejects invalid row counts", () => {
  const schema = { value: Float32Array };

  for (const rowCount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
    assertThrows(
      () => columnLayout(schema, rowCount),
      RangeError,
      "rowCount",
    );
    assertThrows(
      () => getPartitionByteSize(schema, rowCount),
      RangeError,
      "rowCount",
    );
  }
});

Deno.test("Layout - columnLayout returns exact SoA offsets and lengths", () => {
  const schema = {
    flag: Int8Array,
    amount: Float64Array,
    count: Int32Array,
  };

  assertEquals(columnLayout(schema, 8), {
    byteLength: 104,
    columns: [
      {
        name: "flag",
        bytesPerElement: 1,
        alignment: 8,
        length: 8,
        byteOffset: 0,
        byteLength: 8,
      },
      {
        name: "amount",
        bytesPerElement: 8,
        alignment: 8,
        length: 8,
        byteOffset: 8,
        byteLength: 64,
      },
      {
        name: "count",
        bytesPerElement: 4,
        alignment: 8,
        length: 8,
        byteOffset: 72,
        byteLength: 32,
      },
    ],
  });
});

Deno.test("Layout - columnLayout rejects columns larger than the supported maximum", () => {
  assertThrows(
    () => columnLayout({ value: Int8Array }, MAX_PARTITION_SIZE + 1),
    RangeError,
    "exceeds maximum allowed",
  );
});

Deno.test("Layout - empty schema partition bytes", () => {
  assertEquals(getPartitionByteSize({} as any, 8), 0);
});

Deno.test("Layout - getEntitySize validates via Schema export", () => {
  assertThrows(
    () => getEntitySize(null as any),
    TypeError,
    "Invalid schema",
  );
});

Deno.test("Layout - isSchema still works with layout imports", () => {
  assertEquals(isSchema({ x: Float32Array }), true);
});
