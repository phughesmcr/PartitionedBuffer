// deno-lint-ignore-file no-explicit-any no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals, assertThrows } from "jsr:@std/assert@^1.0.9";
import { Partition, type PartitionSpec } from "../src/Partition.ts";
import { PartitionedBuffer } from "../src/PartitionedBuffer.ts";

Deno.test("PartitionedBuffer - Constructor validation", () => {
  // Valid construction
  const buffer = new PartitionedBuffer(1024, 8);
  assertEquals(buffer.byteLength, 1024);
  assertEquals(buffer.maxEntitiesPerPartition, 8);

  // Invalid size
  assertThrows(
    () => new PartitionedBuffer(-1, 8),
    SyntaxError,
    "size must be a Uint32 number",
  );
  assertThrows(
    () => new PartitionedBuffer(NaN, 8),
    SyntaxError,
    "size must be a Uint32 number",
  );
  assertThrows(
    () => new PartitionedBuffer(1.5, 8),
    SyntaxError,
    "size must be a Uint32 number",
  );

  // Invalid maxEntitiesPerPartition
  assertThrows(
    () => new PartitionedBuffer(1024, -1),
    SyntaxError,
    "maxEntitiesPerPartition must be a Uint32 number",
  );
  assertThrows(
    () => new PartitionedBuffer(1024, NaN),
    SyntaxError,
    "maxEntitiesPerPartition must be a Uint32 number",
  );
  assertThrows(
    () => new PartitionedBuffer(1024, 4),
    SyntaxError,
    "maxEntitiesPerPartition must be at least 8",
  );

  // Size not multiple of maxEntitiesPerPartition
  assertThrows(
    () => new PartitionedBuffer(1001, 8),
    SyntaxError,
    "size must be a multiple of maxEntitiesPerPartition",
  );
});

Deno.test("PartitionedBuffer - Constructor with defaults", () => {
  // When only size is provided, maxEntitiesPerPartition should equal size
  const buffer = new PartitionedBuffer(64);
  assertEquals(buffer.byteLength, 64);
  assertEquals(buffer.maxEntitiesPerPartition, 64);

  // Verify this works with partitions
  type TestSchema = { value: number };
  const spec: PartitionSpec<TestSchema> = {
    name: "test",
    schema: { value: Int8Array },
  };
  const partition = buffer.addPartition(new Partition(spec));
  assertEquals(partition !== null, true);
});

Deno.test("PartitionedBuffer - Null schema returns null", () => {
  const buffer = new PartitionedBuffer(1024, 8);
  const nullSpec: PartitionSpec<null> = {
    name: "null",
    schema: null,
  };
  const nullPartition = new Partition(nullSpec);
  const nullInstance = buffer.addPartition(nullPartition);
  assertEquals(nullInstance, null);
});

Deno.test("PartitionedBuffer - Basic partition creation", () => {
  const buffer = new PartitionedBuffer(1024, 8);

  // Test simple Int32Array partition
  type Int32Schema = { value: number };
  const int32Spec: PartitionSpec<Int32Schema> = {
    name: "int32",
    schema: { value: [Int32Array, 42] },
  };

  const int32Partition = new Partition(int32Spec);
  const int32Instance = buffer.addPartition(int32Partition);
  assertEquals(int32Instance !== null, true);
  assertEquals(int32Instance?.partitions.value instanceof Int32Array, true);
  assertEquals(int32Instance?.partitions.value[0], 42);

  // Test Float64Array partition
  type Float64Schema = { value: number };
  const float64Spec: PartitionSpec<Float64Schema> = {
    name: "float64",
    schema: { value: Float64Array },
  };
  const float64Partition = new Partition(float64Spec);
  const float64Instance = buffer.addPartition(float64Partition);
  assertEquals(float64Instance !== null, true);
  assertEquals(float64Instance?.partitions.value instanceof Float64Array, true);
});

Deno.test("PartitionedBuffer - Idempotent addPartition", () => {
  const buffer = new PartitionedBuffer(1024, 16);
  type TestSchema = { value: number };
  const spec: PartitionSpec<TestSchema> = {
    name: "test",
    schema: { value: Int32Array },
  };

  const partition = new Partition(spec);
  const instance1 = buffer.addPartition(partition);
  const offsetAfterFirst = buffer.getOffset();

  // Add same partition again - should return same instance
  const instance2 = buffer.addPartition(partition);
  const offsetAfterSecond = buffer.getOffset();

  assertEquals(instance1, instance2);
  assertEquals(offsetAfterFirst, offsetAfterSecond);
});

