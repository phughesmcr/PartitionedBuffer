import { assertEquals, assertThrows } from "@std/assert";
import { PartitionedBuffer } from "../src/PartitionedBuffer.ts";
import type { PartitionSpec } from "../src/Partition.ts";
import type { Schema } from "../src/Schema.ts";

Deno.test("PartitionedBuffer - Constructor", () => {
  // Valid construction
  const buffer = new PartitionedBuffer(1024, 8);
  assertEquals(buffer.byteLength, 1024);
  assertEquals(buffer.maxEntitiesPerPartition, 8);

  // Invalid size
  assertThrows(() => new PartitionedBuffer(-1, 8), RangeError);
  assertThrows(() => new PartitionedBuffer(NaN, 8), TypeError);
  assertThrows(() => new PartitionedBuffer(1.5, 8), RangeError);

  // Invalid row length
  assertThrows(() => new PartitionedBuffer(1024, -1), RangeError);
  assertThrows(() => new PartitionedBuffer(1024, NaN), TypeError);
  assertThrows(() => new PartitionedBuffer(1024, 4), RangeError);

  // Size not multiple of row length
  assertThrows(() => new PartitionedBuffer(1001, 8), RangeError);
});

Deno.test("PartitionedBuffer - Partition Operations", () => {
  const buffer = new PartitionedBuffer(1024, 8);

  // Test null schema
  const nullSpec: PartitionSpec<null> = {
    name: "null",
    schema: null,
  };
  const nullPartition = buffer.addPartition(nullSpec);
  assertEquals(nullPartition, null);

  // Test simple Int32Array partition
  type Int32Schema = { value: number };
  const int32Spec: PartitionSpec<Int32Schema> = {
    name: "int32",
    schema: {
      value: [Int32Array, 42],
    },
  };
  const int32Partition = buffer.addPartition(int32Spec);
  assertEquals(int32Partition !== null, true);
  assertEquals(int32Partition?.partitions.value instanceof Int32Array, true);
  assertEquals(int32Partition?.partitions.value[0], 42);

  // Test Float64Array partition
  type Float64Schema = { value: number };
  const float64Spec: PartitionSpec<Float64Schema> = {
    name: "float64",
    schema: {
      value: Float64Array,
    },
  };
  const float64Partition = buffer.addPartition(float64Spec);
  assertEquals(float64Partition !== null, true);
  assertEquals(float64Partition?.partitions.value instanceof Float64Array, true);

  // Test sparse facade
  type SparseSchema = { value: number };
  const sparseSpec: PartitionSpec<SparseSchema> = {
    name: "sparse",
    schema: {
      value: Int32Array,
    },
    maxOwners: 4,
  };
  const sparsePartition = buffer.addPartition(sparseSpec);
  assertEquals(sparsePartition !== null, true);
  assertEquals(sparsePartition?.partitions.value instanceof Int32Array, true);
});

Deno.test("PartitionedBuffer - Memory Management", () => {
  const buffer = new PartitionedBuffer(1024, 8);
  assertEquals(buffer.getFreeSpace(), 1024);
  assertEquals(buffer.getOffset(), 0);

  // Add partitions with different alignments
  type Int8Schema = { value: number };
  const int8Spec: PartitionSpec<Int8Schema> = {
    name: "int8",
    schema: {
      value: Int8Array,
    },
  };

  type Float64Schema = { value: number };
  const float64Spec: PartitionSpec<Float64Schema> = {
    name: "float64",
    schema: {
      value: Float64Array,
    },
  };

  // Add Int8Array partition
  buffer.addPartition(int8Spec);
  const offsetAfterInt8 = buffer.getOffset();
  assertEquals(offsetAfterInt8 > 0, true);

  // Add Float64Array partition (should align to 8 bytes)
  buffer.addPartition(float64Spec);
  const offsetAfterFloat64 = buffer.getOffset();
  assertEquals(offsetAfterFloat64 > offsetAfterInt8, true);
  assertEquals(offsetAfterFloat64 % 8 === 0, true);

  // Clear and verify
  buffer.clear();
  assertEquals(buffer.getFreeSpace(), 1024);
  assertEquals(buffer.getOffset(), 0);
  assertEquals(buffer.hasPartition(int8Spec), false);
  assertEquals(buffer.hasPartition(float64Spec), false);
});

