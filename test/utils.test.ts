// deno-lint-ignore-file no-explicit-any no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert@^1.0.9";
import { sparseFacade } from "../src/SparseFacade.ts";
import {
  disposeSparseArray,
  FORBIDDEN_NAMES,
  hasOwnProperty,
  isNumber,
  isNumberBetween,
  isObject,
  isPositiveUint32,
  isTypedArray,
  isTypedArrayConstructor,
  isUint32,
  isValidName,
  isValidTypedArrayValue,
  VALID_NAME_PATTERN,
  zeroArray,
} from "../src/utils.ts";

Deno.test("Utils - isValidName", () => {
  // Valid names
  assertEquals(isValidName("validName"), true);
  assertEquals(isValidName("valid_name"), true);
  assertEquals(isValidName("valid123"), true);
  assertEquals(isValidName("_underscore"), true);
  assertEquals(isValidName("$dollar"), true);

  // Invalid names
  assertEquals(isValidName("123invalid"), false);
  assertEquals(isValidName("invalid-name"), false);
  assertEquals(isValidName("invalid.name"), false);
  assertEquals(isValidName("invalid name"), false);
  assertEquals(isValidName(""), false);
  assertEquals(isValidName("   "), false);

  // Test forbidden names
  for (const forbiddenName of FORBIDDEN_NAMES) {
    assertEquals(isValidName(forbiddenName), false);
  }

  // Test length limits
  const longName = "a".repeat(256);
  assertEquals(isValidName(longName), false);

  const maxLengthName = "a".repeat(255);
  assertEquals(isValidName(maxLengthName), true);

  // Non-string inputs
  assertEquals(isValidName(123 as any), false);
  assertEquals(isValidName(null as any), false);
  assertEquals(isValidName(undefined as any), false);
});

Deno.test("Utils - isTypedArrayConstructor", () => {
  // Valid constructors
  assertEquals(isTypedArrayConstructor(Int8Array), true);
  assertEquals(isTypedArrayConstructor(Uint8Array), true);
  assertEquals(isTypedArrayConstructor(Uint8ClampedArray), true);
  assertEquals(isTypedArrayConstructor(Int16Array), true);
  assertEquals(isTypedArrayConstructor(Uint16Array), true);
  assertEquals(isTypedArrayConstructor(Int32Array), true);
  assertEquals(isTypedArrayConstructor(Uint32Array), true);
  assertEquals(isTypedArrayConstructor(Float32Array), true);
  assertEquals(isTypedArrayConstructor(Float64Array), true);

  // Invalid constructors
  assertEquals(isTypedArrayConstructor(Array), false);
  assertEquals(isTypedArrayConstructor(Object), false);
  assertEquals(isTypedArrayConstructor(String), false);
  assertEquals(isTypedArrayConstructor(Number), false);
  assertEquals(isTypedArrayConstructor(null), false);
  assertEquals(isTypedArrayConstructor(undefined), false);
});

Deno.test("Utils - isValidTypedArrayValue", () => {
  // Int8Array boundaries
  assertEquals(isValidTypedArrayValue(Int8Array, -128), true);
  assertEquals(isValidTypedArrayValue(Int8Array, 127), true);
  assertEquals(isValidTypedArrayValue(Int8Array, -129), false);
  assertEquals(isValidTypedArrayValue(Int8Array, 128), false);
  assertEquals(isValidTypedArrayValue(Int8Array, 1.5), false);

  // Uint8Array boundaries
  assertEquals(isValidTypedArrayValue(Uint8Array, 0), true);
  assertEquals(isValidTypedArrayValue(Uint8Array, 255), true);
  assertEquals(isValidTypedArrayValue(Uint8Array, -1), false);
  assertEquals(isValidTypedArrayValue(Uint8Array, 256), false);

  // Float arrays - should accept any number
  assertEquals(isValidTypedArrayValue(Float32Array, Number.MAX_VALUE), true);
  assertEquals(isValidTypedArrayValue(Float32Array, -Number.MAX_VALUE), true);
  assertEquals(isValidTypedArrayValue(Float32Array, 1.5), true);
  assertEquals(isValidTypedArrayValue(Float64Array, Number.MAX_VALUE), true);

  // Invalid inputs
  assertEquals(isValidTypedArrayValue(Int8Array, NaN), false);
  assertEquals(isValidTypedArrayValue(null as any, 0), false);
});

