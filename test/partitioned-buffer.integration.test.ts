// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert@^1.0.9";
import { Partition, type PartitionSpec } from "../src/Partition.ts";
import { PartitionedBuffer } from "../src/PartitionedBuffer.ts";

Deno.test("PartitionedBuffer - Multiple partitions interaction", () => {
  const buffer = new PartitionedBuffer(1024, 16);

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
  const vec2Instance = buffer.addPartition(new Partition(vec2Spec));
  const dataInstance = buffer.addPartition(new Partition(dataSpec));
  const flagInstance = buffer.addPartition(new Partition(flagSpec));

  // Verify all partitions exist
  assertEquals(buffer.hasPartition<Vec2Schema>(vec2Spec), true);
  assertEquals(buffer.hasPartition<DataSchema>(dataSpec), true);
  assertEquals(buffer.hasPartition<FlagSchema>(flagSpec), true);

  // Test data independence
  if (vec2Instance && dataInstance && flagInstance) {
    vec2Instance.partitions.x[0] = 1;
    vec2Instance.partitions.y[0] = 2;
    dataInstance.partitions.value[0] = 3;
    flagInstance.partitions.active[0] = 1;

    assertEquals(vec2Instance.partitions.x[0], 1);
    assertEquals(vec2Instance.partitions.y[0], 2);
    assertEquals(dataInstance.partitions.value[0], 3);
    assertEquals(flagInstance.partitions.active[0], 1);

    // Clear one partition's data
    vec2Instance.partitions.x.fill(0);
    vec2Instance.partitions.y.fill(0);

    // Verify other partitions are unaffected
    assertEquals(vec2Instance.partitions.x[0], 0);
    assertEquals(vec2Instance.partitions.y[0], 0);
    assertEquals(dataInstance.partitions.value[0], 3);
    assertEquals(flagInstance.partitions.active[0], 1);
  }
});

Deno.test("PartitionedBuffer - Complex schema combinations", () => {
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

  const complexPartition = new Partition(complexSpec);
  const complexInstance = buffer.addPartition(complexPartition);
  assertEquals(complexInstance !== null, true);
  assertEquals(complexInstance?.partitions.position instanceof Float32Array, true);
  assertEquals(complexInstance?.partitions.velocity instanceof Float32Array, true);
  assertEquals(complexInstance?.partitions.mass instanceof Float64Array, true);
  assertEquals(complexInstance?.partitions.active instanceof Int8Array, true);

  // Verify alignments (MIN_ALIGNMENT is 8)
  assertEquals(complexInstance?.partitions.position.byteOffset % 8, 0);
  assertEquals(complexInstance?.partitions.velocity.byteOffset % 8, 0);
  assertEquals(complexInstance?.partitions.mass.byteOffset % 8, 0);
  assertEquals(complexInstance?.partitions.active.byteOffset % 8, 0);
});