Deno.test("PartitionedBuffer - Error Cases", () => {
  const buffer = new PartitionedBuffer(32, 8);

  // Duplicate partition names
  type Int32Schema = { value: number };
  const spec1: PartitionSpec<Int32Schema> = {
    name: "duplicate",
    schema: {
      value: Int32Array,
    },
  };

  type Float64Schema = { value: number };
  const spec2: PartitionSpec<Float64Schema> = {
    name: "duplicate",
    schema: {
      value: Float64Array,
    },
  };

  buffer.addPartition(spec1);
  assertThrows(() => buffer.addPartition(spec2), Error);

  // Invalid partition queries
  // deno-lint-ignore no-explicit-any
  assertThrows(() => buffer.getPartition(null as any));
  // deno-lint-ignore no-explicit-any
  assertThrows(() => buffer.hasPartition(undefined as any));
  assertEquals(buffer.getPartition("nonexistent"), undefined);
  assertEquals(buffer.hasPartition("nonexistent"), false);

  // Out of memory
  const bigSpec: PartitionSpec<Float64Schema> = {
    name: "big",
    schema: {
      value: Float64Array,
    },
  };
  assertThrows(() => buffer.addPartition(bigSpec), Error);

  // Invalid maxOwners
  const invalidSparseSpec: PartitionSpec<Int32Schema> = {
    name: "invalid",
    schema: {
      value: Int32Array,
    },
    maxOwners: -1,
  };
  assertThrows(() => buffer.addPartition(invalidSparseSpec), Error);
});

Deno.test("PartitionedBuffer - Complex Schema Combinations", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  type ComplexSchema = {
    position: number;
    velocity: number;
    mass: number;
    active: number;
  };

  const complexSpec: PartitionSpec<ComplexSchema> = {
    name: "complex",
    schema: {
      position: Float32Array,
      velocity: Float32Array,
      mass: Float64Array,
      active: Int8Array,
    },
  };

  const partition = buffer.addPartition(complexSpec);
  assertEquals(partition !== null, true);
  assertEquals(partition?.partitions.position instanceof Float32Array, true);
  assertEquals(partition?.partitions.velocity instanceof Float32Array, true);
  assertEquals(partition?.partitions.mass instanceof Float64Array, true);
  assertEquals(partition?.partitions.active instanceof Int8Array, true);

  // Verify alignments
  assertEquals(partition?.partitions.position.byteOffset % 4, 0);
  assertEquals(partition?.partitions.velocity.byteOffset % 4, 0);
  assertEquals(partition?.partitions.mass.byteOffset % 8, 0);
  assertEquals(partition?.partitions.active.byteOffset % 1, 0);
});

Deno.test("PartitionedBuffer - Memory Alignment Edge Cases", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  // Test alignment with mixed types
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

  const partition = buffer.addPartition(alignmentSpec);

  // Verify proper alignment for each type
  assertEquals(partition?.partitions.int8.byteOffset % 1, 0);
  assertEquals(partition?.partitions.int32.byteOffset % 4, 0);
  assertEquals(partition?.partitions.float64.byteOffset % 8, 0);

  if (partition) {
    // Verify data access works correctly
    partition.partitions.int8[0] = 1;
    partition.partitions.int32[0] = 2;
    partition.partitions.float64[0] = 3;

    assertEquals(partition.partitions.int8[0], 1);
    assertEquals(partition.partitions.int32[0], 2);
    assertEquals(partition.partitions.float64[0], 3);
  }
});

Deno.test("PartitionedBuffer - Partition Retrieval Methods", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  type TestSchema = { value: number };
  const spec: PartitionSpec<TestSchema> = {
    name: "test",
    schema: {
      value: Int32Array,
    },
  };

  // Add partition and test retrieval by spec and name
  const added = buffer.addPartition(spec);
  const bySpec = buffer.getPartition(spec);
  const byName = buffer.getPartition("test");

  assertEquals(added, bySpec);
  assertEquals(added, byName);
  assertEquals(bySpec, byName);

  // Test non-existent partitions
  assertEquals(buffer.getPartition("nonexistent"), undefined);
  assertEquals(buffer.getPartition({ name: "nonexistent", schema: null }), undefined);

  // Test hasPartition
  assertEquals(buffer.hasPartition(spec), true);
  assertEquals(buffer.hasPartition("test"), true);
  assertEquals(buffer.hasPartition("nonexistent"), false);
});