Deno.test("Utils - isUint32", () => {
  // Valid Uint32 values
  assertEquals(isUint32(0), true);
  assertEquals(isUint32(1), true);
  assertEquals(isUint32(4294967295), true);

  // Invalid values
  assertEquals(isUint32(-1), false);
  assertEquals(isUint32(4294967296), false);
  assertEquals(isUint32(1.5), false);
  assertEquals(isUint32(NaN), false);
  assertEquals(isUint32(Infinity), false);
  assertEquals(isUint32(-Infinity), false);
});

Deno.test("Utils - isObject", () => {
  // Valid objects
  assertEquals(isObject({}), true);
  assertEquals(isObject({ key: "value" }), true);
  assertEquals(isObject(new Date()), true);
  assertEquals(isObject(null), true);

  // Invalid objects
  assertEquals(isObject([]), false);
  assertEquals(isObject(undefined), false);
  assertEquals(isObject("string"), false);
  assertEquals(isObject(123), false);
  assertEquals(isObject(true), false);
});

Deno.test("Utils - zeroArray", () => {
  // Test with various TypedArrays
  const int8Array = new Int8Array([1, 2, 3, 4]);
  const result = zeroArray(int8Array);
  assertEquals(result, int8Array);
  assertEquals(Array.from(int8Array), [0, 0, 0, 0]);

  const float32Array = new Float32Array([1.5, 2.5, 3.5]);
  zeroArray(float32Array);
  assertEquals(Array.from(float32Array), [0, 0, 0]);

  // Test with sparse facade
  const dense = new Int32Array([1, 2, 3]);
  const sparse = sparseFacade(dense);
  sparse[10] = 42;

  try {
    zeroArray(sparse);
    assertEquals(Array.from(dense), [0, 0, 0]);
  } catch (error) {
    assertEquals(error instanceof TypeError, true);
  }
});

Deno.test("Utils - isNumber", () => {
  // Valid numbers
  assertEquals(isNumber(0), true);
  assertEquals(isNumber(42), true);
  assertEquals(isNumber(-42), true);
  assertEquals(isNumber(3.14), true);
  assertEquals(isNumber(Number.MAX_VALUE), true);
  assertEquals(isNumber(Number.MIN_VALUE), true);
  assertEquals(isNumber(Infinity), true);
  assertEquals(isNumber(-Infinity), true);
  assertEquals(isNumber(NaN), true);

  // Invalid numbers
  assertEquals(isNumber("42"), false);
  assertEquals(isNumber(null), false);
  assertEquals(isNumber(undefined), false);
  assertEquals(isNumber({}), false);
  assertEquals(isNumber([]), false);
  assertEquals(isNumber(true), false);
});

Deno.test("Utils - isPositiveUint32", () => {
  // Valid positive Uint32 values
  assertEquals(isPositiveUint32(1), true);
  assertEquals(isPositiveUint32(42), true);
  assertEquals(isPositiveUint32(4294967295), true);

  // Invalid values
  assertEquals(isPositiveUint32(0), false);
  assertEquals(isPositiveUint32(-1), false);
  assertEquals(isPositiveUint32(4294967296), false);
  assertEquals(isPositiveUint32(1.5), false);
  assertEquals(isPositiveUint32(NaN), false);
  assertEquals(isPositiveUint32(Infinity), false);
});

Deno.test("Utils - isNumberBetween", () => {
  // Inclusive tests
  assertEquals(isNumberBetween(5, 1, 10), true);
  assertEquals(isNumberBetween(1, 1, 10), true);
  assertEquals(isNumberBetween(10, 1, 10), true);
  assertEquals(isNumberBetween(0, 1, 10), false);
  assertEquals(isNumberBetween(11, 1, 10), false);

  // Explicit inclusive tests
  assertEquals(isNumberBetween(1, 1, 10, true), true);
  assertEquals(isNumberBetween(10, 1, 10, true), true);

  // Exclusive tests
  assertEquals(isNumberBetween(5, 1, 10, false), true);
  assertEquals(isNumberBetween(1, 1, 10, false), false);
  assertEquals(isNumberBetween(10, 1, 10, false), false);
  assertEquals(isNumberBetween(0, 1, 10, false), false);
  assertEquals(isNumberBetween(11, 1, 10, false), false);

  // Test with negative numbers
  assertEquals(isNumberBetween(-5, -10, -1), true);
  assertEquals(isNumberBetween(-10, -10, -1), true);
  assertEquals(isNumberBetween(-1, -10, -1), true);
  assertEquals(isNumberBetween(-11, -10, -1), false);
  assertEquals(isNumberBetween(0, -10, -1), false);

  // Test with floats
  assertEquals(isNumberBetween(3.14, 3, 4), true);
  assertEquals(isNumberBetween(2.99, 3, 4), false);
});

