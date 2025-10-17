// deno-lint-ignore-file no-explicit-any no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert@^1.0.9";
import { getEntitySize, isSchema } from "../src/Schema.ts";

Deno.test("Schema - isSchema function", () => {
  // Valid schemas
  assertEquals(isSchema({ x: Float32Array }), true);
  assertEquals(isSchema({ x: Float32Array, y: Float32Array }), true);
  assertEquals(isSchema({ value: [Int32Array, 42] }), true);
  assertEquals(isSchema(null), true);

  // Invalid schemas
  assertEquals(isSchema({}), false);
  assertEquals(isSchema(undefined), false);
  assertEquals(isSchema("string"), false);
  assertEquals(isSchema(123), false);
  assertEquals(isSchema([]), false);
  assertEquals(isSchema({ invalidProp: {} }), false);
  assertEquals(isSchema({ "123invalid": Float32Array }), false);
});

Deno.test("Schema - getEntitySize", () => {
  // Simple schema
  const simpleSchema = { x: Float32Array, y: Float32Array };
  const simpleSize = getEntitySize(simpleSchema);
  assertEquals(simpleSize, 16);

  // Mixed types schema
  const mixedSchema = {
    int8: Int8Array,
    float64: Float64Array,
    int32: Int32Array,
  };
  const mixedSize = getEntitySize(mixedSchema);
  assertEquals(mixedSize > 0, true);
  assertEquals(mixedSize % 8, 0);

  // Schema with initial values
  const initialValueSchema = {
    x: [Float32Array, 100] as [Float32ArrayConstructor, number],
    y: [Int32Array, 42] as [Int32ArrayConstructor, number],
  };
  const initialValueSize = getEntitySize(initialValueSchema);
  assertEquals(initialValueSize, 16);

  // Empty schema
  const emptySchema = {};
  assertEquals(isNaN(getEntitySize(emptySchema)), true);

  // Invalid schema
  assertEquals(isNaN(getEntitySize(null as any)), true);
  assertEquals(isNaN(getEntitySize(undefined as any)), true);
});