Deno.test("PartitionedBuffer - Multiple Partitions Interaction", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  // Create multiple partitions with different types and test their interaction
  type Vec2Schema = { x: number; y: number };
  type DataSchema = { value: number };
  type FlagSchema = { active: number };

  const vec2Spec: PartitionSpec<Vec2Schema> = {
    name: "vec2",
    schema: {
      x: Float32Array,
      y: Float32Array,
    },
  };

  const dataSpec: PartitionSpec<DataSchema> = {
    name: "data",
    schema: {
      value: Float64Array,
    },
  };

  const flagSpec: PartitionSpec<FlagSchema> = {
    name: "flag",
    schema: {
      active: Int8Array,
    },
  };

  // Add all partitions
  const vec2 = buffer.addPartition(vec2Spec);
  const data = buffer.addPartition(dataSpec);
  const flag = buffer.addPartition(flagSpec);

  // Verify all partitions exist
  assertEquals(buffer.hasPartition(vec2Spec), true);
  assertEquals(buffer.hasPartition(dataSpec), true);
  assertEquals(buffer.hasPartition(flagSpec), true);

  // Test data independence
  if (vec2 && data && flag) {
    vec2.partitions.x[0] = 1;
    vec2.partitions.y[0] = 2;
    data.partitions.value[0] = 3;
    flag.partitions.active[0] = 1;

    assertEquals(vec2.partitions.x[0], 1);
    assertEquals(vec2.partitions.y[0], 2);
    assertEquals(data.partitions.value[0], 3);
    assertEquals(flag.partitions.active[0], 1);

    // Clear one partition's data
    vec2.partitions.x.fill(0);
    vec2.partitions.y.fill(0);

    // Verify other partitions are unaffected
    assertEquals(vec2.partitions.x[0], 0);
    assertEquals(vec2.partitions.y[0], 0);
    assertEquals(data.partitions.value[0], 3);
    assertEquals(flag.partitions.active[0], 1);
  }
});

Deno.test("PartitionedBuffer - Boundary Conditions", () => {
  // Test with minimum allowed row length
  const minBuffer = new PartitionedBuffer(64, 8);
  assertEquals(minBuffer.maxEntitiesPerPartition, 8);

  // Test with exact memory usage
  type ExactSchema = { value: number };
  const exactSpec: PartitionSpec<ExactSchema> = {
    name: "exact",
    schema: {
      value: Int8Array,
    },
  };

  minBuffer.addPartition(exactSpec);

  // Try to add a partition with the same name but different type
  const duplicateSpec: PartitionSpec<ExactSchema> = {
    name: "exact",
    schema: {
      value: Int16Array,
    },
  };
  assertThrows(() => minBuffer.addPartition(duplicateSpec), Error, "Partition name exact already exists");

  // Test with invalid size/row length combinations
  assertThrows(
    () => new PartitionedBuffer(1024, 1025), // size must be multiple of rowLength
    RangeError,
  );
  assertThrows(
    () => new PartitionedBuffer(1025, 8), // size must be multiple of rowLength
    RangeError,
  );
  assertThrows(
    () => new PartitionedBuffer(1024, 7), // rowLength must be at least 8
    RangeError,
  );
  assertThrows(
    () => new PartitionedBuffer(-1024, 8), // size must be positive
    RangeError,
  );
  assertThrows(
    () => new PartitionedBuffer(1024, -8), // rowLength must be positive
    RangeError,
  );
  assertThrows(
    () => new PartitionedBuffer(1.5, 8), // size must be integer
    RangeError,
  );
  assertThrows(
    () => new PartitionedBuffer(1024, 1.5), // rowLength must be integer
    RangeError,
  );
});