Deno.test("Utils - hasOwnProperty", () => {
  const obj = { a: 1, b: 2, c: 3 };

  // Valid properties
  assertEquals(hasOwnProperty(obj, "a"), true);
  assertEquals(hasOwnProperty(obj, "b"), true);
  assertEquals(hasOwnProperty(obj, "c"), true);

  // Invalid properties
  assertEquals(hasOwnProperty(obj, "d"), false);
  assertEquals(hasOwnProperty(obj, "toString"), false);

  // Test with array
  const arr = [1, 2, 3];
  assertEquals(hasOwnProperty(arr, 0), true);
  assertEquals(hasOwnProperty(arr, "0"), true);
  assertEquals(hasOwnProperty(arr, "length"), true);
  assertEquals(hasOwnProperty(arr, 5), false);

  // Test with null/undefined
  assertEquals(hasOwnProperty(null as any, "a"), false);
  assertEquals(hasOwnProperty(undefined as any, "a"), false);
});

Deno.test("Utils - isTypedArray", () => {
  // Valid TypedArrays
  assertEquals(isTypedArray(new Int8Array()), true);
  assertEquals(isTypedArray(new Uint8Array()), true);
  assertEquals(isTypedArray(new Uint8ClampedArray()), true);
  assertEquals(isTypedArray(new Int16Array()), true);
  assertEquals(isTypedArray(new Uint16Array()), true);
  assertEquals(isTypedArray(new Int32Array()), true);
  assertEquals(isTypedArray(new Uint32Array()), true);
  assertEquals(isTypedArray(new Float32Array()), true);
  assertEquals(isTypedArray(new Float64Array()), true);

  // Invalid arrays/objects
  assertEquals(isTypedArray([]), false);
  assertEquals(isTypedArray(new DataView(new ArrayBuffer(8))), false);
  assertEquals(isTypedArray({}), false);
  assertEquals(isTypedArray(null), false);
  assertEquals(isTypedArray(undefined), false);
  assertEquals(isTypedArray("string"), false);
  assertEquals(isTypedArray(new ArrayBuffer(8)), false);
});

Deno.test("Utils - disposeSparseArray", () => {
  // Test with regular TypedArray
  const regular = new Int32Array([1, 2, 3]);
  disposeSparseArray(regular);
  assertEquals(Array.from(regular), [1, 2, 3]);

  // Test with SparseFacade
  const dense = new Int32Array([1, 2, 3, 4]);
  const sparse = sparseFacade(dense);

  sparse[10] = 42;
  sparse[20] = 84;

  assertEquals(sparse[10], 42);
  assertEquals(sparse[20], 84);

  disposeSparseArray(sparse);

  assertEquals(sparse[10], undefined);
  assertEquals(sparse[20], undefined);
  assertEquals(Array.from(dense), [0, 0, 0, 0]);
});

Deno.test("Utils - VALID_NAME_PATTERN", () => {
  // Test valid patterns
  assertEquals(VALID_NAME_PATTERN.test("validName"), true);
  assertEquals(VALID_NAME_PATTERN.test("valid_name"), true);
  assertEquals(VALID_NAME_PATTERN.test("valid123"), true);
  assertEquals(VALID_NAME_PATTERN.test("_underscore"), true);
  assertEquals(VALID_NAME_PATTERN.test("$dollar"), true);
  assertEquals(VALID_NAME_PATTERN.test("a"), true);
  assertEquals(VALID_NAME_PATTERN.test("ABC"), true);

  // Test invalid patterns
  assertEquals(VALID_NAME_PATTERN.test("123invalid"), false);
  assertEquals(VALID_NAME_PATTERN.test("invalid-name"), false);
  assertEquals(VALID_NAME_PATTERN.test("invalid.name"), false);
  assertEquals(VALID_NAME_PATTERN.test("invalid name"), false);
  assertEquals(VALID_NAME_PATTERN.test("invalid@name"), false);
  assertEquals(VALID_NAME_PATTERN.test(""), false);
  assertEquals(VALID_NAME_PATTERN.test("invalid/name"), false);
});