Deno.test("PartitionedBuffer - Spec vs Partition instance", () => {
  const buffer1 = new PartitionedBuffer(1024, 16);
  const buffer2 = new PartitionedBuffer(1024, 16);

  type TestSchema = { value: number };
  const spec: PartitionSpec<TestSchema> = {
    name: "test",
    schema: { value: Int32Array },
  };

  // Add using spec directly
  const instance1 = buffer1.addPartition(spec);

  // Add using Partition instance
  const instance2 = buffer2.addPartition(new Partition(spec));

  // Both should have the same structure
  assertEquals(instance1 !== null, true);
  assertEquals(instance2 !== null, true);
  assertEquals(instance1?.partitions.value instanceof Int32Array, true);
  assertEquals(instance2?.partitions.value instanceof Int32Array, true);
});

Deno.test("PartitionedBuffer - PartitionStorage API", () => {
  const buffer = new PartitionedBuffer(1024, 16);
  type TestSchema = { x: number; y: number };
  const spec: PartitionSpec<TestSchema> = {
    name: "test",
    schema: {
      x: Float32Array,
      y: Float32Array,
    },
  };

  const partition = buffer.addPartition(new Partition(spec));
  if (!partition) throw new Error("Partition creation failed");

  // Test set and get methods
  partition.set("x", 0, 42);
  partition.set("y", 0, 84);

  assertEquals(partition.get("x", 0), 42);
  assertEquals(partition.get("y", 0), 84);

  // Test get for undefined index
  assertEquals(partition.get("x", 99), undefined);

  // Test set with out-of-bounds index
  assertThrows(
    () => partition.set("x", -1, 100),
    RangeError,
    "out of bounds",
  );
  assertThrows(
    () => partition.set("x", 1000, 100),
    RangeError,
    "out of bounds",
  );
});

Deno.test("PartitionedBuffer - Byte accounting", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  // Single Float64Array should use 8 * 16 = 128 bytes aligned to 8
  type Float64Schema = { value: number };
  const float64Spec: PartitionSpec<Float64Schema> = {
    name: "float64",
    schema: { value: Float64Array },
  };

  const offsetBefore = buffer.getOffset();
  const partition = buffer.addPartition(new Partition(float64Spec));
  const offsetAfter = buffer.getOffset();

  const expectedSize = 16 * 8; // maxEntitiesPerPartition * BYTES_PER_ELEMENT
  assertEquals(offsetAfter - offsetBefore, expectedSize);
  assertEquals(partition?.byteLength, expectedSize);
  assertEquals(partition?.byteOffset, offsetBefore);
});

Deno.test("PartitionedBuffer - Memory alignment", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  type AlignmentSchema = {
    int8: number;
    int32: number;
    float64: number;
  };

  const alignmentSpec: PartitionSpec<AlignmentSchema> = {
    name: "alignment",
    schema: {
      int8: Int8Array,
      int32: Int32Array,
      float64: Float64Array,
    },
  };

  const alignmentPartition = new Partition(alignmentSpec);
  const alignmentInstance = buffer.addPartition(alignmentPartition);

  // Verify proper alignment - MIN_ALIGNMENT is 8
  assertEquals(alignmentInstance?.partitions.int8.byteOffset % 8, 0);
  assertEquals(alignmentInstance?.partitions.int32.byteOffset % 8, 0);
  assertEquals(alignmentInstance?.partitions.float64.byteOffset % 8, 0);

  // Verify data access works correctly
  if (alignmentInstance) {
    alignmentInstance.partitions.int8[0] = 1;
    alignmentInstance.partitions.int32[0] = 2;
    alignmentInstance.partitions.float64[0] = 3;

    assertEquals(alignmentInstance.partitions.int8[0], 1);
    assertEquals(alignmentInstance.partitions.int32[0], 2);
    assertEquals(alignmentInstance.partitions.float64[0], 3);
  }
});

Deno.test("PartitionedBuffer - Clear resets buffer", () => {
  const buffer = new PartitionedBuffer(1024, 16);
  type TestSchema = { value: number };
  const spec: PartitionSpec<TestSchema> = {
    name: "test",
    schema: { value: Int32Array },
  };

  const partition = buffer.addPartition(new Partition(spec));
  if (partition) {
    partition.partitions.value[0] = 42;
  }

  assertEquals(buffer.getOffset() > 0, true);
  assertEquals(buffer.hasPartition("test"), true);

  // Clear the buffer
  buffer.clear();

  // Verify everything is reset
  assertEquals(buffer.getOffset(), 0);
  assertEquals(buffer.getFreeSpace(), 1024);
  assertEquals(buffer.hasPartition("test"), false);

  // Verify we can add new partitions
  const newSpec: PartitionSpec<TestSchema> = {
    name: "new",
    schema: { value: Int32Array },
  };
  const newPartition = buffer.addPartition(new Partition(newSpec));
  assertEquals(newPartition !== null, true);
  assertEquals(newPartition?.byteOffset, 0);
});