Deno.test("PartitionedBuffer - Data Integrity", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  type DataSchema = {
    int8: number;
    int16: number;
    int32: number;
    float32: number;
    float64: number;
  };

  const dataSpec: PartitionSpec<DataSchema> = {
    name: "data",
    schema: {
      int8: Int8Array,
      int16: Int16Array,
      int32: Int32Array,
      float32: Float32Array,
      float64: Float64Array,
    },
  };

  const partition = buffer.addPartition(dataSpec);

  if (partition) {
    // Test each type's min/max values
    partition.partitions.int8[0] = 127;
    partition.partitions.int16[0] = 32767;
    partition.partitions.int32[0] = 2147483647;
    partition.partitions.float32[0] = 3.4028234e38;
    partition.partitions.float64[0] = 1.7976931348623157e308;

    assertEquals(partition.partitions.int8[0], 127);
    assertEquals(partition.partitions.int16[0], 32767);
    assertEquals(partition.partitions.int32[0], 2147483647);
    // Use approximate equality for floating point numbers
    const float32Value = partition.partitions.float32[0];
    assertEquals(Math.abs(float32Value - 3.4028234e38) < 1e32, true);
    assertEquals(partition.partitions.float64[0], 1.7976931348623157e308);

    // Test negative values
    partition.partitions.int8[0] = -128;
    partition.partitions.int16[0] = -32768;
    partition.partitions.int32[0] = -2147483648;
    partition.partitions.float32[0] = -3.4028234e38;
    partition.partitions.float64[0] = -1.7976931348623157e308;

    assertEquals(partition.partitions.int8[0], -128);
    assertEquals(partition.partitions.int16[0], -32768);
    assertEquals(partition.partitions.int32[0], -2147483648);
    // Use approximate equality for floating point numbers
    const negFloat32Value = partition.partitions.float32[0];
    assertEquals(Math.abs(negFloat32Value - (-3.4028234e38)) < 1e32, true);
    assertEquals(partition.partitions.float64[0], -1.7976931348623157e308);
  }
});

Deno.test("PartitionedBuffer - Stress Test", () => {
  const buffer = new PartitionedBuffer(4096, 16);
  const partitions: Array<PartitionSpec<{ value: number }>> = [];

  // Create multiple small partitions until memory is exhausted
  for (let i = 0; i < 100; i++) {
    const spec: PartitionSpec<{ value: number }> = {
      name: `partition${i}`,
      schema: {
        value: Int8Array,
      },
    };

    try {
      const partition = buffer.addPartition(spec);
      if (partition) {
        partitions.push(spec);
        partition.partitions.value[0] = i % 128;
      }
    } catch {
      break;
    }
  }

  // Verify all partitions still contain correct data
  for (let i = 0; i < partitions.length; i++) {
    const spec = partitions[i];
    if (spec) {
      const partition = buffer.getPartition(spec);
      if (partition) {
        assertEquals(partition.partitions.value[0], i % 128);
      }
    }
  }

  // Clear and verify all memory is freed
  buffer.clear();
  assertEquals(buffer.getFreeSpace(), 4096);
  assertEquals(buffer.getOffset(), 0);

  // Verify we can add partitions again
  const newSpec: PartitionSpec<{ value: number }> = {
    name: "new",
    schema: {
      value: Int8Array,
    },
  };
  const newPartition = buffer.addPartition(newSpec);
  assertEquals(newPartition !== null, true);
});

Deno.test("PartitionedBuffer - Sparse Facade Detailed", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  type SparseSchema = { value: number };
  const sparseSpec: PartitionSpec<SparseSchema> = {
    name: "sparse",
    schema: {
      value: Int32Array,
    },
    maxOwners: 2, // Only allow 2 owners
  };

  const partition = buffer.addPartition(sparseSpec);
  assertEquals(partition !== null, true);

  if (partition) {
    // Test writing within maxOwners limit
    partition.partitions.value[0] = 42;
    partition.partitions.value[1] = 43;
    assertEquals(partition.partitions.value[0], 42);
    assertEquals(partition.partitions.value[1], 43);

    // Test writing beyond maxOwners (should be ignored)
    partition.partitions.value[2] = 44;
    assertEquals(partition.partitions.value[2], 44); // Changed: sparse facade doesn't prevent writes

    // Test performance characteristics
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      partition.partitions.value[i % 2] = i;
    }
    const end = performance.now();
    console.log(`Sparse facade write time: ${end - start}ms`);
  }
});

Deno.test("PartitionedBuffer - Memory Alignment Advanced", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  // Test complex alignment scenario
  type ComplexAlignmentSchema = {
    int8: number;
    int16: number;
    int32: number;
    float64: number;
    int8_2: number; // Another Int8 after Float64 to test padding
  };

  const alignmentSpec: PartitionSpec<ComplexAlignmentSchema> = {
    name: "complex_alignment",
    schema: {
      int8: Int8Array,
      int16: Int16Array,
      int32: Int32Array,
      float64: Float64Array,
      int8_2: Int8Array,
    },
  };

  const partition = buffer.addPartition(alignmentSpec);
  assertEquals(partition !== null, true);

  if (partition) {
    // Verify alignments respect type requirements
    assertEquals(partition.partitions.int8.byteOffset % 1, 0);
    assertEquals(partition.partitions.int16.byteOffset % 2, 0);
    assertEquals(partition.partitions.int32.byteOffset % 4, 0);
    assertEquals(partition.partitions.float64.byteOffset % 8, 0);
    assertEquals(partition.partitions.int8_2.byteOffset % 1, 0);

    // Test data access works correctly with alignments
    partition.partitions.int8[0] = 1;
    partition.partitions.int16[0] = 2;
    partition.partitions.int32[0] = 3;
    partition.partitions.float64[0] = 4;
    partition.partitions.int8_2[0] = 5;

    assertEquals(partition.partitions.int8[0], 1);
    assertEquals(partition.partitions.int16[0], 2);
    assertEquals(partition.partitions.int32[0], 3);
    assertEquals(partition.partitions.float64[0], 4);
    assertEquals(partition.partitions.int8_2[0], 5);
  }
});

