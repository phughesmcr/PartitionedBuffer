/// <reference lib="deno.ns" />

import { assertEquals, assertThrows } from "jsr:@std/assert@^1.0.9";
import { getEntitySize, getPartitionByteSize, isSchema, Partition, PartitionedBuffer, type Schema } from "../mod.ts";
import { columnLayout } from "../src/layout.ts";

type Value = { value: number };

Deno.test("Float16 - bare constructor creates a 2-byte Float16Array column", () => {
  const schema: Schema<Value> = { value: Float16Array };
  const buffer = new PartitionedBuffer(256, 16);
  const storage = buffer.addPartition<Value>({ name: "half", schema });

  assertEquals(isSchema(schema), true);
  assertEquals(getEntitySize(schema), 2);
  assertEquals(storage.partitions.value instanceof Float16Array, true);
  assertEquals(storage.partitions.value.length, 16);
  assertEquals(storage.byteLength, 32);
  assertEquals(buffer.getFreeSpace(), 256 - 32);
});

Deno.test("Float16 - tuple form validates and fills the initial value", () => {
  const schema: Schema<Value> = { value: [Float16Array, 1.5] };
  assertEquals(isSchema(schema), true);

  const buffer = new PartitionedBuffer(256, 16);
  const storage = buffer.addPartition<Value>({ name: "half", schema });
  assertEquals(Array.from(storage.partitions.value), new Array(16).fill(1.5));
});

Deno.test("Float16 - tuple initial values round with Math.f16round", () => {
  const buffer = new PartitionedBuffer(256, 16);
  const storage = buffer.addPartition<Value>({ name: "half", schema: { value: [Float16Array, 0.1] } });
  assertEquals(storage.partitions.value[0], Math.f16round(0.1));
  assertEquals(storage.partitions.value[0], 0.0999755859375);

  const max = buffer.addPartition<Value>({ name: "max", schema: { value: [Float16Array, 65504] } });
  assertEquals(max.partitions.value[15], 65504);

  const negZero = buffer.addPartition<Value>({ name: "negZero", schema: { value: [Float16Array, -0] } });
  assertEquals(Object.is(negZero.partitions.value[0], -0), true);
});

Deno.test("Float16 - out-of-range and non-finite initial values are rejected", () => {
  for (const initial of [65505, 65520, -65505, 1e6, Infinity, -Infinity, NaN]) {
    const schema = { value: [Float16Array, initial] } as Schema<Value>;
    assertEquals(isSchema(schema), false, `isSchema should reject ${initial}`);
    assertThrows(
      () => new Partition<Value>({ name: "half", schema }),
      SyntaxError,
      "Invalid partition specification",
    );
  }
});

Deno.test("Float16 - columns store IEEE binary16 values (NaN, -0, Infinity, overflow, subnormals)", () => {
  const buffer = new PartitionedBuffer(256, 16);
  const { partitions, set, get } = buffer.addPartition<Value>({ name: "half", schema: { value: Float16Array } });
  const column = partitions.value;

  column[0] = NaN;
  column[1] = -0;
  column[2] = Infinity;
  column[3] = -Infinity;
  column[4] = 65519; // rounds down to the max finite value
  column[5] = 65520; // rounds up to Infinity
  column[6] = 5.960464477539063e-8; // smallest subnormal
  column[7] = 1e-8; // underflows to zero
  set("value", 8, Math.PI);

  assertEquals(Number.isNaN(column[0]), true);
  assertEquals(Object.is(column[1], -0), true);
  assertEquals(column[2], Infinity);
  assertEquals(column[3], -Infinity);
  assertEquals(column[4], 65504);
  assertEquals(column[5], Infinity);
  assertEquals(column[6], 5.960464477539063e-8);
  assertEquals(column[7], 0);
  assertEquals(get("value", 8), Math.f16round(Math.PI));
});

Deno.test("Float16 - odd row counts keep the next column aligned", () => {
  type Mixed = { half: number; double: number };
  const schema: Schema<Mixed> = { half: Float16Array, double: Float64Array };
  const rowCount = 9; // 18 bytes of f16, so the f64 column needs 6 bytes of padding
  const layout = columnLayout(schema, rowCount);

  assertEquals(layout.columns[0]?.byteOffset, 0);
  assertEquals(layout.columns[0]?.byteLength, 18);
  assertEquals(layout.columns[0]?.alignment, 8);
  assertEquals(layout.columns[1]?.byteOffset, 24);
  assertEquals(layout.byteLength, 96);
  assertEquals(getPartitionByteSize(schema, rowCount), 96);
  assertEquals(getEntitySize(schema), 10);

  // A sparse partition with 9 owners exercises the same padding inside a real buffer.
  const buffer = new PartitionedBuffer(256, 16);
  const storage = buffer.addPartition<Mixed>({ name: "mixed", schema, maxOwners: rowCount });
  assertEquals(storage.byteLength, 96);
  assertEquals(storage.partitions.double.byteOffset % 8, 0);
});

Deno.test("Float16 - sparse partitions store Float16 values by entity id", () => {
  const buffer = new PartitionedBuffer(256, 16);
  const storage = buffer.addPartition<Value>({
    name: "sparseHalf",
    schema: { value: [Float16Array, 2.5] },
    maxOwners: 4,
    maxEntityId: 100,
  });

  storage.set("value", 42, 0.1);
  assertEquals(storage.get("value", 42), Math.f16round(0.1));
  assertEquals(storage.get("value", 43), undefined);
  assertEquals(storage.partitions.value.length, 4);
});

Deno.test("Float16 - clear() zeros Float16 columns", () => {
  const buffer = new PartitionedBuffer(256, 16);
  const storage = buffer.addPartition<Value>({ name: "half", schema: { value: [Float16Array, 3] } });
  buffer.clear();
  assertEquals(Array.from(storage.partitions.value), new Array(16).fill(0));
});