Deno.test("PartitionedBuffer - Free space tracking", () => {
  const buffer = new PartitionedBuffer(256, 8);
  assertEquals(buffer.getFreeSpace(), 256);
  assertEquals(buffer.getOffset(), 0);

  type Int8Schema = { value: number };
  const int8Spec: PartitionSpec<Int8Schema> = {
    name: "int8",
    schema: { value: Int8Array },
  };

  const int8Partition = new Partition(int8Spec);
  buffer.addPartition(int8Partition);
  const offsetAfterInt8 = buffer.getOffset();

  assertEquals(offsetAfterInt8 > 0, true);
  assertEquals(buffer.getFreeSpace(), 256 - offsetAfterInt8);
});

Deno.test("PartitionedBuffer - Partition retrieval by name and spec", () => {
  const buffer = new PartitionedBuffer(1024, 16);
  type TestSchema = { value: number };
  const spec: PartitionSpec<TestSchema> = {
    name: "test",
    schema: { value: Int32Array },
  };

  const testPartition = new Partition(spec);
  const testInstance = buffer.addPartition(testPartition);
  const bySpec = buffer.getPartition(testPartition);
  const byName = buffer.getPartition("test");

  assertEquals(testInstance, bySpec);
  assertEquals(testInstance, byName);
  assertEquals(bySpec, byName);

  // Test non-existent partitions
  assertEquals(buffer.getPartition("nonexistent"), undefined);
  assertEquals(buffer.getPartition({ name: "nonexistent", schema: null } as any), undefined);

  // Test hasPartition
  assertEquals(buffer.hasPartition<TestSchema>(testPartition), true);
  assertEquals(buffer.hasPartition("test"), true);
  assertEquals(buffer.hasPartition("nonexistent"), false);
});

Deno.test("PartitionedBuffer - Nullish key errors", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  // getPartition with nullish keys
  assertThrows(
    () => buffer.getPartition(null as any),
    TypeError,
    "key must be a string or PartitionSpec",
  );
  assertThrows(
    () => buffer.getPartition(undefined as any),
    TypeError,
    "key must be a string or PartitionSpec",
  );

  // hasPartition with nullish keys
  assertThrows(
    () => buffer.hasPartition(null as any),
    TypeError,
    "key must be a string or PartitionSpec",
  );
  assertThrows(
    () => buffer.hasPartition(undefined as any),
    TypeError,
    "key must be a string or PartitionSpec",
  );
});

Deno.test("PartitionedBuffer - Duplicate partition names", () => {
  const buffer = new PartitionedBuffer(1024, 8);
  type Int32Schema = { value: number };

  const spec1: PartitionSpec<Int32Schema> = {
    name: "duplicate",
    schema: { value: Int32Array },
  };

  buffer.addPartition(new Partition(spec1));

  // Try to add another partition with the same name
  const spec2: PartitionSpec<Int32Schema> = {
    name: "duplicate",
    schema: { value: Float64Array },
  };

  assertThrows(
    () => buffer.addPartition(new Partition(spec2)),
    Error,
    "Partition name duplicate already exists",
  );
});

Deno.test("PartitionedBuffer - Out of memory error", () => {
  const buffer = new PartitionedBuffer(32, 8);

  type Float64Schema = { value: number };
  const bigSpec: PartitionSpec<Float64Schema> = {
    name: "big",
    schema: { value: Float64Array },
  };

  const bigPartition = new Partition(bigSpec);
  assertThrows(
    () => buffer.addPartition(bigPartition),
    Error,
    "Not enough free space",
  );
});

Deno.test("PartitionedBuffer - maxOwners validation", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  // maxOwners = 0 should throw
  const zeroOwnerSpec: PartitionSpec<{ value: number }> = {
    name: "zero_owner",
    schema: { value: Int32Array },
    maxOwners: 0,
  };

  assertThrows(
    () => buffer.addPartition(new Partition(zeroOwnerSpec)),
    Error,
    "maxOwners must be a positive integer or null",
  );

  // maxOwners = -1 should throw
  const negativeOwnerSpec: PartitionSpec<{ value: number }> = {
    name: "negative_owner",
    schema: { value: Int32Array },
    maxOwners: -1,
  };

  assertThrows(
    () => buffer.addPartition(new Partition(negativeOwnerSpec)),
    Error,
    "maxOwners must be a positive integer or null",
  );

  // maxOwners = 1.5 should throw
  const decimalOwnerSpec: PartitionSpec<{ value: number }> = {
    name: "decimal_owner",
    schema: { value: Int32Array },
    maxOwners: 1.5,
  };

  assertThrows(
    () => buffer.addPartition(new Partition(decimalOwnerSpec)),
    Error,
    "maxOwners must be a positive integer or null",
  );
});