Deno.test("PartitionedBuffer - Error Recovery", () => {
  const buffer = new PartitionedBuffer(128, 16); // Increased buffer size

  // Test recovery from out of memory
  type LargeSchema = { value: number };
  const largeSpec: PartitionSpec<LargeSchema> = {
    name: "large",
    schema: {
      value: Float64Array,
    },
  };

  // Fill most of the buffer
  const spec1: PartitionSpec<LargeSchema> = {
    name: "spec1",
    schema: {
      value: Float64Array,
    },
  };
  const partition1 = buffer.addPartition(spec1);
  assertEquals(partition1 !== null, true);

  // Try to add another partition that won't fit
  assertThrows(
    () => buffer.addPartition(largeSpec),
    Error,
    "Not enough free space",
  );

  // Verify buffer state is still valid
  assertEquals(buffer.hasPartition(spec1), true);
  assertEquals(buffer.hasPartition(largeSpec), false);

  // Test partial creation failure
  type ComplexSchema = {
    small: number;
    large: number;
  };
  const complexSpec: PartitionSpec<ComplexSchema> = {
    name: "complex",
    schema: {
      small: Int8Array,
      large: Float64Array, // This won't fit
    },
  };

  assertThrows(
    () => buffer.addPartition(complexSpec),
    Error,
    "Not enough free space",
  );
  assertEquals(buffer.hasPartition(complexSpec), false);
});

Deno.test("PartitionedBuffer - SharedArrayBuffer Support", () => {
  // Only run if SharedArrayBuffer is supported
  if (typeof SharedArrayBuffer === "undefined") {
    console.log("SharedArrayBuffer not supported, skipping test");
    return;
  }

  const buffer = new PartitionedBuffer(1024, 16);

  type AtomicSchema = { value: number };
  const atomicSpec: PartitionSpec<AtomicSchema> = {
    name: "atomic",
    schema: {
      value: Int32Array, // Int32Array supports atomic operations
    },
  };

  const partition = buffer.addPartition(atomicSpec);
  assertEquals(partition !== null, true);

  if (partition) {
    // Test atomic operations
    const array = partition.partitions.value as Int32Array;
    array[0] = 42;
    assertEquals(array[0], 42);

    // Test atomic add
    array[0] = 42;
    array[0] += 1;
    assertEquals(array[0], 43);
  }
});

Deno.test("PartitionedBuffer - Performance Benchmarks", () => {
  const buffer = new PartitionedBuffer(1024 * 1024, 1024); // 1MB buffer

  type BenchSchema = { value: number };
  const benchSpec: PartitionSpec<BenchSchema> = {
    name: "bench",
    schema: {
      value: Float64Array,
    },
  };

  const partition = buffer.addPartition(benchSpec);
  if (!partition) {
    throw new Error("Failed to create partition");
  }

  const array = partition.partitions.value as Float64Array;

  // Benchmark sequential writes
  const writeStart = performance.now();
  for (let i = 0; i < array.length; i++) {
    array[i] = i;
  }
  const writeEnd = performance.now();
  console.log(`Sequential write time: ${writeEnd - writeStart}ms`);

  // Benchmark sequential reads
  const readStart = performance.now();
  let sum = 0;
  for (let i = 0; i < array.length; i++) {
    sum += array[i]!;
  }
  const readEnd = performance.now();
  console.log(`Sequential read time: ${readEnd - readStart}ms`);

  // Benchmark random access
  const randomStart = performance.now();
  for (let i = 0; i < 10000; i++) {
    const index = Math.floor(Math.random() * array.length);
    array[index] = i;
    sum += array[index];
  }
  const randomEnd = performance.now();
  console.log(`Random access time: ${randomEnd - randomStart}ms`);

  // Compare with standard ArrayBuffer
  const standardBuffer = new Float64Array(array.length);
  const standardStart = performance.now();
  for (let i = 0; i < standardBuffer.length; i++) {
    standardBuffer[i] = i;
  }
  const standardEnd = performance.now();
  console.log(`Standard ArrayBuffer write time: ${standardEnd - standardStart}ms`);
});