Deno.test("PartitionedBuffer - Memory fragmentation scenario", () => {
  const buffer = new PartitionedBuffer(2048, 16);
  const partitions: Array<PartitionSpec<{ value: number }>> = [];

  // Create a few partitions
  for (let i = 0; i < 3; i++) {
    const spec: PartitionSpec<{ value: number }> = {
      name: `partition${i}`,
      schema: {
        value: i % 2 === 0 ? Int8Array : Float64Array,
      },
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (partition) {
      partitions.push(spec);
    }
  }

  // Clear and verify all space is freed
  buffer.clear();
  assertEquals(buffer.getFreeSpace(), 2048);

  // Try to add a new partition after clearing
  const newSpec: PartitionSpec<{ value: number }> = {
    name: "new",
    schema: { value: Float64Array },
  };
  const newPartition = buffer.addPartition(new Partition(newSpec));
  assertEquals(newPartition !== null, true);
});

Deno.test("PartitionedBuffer - Data integrity with mixed types", () => {
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

  const dataPartition = new Partition(dataSpec);
  const dataInstance = buffer.addPartition(dataPartition);

  if (dataInstance) {
    // Test each type's values
    dataInstance.partitions.int8[0] = 127;
    dataInstance.partitions.int16[0] = 32767;
    dataInstance.partitions.int32[0] = 2147483647;
    dataInstance.partitions.float32[0] = 3.4028234e38;
    dataInstance.partitions.float64[0] = 1.7976931348623157e308;

    assertEquals(dataInstance.partitions.int8[0], 127);
    assertEquals(dataInstance.partitions.int16[0], 32767);
    assertEquals(dataInstance.partitions.int32[0], 2147483647);
    const float32Value = dataInstance.partitions.float32[0];
    assertEquals(Math.abs(float32Value - 3.4028234e38) < 1e32, true);
    assertEquals(dataInstance.partitions.float64[0], 1.7976931348623157e308);

    // Test negative values
    dataInstance.partitions.int8[0] = -128;
    dataInstance.partitions.int16[0] = -32768;
    dataInstance.partitions.int32[0] = -2147483648;
    dataInstance.partitions.float32[0] = -3.4028234e38;
    dataInstance.partitions.float64[0] = -1.7976931348623157e308;

    assertEquals(dataInstance.partitions.int8[0], -128);
    assertEquals(dataInstance.partitions.int16[0], -32768);
    assertEquals(dataInstance.partitions.int32[0], -2147483648);
    const negFloat32Value = dataInstance.partitions.float32[0];
    assertEquals(Math.abs(negFloat32Value - (-3.4028234e38)) < 1e32, true);
    assertEquals(dataInstance.partitions.float64[0], -1.7976931348623157e308);
  }
});

Deno.test("PartitionedBuffer - Buffer iteration pattern", () => {
  const buffer = new PartitionedBuffer(1024, 16);

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

  const positionPartition = buffer.addPartition(new Partition(positions));
  const colorPartition = buffer.addPartition(new Partition(colors));

  if (positionPartition && colorPartition) {
    // Test iteration over multiple partitions
    for (let i = 0; i < buffer.maxEntitiesPerPartition; i++) {
      positionPartition.partitions.x[i] = i * 2;
      positionPartition.partitions.y[i] = i * 2 + 1;
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

Deno.test("PartitionedBuffer - Stress test with many partitions", () => {
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
      const partition = buffer.addPartition(new Partition(spec));
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
      const partition = buffer.getPartition<{ value: number }>(spec.name);
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
  const newPartition = buffer.addPartition(new Partition(newSpec));
  assertEquals(newPartition !== null, true);
});

Deno.test("PartitionedBuffer - Memory leak prevention", () => {
  const buffer = new PartitionedBuffer(4096, 16);
  const partitions: Array<PartitionSpec<{ value: number }>> = [];

  // Create and clear partitions multiple times
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      const spec: PartitionSpec<{ value: number }> = {
        name: `partition${i}_${j}`,
        schema: {
          value: Float64Array,
        },
      };
      const partition = buffer.addPartition(new Partition(spec));
      if (partition) {
        partitions.push(spec);
      }
    }

    buffer.clear();

    assertEquals(buffer.getFreeSpace(), 4096);
    assertEquals(buffer.getOffset(), 0);

    for (const spec of partitions) {
      assertEquals(buffer.hasPartition(spec), false);
    }

    const newSpec: PartitionSpec<{ value: number }> = {
      name: "new",
      schema: {
        value: Float64Array,
      },
    };
    const newPartition = buffer.addPartition(new Partition(newSpec));
    assertEquals(newPartition !== null, true);

    buffer.clear();
    partitions.length = 0;
  }
});

Deno.test("PartitionedBuffer - Sparse facade integration", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  type SparseSchema = { value: number };
  const sparseSpec: PartitionSpec<SparseSchema> = {
    name: "sparse",
    schema: {
      value: Int32Array,
    },
    maxOwners: 2,
  };

  const partition = buffer.addPartition(new Partition(sparseSpec));
  assertEquals(partition !== null, true);

  if (partition) {
    // Verify dense array is sized to maxOwners (2), not maxEntitiesPerPartition (16)
    assertEquals(partition.partitions.value.length, 2);

    // Test writing within maxOwners limit using sparse entity IDs
    partition.partitions.value[10] = 42; // entity 10 maps to slot 0
    partition.partitions.value[20] = 43; // entity 20 maps to slot 1
    assertEquals(partition.partitions.value[10], 42);
    assertEquals(partition.partitions.value[20], 43);

    // Writing third entity should fail (only 2 slots available)
    // In strict mode (which Deno uses), proxy throws TypeError when set returns false
    try {
      partition.partitions.value[30] = 44;
      assertEquals(false, true, "Should have thrown");
    } catch (error) {
      assertEquals(error instanceof TypeError, true);
    }
    assertEquals(partition.partitions.value[30], undefined); // Not stored
  }
});

Deno.test("PartitionedBuffer - maxOwners memory savings", () => {
  // Test sparse partition in isolation first
  const sparseBuffer = new PartitionedBuffer(1024, 64);

  type TestSchema = { value: number };
  const sparseSpec: PartitionSpec<TestSchema> = {
    name: "sparse",
    schema: { value: Int32Array },
    maxOwners: 8,
  };
  const sparsePartition = sparseBuffer.addPartition(new Partition(sparseSpec));

  if (sparsePartition) {
    // Sparse partition should only have maxOwners capacity
    assertEquals(sparsePartition.partitions.value.length, 8);

    // Sparse: 8 * 4 = 32 bytes (one Int32Array property with maxOwners=8)
    assertEquals(sparsePartition.byteLength, 32);
  }

  // Now test dense partition
  const denseBuffer = new PartitionedBuffer(1024, 64);
  const denseSpec: PartitionSpec<TestSchema> = {
    name: "dense",
    schema: { value: Int32Array },
  };
  const densePartition = denseBuffer.addPartition(new Partition(denseSpec));

  if (densePartition) {
    // Dense partition should have full capacity
    assertEquals(densePartition.partitions.value.length, 64);

    // Dense: 64 * 4 = 256 bytes (one Int32Array property)
    assertEquals(densePartition.byteLength, 256);
  }

  // Verify significant memory savings: 87.5% reduction (256 - 32 = 224 bytes saved)
  if (densePartition && sparsePartition) {
    const savedBytes = densePartition.byteLength - sparsePartition.byteLength;
    assertEquals(savedBytes, 224);
  }
});

Deno.test("PartitionedBuffer - maxOwners enforces capacity limit", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  type TestSchema = { value: number };
  const spec: PartitionSpec<TestSchema> = {
    name: "limited",
    schema: { value: Int32Array },
    maxOwners: 3,
  };

  const partition = buffer.addPartition(new Partition(spec));
  if (!partition) throw new Error("Partition creation failed");

  // Fill all 3 slots with sparse entity IDs
  partition.partitions.value[100] = 1;
  partition.partitions.value[200] = 2;
  partition.partitions.value[300] = 3;

  assertEquals(partition.partitions.value[100], 1);
  assertEquals(partition.partitions.value[200], 2);
  assertEquals(partition.partitions.value[300], 3);

  // Fourth entity should fail (throws in strict mode)
  try {
    partition.partitions.value[400] = 4;
    assertEquals(false, true, "Should have thrown");
  } catch (error) {
    assertEquals(error instanceof TypeError, true);
  }
  assertEquals(partition.partitions.value[400], undefined);

  // Can delete and reuse slot
  delete partition.partitions.value[200];
  assertEquals(partition.partitions.value[200], undefined);

  // Now we can add a new entity in the freed slot
  partition.partitions.value[500] = 5;
  assertEquals(partition.partitions.value[500], 5);
});

Deno.test("PartitionedBuffer - maxOwners with multiple properties", () => {
  const buffer = new PartitionedBuffer(1024, 32);

  type Vec3Schema = { x: number; y: number; z: number };
  const spec: PartitionSpec<Vec3Schema> = {
    name: "position",
    schema: {
      x: Float32Array,
      y: Float32Array,
      z: Float32Array,
    },
    maxOwners: 4,
  };

  const partition = buffer.addPartition(new Partition(spec));
  if (!partition) throw new Error("Partition creation failed");

  // Each property should be limited to 4 elements
  assertEquals(partition.partitions.x.length, 4);
  assertEquals(partition.partitions.y.length, 4);
  assertEquals(partition.partitions.z.length, 4);

  // All properties share the same sparse mapping
  partition.partitions.x[10] = 1.0;
  partition.partitions.y[10] = 2.0;
  partition.partitions.z[10] = 3.0;

  assertEquals(partition.partitions.x[10], 1.0);
  assertEquals(partition.partitions.y[10], 2.0);
  assertEquals(partition.partitions.z[10], 3.0);

  // Fill remaining slots
  partition.partitions.x[20] = 4.0;
  partition.partitions.x[30] = 5.0;
  partition.partitions.x[40] = 6.0;

  // Fifth entity should fail (throws in strict mode)
  try {
    partition.partitions.x[50] = 7.0;
    assertEquals(false, true, "Should have thrown");
  } catch (error) {
    assertEquals(error instanceof TypeError, true);
  }
  assertEquals(partition.partitions.x[50], undefined);
});

Deno.test("PartitionedBuffer - Complex alignment scenarios", () => {
  const buffer = new PartitionedBuffer(1024, 16);

  type ComplexAlignmentSchema = {
    byte1: number;
    double1: number;
    byte2: number;
    word: number;
    byte3: number;
    dword: number;
    byte4: number;
  };

  const complexSpec: PartitionSpec<ComplexAlignmentSchema> = {
    name: "complex_alignment",
    schema: {
      byte1: Int8Array,
      double1: Float64Array,
      byte2: Int8Array,
      word: Int16Array,
      byte3: Int8Array,
      dword: Int32Array,
      byte4: Int8Array,
    },
  };

  const partition = buffer.addPartition(new Partition(complexSpec));
  assertEquals(partition !== null, true);

  if (partition) {
    // Verify all arrays are properly aligned (MIN_ALIGNMENT is 8)
    assertEquals(partition.partitions.byte1.byteOffset % 8, 0);
    assertEquals(partition.partitions.double1.byteOffset % 8, 0);
    assertEquals(partition.partitions.byte2.byteOffset % 8, 0);
    assertEquals(partition.partitions.word.byteOffset % 8, 0);
    assertEquals(partition.partitions.byte3.byteOffset % 8, 0);
    assertEquals(partition.partitions.dword.byteOffset % 8, 0);
    assertEquals(partition.partitions.byte4.byteOffset % 8, 0);

    // Test data integrity across all types
    partition.partitions.byte1[0] = 1;
    partition.partitions.double1[0] = Math.PI;
    partition.partitions.byte2[0] = 2;
    partition.partitions.word[0] = 1000;
    partition.partitions.byte3[0] = 3;
    partition.partitions.dword[0] = 100000;
    partition.partitions.byte4[0] = 4;

    assertEquals(partition.partitions.byte1[0], 1);
    assertEquals(partition.partitions.double1[0], Math.PI);
    assertEquals(partition.partitions.byte2[0], 2);
    assertEquals(partition.partitions.word[0], 1000);
    assertEquals(partition.partitions.byte3[0], 3);
    assertEquals(partition.partitions.dword[0], 100000);
    assertEquals(partition.partitions.byte4[0], 4);
  }
});

Deno.test("PartitionedBuffer - Zero-allocation mode with maxEntityId", () => {
  const buffer = new PartitionedBuffer(2048, 64);

  type Vec2 = { x: number; y: number };
  const zeroAllocSpec: PartitionSpec<Vec2> = {
    name: "zeroAllocPosition",
    schema: {
      x: Float32Array,
      y: Float32Array,
    },
    maxOwners: 10, // Only 10 entities can have this component at once
    maxEntityId: 1000, // Entity IDs are bounded by world size (zero-allocation mode)
  };

  const partition = buffer.addPartition(new Partition(zeroAllocSpec));
  assertEquals(partition !== null, true);

  if (partition) {
    // Verify dense arrays are sized to maxOwners (10)
    assertEquals(partition.partitions.x.length, 10);
    assertEquals(partition.partitions.y.length, 10);

    // Test writing with entity IDs within maxEntityId bounds
    partition.partitions.x[100] = 1.5;
    partition.partitions.y[100] = 2.5;
    partition.partitions.x[500] = 3.5;
    partition.partitions.y[500] = 4.5;

    assertEquals(partition.partitions.x[100], 1.5);
    assertEquals(partition.partitions.y[100], 2.5);
    assertEquals(partition.partitions.x[500], 3.5);
    assertEquals(partition.partitions.y[500], 4.5);

    // Test entity ID at maxEntityId boundary
    partition.partitions.x[1000] = 5.5;
    assertEquals(partition.partitions.x[1000], 5.5);

    // Test entity ID beyond maxEntityId fails
    try {
      partition.partitions.x[1001] = 6.5;
      assertEquals(false, true, "Should have thrown");
    } catch (error) {
      assertEquals(error instanceof TypeError, true);
    }
    assertEquals(partition.partitions.x[1001], undefined);

    // Test deletion
    const deleted = delete partition.partitions.x[100];
    assertEquals(deleted, true);
    assertEquals(partition.partitions.x[100], undefined);

    // Verify slot can be reused
    partition.partitions.x[750] = 7.5;
    assertEquals(partition.partitions.x[750], 7.5);
  }
});