Deno.test("PartitionedBuffer - All TypedArray types", () => {
  const buffer = new PartitionedBuffer(4096, 16);

  const typedArrayTypes = [
    { name: "int8", constructor: Int8Array, testValue: -42 },
    { name: "uint8", constructor: Uint8Array, testValue: 200 },
    { name: "uint8clamped", constructor: Uint8ClampedArray, testValue: 300 },
    { name: "int16", constructor: Int16Array, testValue: -1000 },
    { name: "uint16", constructor: Uint16Array, testValue: 50000 },
    { name: "int32", constructor: Int32Array, testValue: -1000000 },
    { name: "uint32", constructor: Uint32Array, testValue: 3000000000 },
    { name: "float32", constructor: Float32Array, testValue: 3.14159 },
    { name: "float64", constructor: Float64Array, testValue: Math.PI },
  ];

  for (const { name, constructor, testValue } of typedArrayTypes) {
    const spec: PartitionSpec<{ value: number }> = {
      name: `test_${name}`,
      schema: { value: constructor },
    };

    const partition = buffer.addPartition(new Partition(spec));
    if (partition) {
      partition.partitions.value[0] = testValue;
      const storedValue = partition.partitions.value[0];

      if (constructor === Uint8ClampedArray) {
        assertEquals(storedValue, 255);
      } else if (constructor === Float32Array) {
        assertEquals(Math.abs(storedValue - testValue) < 0.001, true);
      } else {
        assertEquals(storedValue, testValue);
      }
    }
  }
});

Deno.test("PartitionedBuffer - Edge cases", () => {
  // Test with maximum safe integer size
  assertThrows(
    () => new PartitionedBuffer(Number.MAX_SAFE_INTEGER, 16),
    SyntaxError,
    "size must be a Uint32 number",
  );

  // Test with non-integer maxEntitiesPerPartition
  assertThrows(
    () => new PartitionedBuffer(1024, 16.5),
    SyntaxError,
    "maxEntitiesPerPartition must be a Uint32 number",
  );

  // Test with very large maxEntitiesPerPartition
  assertThrows(
    () => new PartitionedBuffer(1024, 2048),
    SyntaxError,
    "size must be a multiple of maxEntitiesPerPartition",
  );
});

Deno.test("PartitionedBuffer - State consistency after errors", () => {
  const buffer = new PartitionedBuffer(128, 16);

  // Add a valid partition
  const validSpec: PartitionSpec<{ value: number }> = {
    name: "valid",
    schema: { value: Int8Array },
  };
  const validPartition = buffer.addPartition(new Partition(validSpec));
  assertEquals(validPartition !== null, true);

  const offsetAfterValid = buffer.getOffset();
  const freeSpaceAfterValid = buffer.getFreeSpace();

  // Try to add an invalid partition (too large)
  const invalidSpec: PartitionSpec<{ value: number }> = {
    name: "invalid",
    schema: { value: Float64Array },
  };

  assertThrows(() => buffer.addPartition(new Partition(invalidSpec)));

  // Verify buffer state is unchanged after failed operation
  assertEquals(buffer.getOffset(), offsetAfterValid);
  assertEquals(buffer.getFreeSpace(), freeSpaceAfterValid);
  assertEquals(buffer.hasPartition("valid"), true);
  assertEquals(buffer.hasPartition("invalid"), false);

  // Verify valid partition still works
  if (validPartition) {
    validPartition.partitions.value[0] = 42;
    assertEquals(validPartition.partitions.value[0], 42);
  }
});

Deno.test("PartitionedBuffer - Buffer overflow protection", () => {
  const buffer = new PartitionedBuffer(256, 16);

  type LargeSchema = { value: number };
  const largeSpec: PartitionSpec<LargeSchema> = {
    name: "large",
    schema: { value: Int32Array },
  };

  const partition = buffer.addPartition(new Partition(largeSpec));
  assertEquals(partition !== null, true);

  if (partition) {
    const array = partition.partitions.value;

    // Test writing within bounds
    array[0] = 42;
    assertEquals(array[0], 42);

    // Test writing at the edge of the buffer
    const lastIndex = array.length - 1;
    array[lastIndex] = 43;
    assertEquals(array[lastIndex], 43);

    // TypedArrays silently ignore out-of-bounds writes
    array[array.length] = 44;
    assertEquals(array[array.length], undefined);

    // TypedArrays return undefined for out-of-bounds reads
    assertEquals(array[array.length], undefined);
  }
});