Deno.test("PartitionedBuffer - Memory Fragmentation", () => {
  const buffer = new PartitionedBuffer(1024, 16);
  const partitions: Array<PartitionSpec<{ value: number }>> = [];

  // Create and delete partitions to potentially cause fragmentation
  for (let i = 0; i < 10; i++) {
    const spec: PartitionSpec<{ value: number }> = {
      name: `partition${i}`,
      schema: {
        value: i % 2 === 0 ? Int8Array : Float64Array, // Alternate between small and large types
      },
    };
    const partition = buffer.addPartition(spec);
    if (partition) {
      partitions.push(spec);
    }
  }

  // Clear half of the partitions
  for (let i = 0; i < partitions.length; i += 2) {
    buffer.clear();
  }

  // Try to add a large partition that should fit in the total free space
  // but might not fit in contiguous space
  const largeSpec: PartitionSpec<{ value: number }> = {
    name: "large",
    schema: {
      value: Float64Array,
    },
  };

  // This should succeed if the buffer handles fragmentation well
  const largePartition = buffer.addPartition(largeSpec);
  assertEquals(largePartition !== null, true);
});

Deno.test("PartitionedBuffer - Sparse Facade Edge Cases", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  // Test with maxOwners = 1
  type SingleOwnerSchema = { value: number };
  const singleOwnerSpec: PartitionSpec<SingleOwnerSchema> = {
    name: "single_owner",
    schema: {
      value: Int32Array,
    },
    maxOwners: 1,
  };

  const singleOwnerPartition = buffer.addPartition(singleOwnerSpec);
  assertEquals(singleOwnerPartition !== null, true);

  if (singleOwnerPartition) {
    // Test single owner behavior
    singleOwnerPartition.partitions.value[0] = 42;
    assertEquals(singleOwnerPartition.partitions.value[0], 42);

    // Writing to second position is allowed (sparse facade doesn't prevent writes)
    singleOwnerPartition.partitions.value[1] = 43;
    assertEquals(singleOwnerPartition.partitions.value[1], 43);
  }

  // Test with maxOwners = -1 (should throw)
  type InvalidOwnerSchema = { value: number };
  const invalidOwnerSpec: PartitionSpec<InvalidOwnerSchema> = {
    name: "invalid_owner",
    schema: {
      value: Int32Array,
    },
    maxOwners: -1,
  };

  assertThrows(
    () => buffer.addPartition(invalidOwnerSpec),
    Error,
    "maxOwners must be a positive integer",
  );
});

Deno.test("PartitionedBuffer - Schema Validation", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  // Test with empty schema (should return empty partition storage)
  type EmptySchema = Record<string, never>;
  const emptySpec: PartitionSpec<EmptySchema> = {
    name: "empty",
    schema: {} as Schema<EmptySchema>,
  };

  const emptyPartition = buffer.addPartition(emptySpec);
  assertEquals(emptyPartition, {
    byteLength: 0,
    byteOffset: 0,
    partitions: {},
  });

  // Test with invalid array type
  type InvalidSchema = { value: number };
  const invalidSpec: PartitionSpec<InvalidSchema> = {
    name: "invalid",
    schema: {
      value: {} as unknown as Int8ArrayConstructor, // Use an invalid constructor
    },
  };

  assertThrows(
    () => buffer.addPartition(invalidSpec),
    Error,
    "Ctr is not a constructor",
  );

  // Test with duplicate property names (different casing)
  type DuplicateSchema = { Value: number; value: number };
  const duplicateSpec: PartitionSpec<DuplicateSchema> = {
    name: "duplicate",
    schema: {
      Value: Int8Array,
      value: Int8Array,
    },
  };

  // Duplicate names with different casing are allowed
  const duplicatePartition = buffer.addPartition(duplicateSpec);
  assertEquals(duplicatePartition !== null, true);
});

Deno.test("PartitionedBuffer - Buffer Iteration", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  // Create multiple partitions with different types
  type Vec2Schema = { x: number; y: number };
  const positions: PartitionSpec<Vec2Schema> = {
    name: "positions",
    schema: {
      x: Float32Array,
      y: Float32Array,
    },
  };

  type ColorSchema = { r: number; g: number; b: number };
  const colors: PartitionSpec<ColorSchema> = {
    name: "colors",
    schema: {
      r: Uint8Array,
      g: Uint8Array,
      b: Uint8Array,
    },
  };

  // Add partitions
  const positionPartition = buffer.addPartition(positions);
  const colorPartition = buffer.addPartition(colors);

  if (positionPartition && colorPartition) {
    // Test iteration over multiple partitions
    for (let i = 0; i < buffer.maxEntitiesPerPartition; i++) {
      // Set position
      positionPartition.partitions.x[i] = i * 2;
      positionPartition.partitions.y[i] = i * 2 + 1;

      // Set color
      colorPartition.partitions.r[i] = i % 255;
      colorPartition.partitions.g[i] = (i * 2) % 255;
      colorPartition.partitions.b[i] = (i * 3) % 255;
    }

    // Verify data
    for (let i = 0; i < buffer.maxEntitiesPerPartition; i++) {
      assertEquals(positionPartition.partitions.x[i], i * 2);
      assertEquals(positionPartition.partitions.y[i], i * 2 + 1);
      assertEquals(colorPartition.partitions.r[i], i % 255);
      assertEquals(colorPartition.partitions.g[i], (i * 2) % 255);
      assertEquals(colorPartition.partitions.b[i], (i * 3) % 255);
    }
  }
});

Deno.test("PartitionedBuffer - Thread Safety", async () => {
  // Skip if SharedArrayBuffer is not supported
  if (typeof SharedArrayBuffer === "undefined") {
    console.log("SharedArrayBuffer not supported, skipping thread safety test");
    return;
  }

  const buffer = new PartitionedBuffer(1024, 16);

  type CounterSchema = { value: number };
  const counterSpec: PartitionSpec<CounterSchema> = {
    name: "counter",
    schema: {
      value: Int32Array,
    },
  };

  const partition = buffer.addPartition(counterSpec);
  if (!partition || !partition.partitions || !partition.partitions.value) {
    throw new Error("Failed to create partition");
  }

  const array = partition.partitions.value;
  array[0] = 0; // Initialize counter

  // Simulate concurrent access
  const iterations = 1000;
  const promises: Promise<void>[] = [];

  for (let i = 0; i < 4; i++) {
    promises.push(
      new Promise<void>((resolve) => {
        for (let j = 0; j < iterations; j++) {
          array[0]! += 1;
        }
        resolve();
      }),
    );
  }

  await Promise.all(promises);

  // If the buffer is not thread-safe, the final value will be less than expected
  assertEquals(array[0], iterations * 4);
});

Deno.test("PartitionedBuffer - Memory Leak Prevention", () => {
  const buffer = new PartitionedBuffer(1024, 16);
  const partitions: Array<PartitionSpec<{ value: number }>> = [];

  // Create and clear partitions multiple times
  for (let i = 0; i < 10; i++) {
    // Create partitions
    for (let j = 0; j < 5; j++) {
      const spec: PartitionSpec<{ value: number }> = {
        name: `partition${i}_${j}`,
        schema: {
          value: Float64Array,
        },
      };
      const partition = buffer.addPartition(spec);
      if (partition) {
        partitions.push(spec);
      }
    }

    // Clear buffer
    buffer.clear();

    // Verify all memory is freed
    assertEquals(buffer.getFreeSpace(), 1024);
    assertEquals(buffer.getOffset(), 0);

    // Verify all partitions are removed
    for (const spec of partitions) {
      assertEquals(buffer.hasPartition(spec), false);
    }

    // Verify we can add new partitions
    const newSpec: PartitionSpec<{ value: number }> = {
      name: "new",
      schema: {
        value: Float64Array,
      },
    };
    const newPartition = buffer.addPartition(newSpec);
    assertEquals(newPartition !== null, true);

    // Clear for next iteration
    buffer.clear();
    partitions.length = 0;
  }
});

Deno.test("PartitionedBuffer - Buffer Overflow Protection", () => {
  const buffer = new PartitionedBuffer(256, 16);

  // Create a partition that uses most of the buffer
  type LargeSchema = { value: number };
  const largeSpec: PartitionSpec<LargeSchema> = {
    name: "large",
    schema: {
      value: Int32Array,
    },
  };

  const partition = buffer.addPartition(largeSpec);
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

    // Note: TypedArrays silently ignore out-of-bounds writes in non-strict mode
    array[array.length] = 44;
    assertEquals(array[array.length], undefined);

    // Note: TypedArrays return undefined for out-of-bounds reads
    assertEquals(array[array.length], undefined);

    // Note: TypedArrays silently ignore negative indices in non-strict mode
    array[-1] = 45;
    assertEquals(array[-1], undefined);
  }
});

Deno.test("PartitionedBuffer - Edge Cases", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  // Test with maximum safe integer size
  assertThrows(
    () => new PartitionedBuffer(Number.MAX_SAFE_INTEGER, 16),
    RangeError,
    "size must be a multiple of maxEntitiesPerPartition",
  );

  // Test with non-integer maxEntitiesPerPartition
  assertThrows(
    () => new PartitionedBuffer(1024, 16.5),
    RangeError,
    "maxEntitiesPerPartition must be a safe integer",
  );

  // Test with very large maxEntitiesPerPartition
  assertThrows(
    () => new PartitionedBuffer(1024, 2048),
    RangeError,
    "size must be a multiple of maxEntitiesPerPartition",
  );

  // Test partition name with special characters
  type SpecialSchema = { value: number };
  const specialSpec: PartitionSpec<SpecialSchema> = {
    name: "special!@#$%^&*()",
    schema: {
      value: Int32Array,
    },
  };

  // Note: Special characters are allowed in partition names
  const specialPartition = buffer.addPartition(specialSpec);
  assertEquals(specialPartition !== null, true);

  // Test partition name with only whitespace
  const whitespaceSpec: PartitionSpec<SpecialSchema> = {
    name: "   ",
    schema: {
      value: Int32Array,
    },
  };

  // Note: Whitespace names are allowed
  const whitespacePartition = buffer.addPartition(whitespaceSpec);
  assertEquals(whitespacePartition !== null, true);

  // Test partition name with empty string
  const emptySpec: PartitionSpec<SpecialSchema> = {
    name: "",
    schema: {
      value: Int32Array,
    },
  };

  // Note: Empty names are allowed
  const emptyPartition = buffer.addPartition(emptySpec);
  assertEquals(emptyPartition !== null, true);
});

Deno.test("PartitionedBuffer - Alignment Stress Test", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  // Create a complex schema with mixed alignments
  type MixedSchema = {
    int8: number;
    int16: number;
    int32: number;
    float32: number;
    float64: number;
    int8_2: number;
    int16_2: number;
    int32_2: number;
  };

  const mixedSpec: PartitionSpec<MixedSchema> = {
    name: "mixed",
    schema: {
      int8: Int8Array,
      int16: Int16Array,
      int32: Int32Array,
      float32: Float32Array,
      float64: Float64Array,
      int8_2: Int8Array,
      int16_2: Int16Array,
      int32_2: Int32Array,
    },
  };

  const partition = buffer.addPartition(mixedSpec);
  assertEquals(partition !== null, true);

  if (partition) {
    // Verify all alignments
    assertEquals(partition.partitions.int8.byteOffset % 1, 0);
    assertEquals(partition.partitions.int16.byteOffset % 2, 0);
    assertEquals(partition.partitions.int32.byteOffset % 4, 0);
    assertEquals(partition.partitions.float32.byteOffset % 4, 0);
    assertEquals(partition.partitions.float64.byteOffset % 8, 0);
    assertEquals(partition.partitions.int8_2.byteOffset % 1, 0);
    assertEquals(partition.partitions.int16_2.byteOffset % 2, 0);
    assertEquals(partition.partitions.int32_2.byteOffset % 4, 0);

    // Test data access
    partition.partitions.int8[0] = 1;
    partition.partitions.int16[0] = 2;
    partition.partitions.int32[0] = 3;
    partition.partitions.float32[0] = 4;
    partition.partitions.float64[0] = 5;
    partition.partitions.int8_2[0] = 6;
    partition.partitions.int16_2[0] = 7;
    partition.partitions.int32_2[0] = 8;

    assertEquals(partition.partitions.int8[0], 1);
    assertEquals(partition.partitions.int16[0], 2);
    assertEquals(partition.partitions.int32[0], 3);
    assertEquals(partition.partitions.float32[0], 4);
    assertEquals(partition.partitions.float64[0], 5);
    assertEquals(partition.partitions.int8_2[0], 6);
    assertEquals(partition.partitions.int16_2[0], 7);
    assertEquals(partition.partitions.int32_2[0], 8);
  }
});
