/// <reference lib="deno.ns" />
/// <reference lib="dom" />

import { Partition, type PartitionSpec } from "../src/Partition.ts";
import { PartitionedBuffer } from "../src/PartitionedBuffer.ts";

// Buffer Creation Benchmarks
Deno.bench({
  name: "PartitionedBuffer - Create small buffer (1KB)",
  fn: () => {
    new PartitionedBuffer(1024, 16);
  },
});

Deno.bench({
  name: "PartitionedBuffer - Create medium buffer (1MB)",
  fn: () => {
    new PartitionedBuffer(1024 * 1024, 16);
  },
});

Deno.bench({
  name: "PartitionedBuffer - Create large buffer (10MB)",
  fn: () => {
    new PartitionedBuffer(10 * 1024 * 1024, 16);
  },
});

// Partition Creation Benchmarks
Deno.bench({
  name: "PartitionedBuffer - Create Int8Array partition",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "int8",
      schema: {
        value: Int8Array,
      },
    };
    buffer.addPartition(new Partition(spec));
  },
});

Deno.bench({
  name: "PartitionedBuffer - Create Float64Array partition",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "float64",
      schema: {
        value: Float64Array,
      },
    };
    buffer.addPartition(new Partition(spec));
  },
});

Deno.bench({
  name: "PartitionedBuffer - Create complex partition",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type ComplexSchema = {
      int8: number;
      int16: number;
      int32: number;
      float32: number;
      float64: number;
    };
    const spec: PartitionSpec<ComplexSchema> = {
      name: "complex",
      schema: {
        int8: Int8Array,
        int16: Int16Array,
        int32: Int32Array,
        float32: Float32Array,
        float64: Float64Array,
      },
    };
    buffer.addPartition(new Partition(spec));
  },
});

// Data Access Benchmarks
Deno.bench({
  name: "PartitionedBuffer - Sequential write Int32Array",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "int32",
      schema: {
        value: Int32Array,
      },
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (!partition) return;

    for (let i = 0; i < 16; i++) {
      partition.partitions.value[i] = i;
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Sequential read Int32Array",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "int32",
      schema: {
        value: Int32Array,
      },
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (!partition) return;

    let sum = 0;
    for (let i = 0; i < 16; i++) {
      sum += partition.partitions.value[i]!;
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Random access Int32Array",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "int32",
      schema: {
        value: Int32Array,
      },
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (!partition) return;

    for (let i = 0; i < 16; i++) {
      const index = Math.floor(Math.random() * 16);
      partition.partitions.value[index] = i;
    }
  },
});

// Memory Operations Benchmarks
Deno.bench({
  name: "PartitionedBuffer - Clear buffer",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "int32",
      schema: {
        value: Int32Array,
      },
    };
    buffer.addPartition(new Partition(spec));
    buffer.clear();
  },
});

// Partition Lookup Benchmarks
Deno.bench({
  name: "PartitionedBuffer - Lookup by name",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "test",
      schema: {
        value: Int32Array,
      },
    };
    const partition = new Partition(spec);
    buffer.addPartition(partition);
    buffer.getPartition("test");
  },
});

Deno.bench({
  name: "PartitionedBuffer - Lookup by spec",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "test",
      schema: {
        value: Int32Array,
      },
    };
    const partition = new Partition(spec);
    buffer.addPartition(partition);
    buffer.getPartition(partition);
  },
});

// Alignment Tests
Deno.bench({
  name: "PartitionedBuffer - Mixed alignment access",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type MixedSchema = {
      int8: number;
      int16: number;
      int32: number;
      float64: number;
    };
    const spec: PartitionSpec<MixedSchema> = {
      name: "mixed",
      schema: {
        int8: Int8Array,
        int16: Int16Array,
        int32: Int32Array,
        float64: Float64Array,
      },
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (!partition) return;

    for (let i = 0; i < 16; i++) {
      partition.partitions.int8[i] = i;
      partition.partitions.int16[i] = i;
      partition.partitions.int32[i] = i;
      partition.partitions.float64[i] = i;
    }
  },
});

// Sparse Facade Tests
Deno.bench({
  name: "PartitionedBuffer - Sparse partition access",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "sparse",
      schema: {
        value: Int32Array,
      },
      maxOwners: 4,
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (!partition) return;

    for (let i = 0; i < 4; i++) {
      partition.partitions.value[i] = i;
    }
  },
});

// Edge Case Benchmarks
Deno.bench({
  name: "PartitionedBuffer - Maximum partition count",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    let partitionCount = 0;

    while (buffer.getFreeSpace() >= 16) {
      const spec: PartitionSpec<Schema> = {
        name: `partition${partitionCount}`,
        schema: {
          value: Int8Array,
        },
      };
      try {
        buffer.addPartition(new Partition(spec));
        partitionCount++;
      } catch {
        break;
      }
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Minimum size operations",
  fn: () => {
    const buffer = new PartitionedBuffer(64, 8); // Minimum allowed size
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "min",
      schema: {
        value: Int8Array,
      },
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (partition) {
      partition.partitions.value[0] = 1;
      partition.partitions.value[7] = 1; // Last element
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Rapid partition creation/clear cycles",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "cycle",
      schema: {
        value: Int32Array,
      },
    };
    const partition = new Partition(spec);

    for (let i = 0; i < 10; i++) {
      buffer.addPartition(partition);
      buffer.clear();
    }
  },
});

// Performance Degradation Test
Deno.bench({
  name: "PartitionedBuffer - Sequential partition operations",
  fn: () => {
    const buffer = new PartitionedBuffer(1024 * 2, 16); // Doubled buffer size
    type Schema = { value: number };

    for (let i = 0; i < 10; i++) {
      const spec: PartitionSpec<Schema> = {
        name: `seq${i}`,
        schema: {
          value: Int32Array,
        },
      };
      const partition = buffer.addPartition(new Partition(spec));
      if (partition) {
        partition.partitions.value[0] = i;
      }
    }
  },
});

// Memory Pattern Benchmarks
Deno.bench({
  name: "PartitionedBuffer - Interleaved read/write",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "interleaved",
      schema: {
        value: Int32Array,
      },
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (!partition) return;

    for (let i = 0; i < 16; i++) {
      partition.partitions.value[i] = i;
      const val = partition.partitions.value[i];
      partition.partitions.value[i] = val! * 2;
    }
  },
});

// Multi-Partition Access Pattern
Deno.bench({
  name: "PartitionedBuffer - Multi-partition interleaved access",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };

    // Create multiple partitions
    const partitions = Array.from({ length: 4 }, (_, i) => {
      const spec: PartitionSpec<Schema> = {
        name: `part${i}`,
        schema: { value: Int32Array },
      };
      return buffer.addPartition(new Partition(spec));
    }).filter((p): p is NonNullable<typeof p> => p !== null);

    // Interleaved access across partitions
    for (let i = 0; i < 16; i++) {
      for (const partition of partitions) {
        partition.partitions.value[i % 16] = i;
      }
    }
  },
});

// Cache-friendly vs Cache-unfriendly Access
Deno.bench({
  name: "PartitionedBuffer - Cache-friendly sequential access",
  fn: () => {
    const buffer = new PartitionedBuffer(1024 * 64, 1024); // Larger buffer
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "cache_friendly",
      schema: { value: Int32Array },
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (!partition) return;

    // Sequential access
    for (let i = 0; i < 1024; i++) {
      partition.partitions.value[i] = i;
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Cache-unfriendly strided access",
  fn: () => {
    const buffer = new PartitionedBuffer(1024 * 64, 1024); // Larger buffer
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "cache_unfriendly",
      schema: { value: Int32Array },
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (!partition) return;

    // Strided access
    const stride = 16;
    for (let i = 0; i < 1024; i += stride) {
      for (let j = 0; j < stride; j++) {
        partition.partitions.value[j * (1024 / stride) + (i / stride)] = i + j;
      }
    }
  },
});

// Bulk Operations
Deno.bench({
  name: "PartitionedBuffer - Bulk data copy",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "bulk",
      schema: { value: Int32Array },
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (!partition) return;

    const sourceData = new Int32Array(16);
    for (let i = 0; i < 16; i++) sourceData[i] = i;

    partition.partitions.value.set(sourceData);
  },
});

// Stress Test with Multiple Operations
Deno.bench({
  name: "PartitionedBuffer - Mixed operation stress test",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { a: number; b: number };
    const spec: PartitionSpec<Schema> = {
      name: "stress",
      schema: {
        a: Float32Array,
        b: Int32Array,
      },
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (!partition) return;

    // Mix of operations
    for (let i = 0; i < 16; i++) {
      partition.partitions.a[i] = Math.sin(i);
      partition.partitions.b[i] = i * 2;
      const temp = partition.partitions.a[i]!;
      partition.partitions.b[i] = Math.floor(temp);
      partition.partitions.a[i] = partition.partitions.b[i]!;
    }
  },
});

// =============================================================================
// MISSING BENCHMARKS - CORE METHODS
// =============================================================================

Deno.bench({
  name: "PartitionedBuffer - getFreeSpace() calls",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    for (let i = 0; i < 1000; i++) {
      buffer.getFreeSpace();
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - getOffset() calls",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    for (let i = 0; i < 1000; i++) {
      buffer.getOffset();
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - hasPartition() by name",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "test",
      schema: { value: Int32Array },
    };
    buffer.addPartition(new Partition(spec));

    for (let i = 0; i < 1000; i++) {
      buffer.hasPartition("test");
      buffer.hasPartition("nonexistent");
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - hasPartition() by partition instance",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "test",
      schema: { value: Int32Array },
    };
    const partition = new Partition(spec);
    buffer.addPartition(partition);

    for (let i = 0; i < 1000; i++) {
      buffer.hasPartition(partition);
    }
  },
});

// =============================================================================
// MISSING BENCHMARKS - TYPED ARRAY COVERAGE
// =============================================================================

Deno.bench({
  name: "PartitionedBuffer - Create Uint8Array partition",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "uint8",
      schema: { value: Uint8Array },
    };
    buffer.addPartition(new Partition(spec));
  },
});

Deno.bench({
  name: "PartitionedBuffer - Create Uint8ClampedArray partition",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "uint8clamped",
      schema: { value: Uint8ClampedArray },
    };
    buffer.addPartition(new Partition(spec));
  },
});

Deno.bench({
  name: "PartitionedBuffer - Create Int16Array partition",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "int16",
      schema: { value: Int16Array },
    };
    buffer.addPartition(new Partition(spec));
  },
});

Deno.bench({
  name: "PartitionedBuffer - Create Uint16Array partition",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "uint16",
      schema: { value: Uint16Array },
    };
    buffer.addPartition(new Partition(spec));
  },
});

Deno.bench({
  name: "PartitionedBuffer - Create Uint32Array partition",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "uint32",
      schema: { value: Uint32Array },
    };
    buffer.addPartition(new Partition(spec));
  },
});

// =============================================================================
// MISSING BENCHMARKS - TAG PARTITIONS
// =============================================================================

Deno.bench({
  name: "PartitionedBuffer - Create tag partition",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    const spec: PartitionSpec<null> = {
      name: "isAlive",
    };
    buffer.addPartition(new Partition(spec));
  },
});

Deno.bench({
  name: "PartitionedBuffer - Create tag partition with maxOwners",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    const spec: PartitionSpec<null> = {
      name: "isSpecial",
      maxOwners: 8,
    };
    buffer.addPartition(new Partition(spec));
  },
});

Deno.bench({
  name: "PartitionedBuffer - Tag partition operations",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    const spec: PartitionSpec<null> = {
      name: "isAlive",
    };
    buffer.addPartition(new Partition(spec));

    for (let i = 0; i < 100; i++) {
      buffer.hasPartition("isAlive");
      buffer.getPartition("isAlive");
    }
  },
});

// =============================================================================
// MISSING BENCHMARKS - SPARSE FACADE COMPREHENSIVE
// =============================================================================

Deno.bench({
  name: "PartitionedBuffer - Sparse array creation and basic ops",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "sparse",
      schema: { value: Int32Array },
      maxOwners: 8,
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (!partition) return;

    // Sparse operations
    for (let i = 0; i < 8; i++) {
      partition.partitions.value[i * 100] = i; // Sparse writes
    }

    for (let i = 0; i < 8; i++) {
      partition.partitions.value[i * 100]; // Sparse reads
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Sparse array disposal",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "sparse",
      schema: { value: Int32Array },
      maxOwners: 8,
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (!partition) return;

    // Set some values
    partition.partitions.value[10] = 1;
    partition.partitions.value[100] = 2;
    partition.partitions.value[1000] = 3;

    // Dispose via magic deletion
    delete partition.partitions.value[-1];
  },
});

Deno.bench({
  name: "PartitionedBuffer - Dense vs Sparse performance comparison",
  fn: () => {
    const buffer = new PartitionedBuffer(2048, 16);

    // Dense partition
    type DenseSchema = { value: number };
    const denseSpec: PartitionSpec<DenseSchema> = {
      name: "dense",
      schema: { value: Int32Array },
    };
    const densePartition = buffer.addPartition(new Partition(denseSpec));

    // Sparse partition
    type SparseSchema = { value: number };
    const sparseSpec: PartitionSpec<SparseSchema> = {
      name: "sparse",
      schema: { value: Int32Array },
      maxOwners: 8,
    };
    const sparsePartition = buffer.addPartition(new Partition(sparseSpec));

    if (!densePartition || !sparsePartition) return;

    // Dense operations
    for (let i = 0; i < 16; i++) {
      densePartition.partitions.value[i] = i;
    }

    // Sparse operations (same data pattern)
    for (let i = 0; i < 8; i++) {
      sparsePartition.partitions.value[i * 2] = i * 2;
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Sparse array different density patterns",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 64);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "sparse",
      schema: { value: Int32Array },
      maxOwners: 16,
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (!partition) return;

    // Low density (25% utilization)
    for (let i = 0; i < 4; i++) {
      partition.partitions.value[i * 16] = i;
    }

    // Medium density (50% utilization)
    for (let i = 4; i < 12; i++) {
      partition.partitions.value[i * 8] = i;
    }

    // High density (75% utilization)
    for (let i = 12; i < 16; i++) {
      partition.partitions.value[i * 4] = i;
    }
  },
});

// =============================================================================
// MISSING BENCHMARKS - SCHEMA/VALIDATION PERFORMANCE
// =============================================================================

Deno.bench({
  name: "PartitionedBuffer - Schema validation performance",
  fn: () => {
    for (let i = 0; i < 100; i++) {
      type Schema = { a: number; b: number; c: number };
      const spec: PartitionSpec<Schema> = {
        name: `test${i}`,
        schema: {
          a: Float32Array,
          b: Int32Array,
          c: Float64Array,
        },
      };
      // Validation happens in Partition constructor
      new Partition(spec);
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Initial value vs default zero performance",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);

    // Default zero
    type ZeroSchema = { value: number };
    const zeroSpec: PartitionSpec<ZeroSchema> = {
      name: "zero",
      schema: { value: Int32Array },
    };
    buffer.addPartition(new Partition(zeroSpec));

    buffer.clear();

    // Initial value
    type InitSchema = { value: number };
    const initSpec: PartitionSpec<InitSchema> = {
      name: "init",
      schema: { value: [Int32Array, 42] },
    };
    buffer.addPartition(new Partition(initSpec));
  },
});

Deno.bench({
  name: "PartitionedBuffer - Complex schema creation overhead",
  fn: () => {
    const buffer = new PartitionedBuffer(2048, 16);
    type ComplexSchema = {
      pos_x: number;
      pos_y: number;
      pos_z: number;
      vel_x: number;
      vel_y: number;
      vel_z: number;
      health: number;
      mana: number;
      level: number;
      experience: number;
    };
    const spec: PartitionSpec<ComplexSchema> = {
      name: "complex",
      schema: {
        pos_x: Float32Array,
        pos_y: Float32Array,
        pos_z: Float32Array,
        vel_x: Float32Array,
        vel_y: Float32Array,
        vel_z: Float32Array,
        health: [Int16Array, 100],
        mana: [Int16Array, 50],
        level: [Uint8Array, 1],
        experience: Uint32Array,
      },
    };
    buffer.addPartition(new Partition(spec));
  },
});

// =============================================================================
// MISSING BENCHMARKS - ERROR PATH PERFORMANCE
// =============================================================================

Deno.bench({
  name: "PartitionedBuffer - Buffer full error handling",
  fn: () => {
    const buffer = new PartitionedBuffer(128, 16); // Small buffer
    type Schema = { value: number };

    try {
      // Fill buffer until it fails
      for (let i = 0; i < 10; i++) {
        const spec: PartitionSpec<Schema> = {
          name: `partition${i}`,
          schema: { value: Float64Array }, // Large arrays
        };
        buffer.addPartition(new Partition(spec));
      }
    } catch {
      // Expected error path
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Duplicate name error handling",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "duplicate",
      schema: { value: Int32Array },
    };

    buffer.addPartition(new Partition(spec));

    // Try to add duplicate
    try {
      buffer.addPartition(new Partition(spec));
    } catch {
      // Expected error
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Invalid operation handling",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);

    for (let i = 0; i < 100; i++) {
      // These should handle gracefully
      buffer.getPartition("nonexistent");
      buffer.hasPartition("nonexistent");
    }
  },
});

// =============================================================================
// MISSING BENCHMARKS - ADVANCED SCENARIOS
// =============================================================================

Deno.bench({
  name: "PartitionedBuffer - Different entity counts (8 entities)",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 8);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "test",
      schema: { value: Int32Array },
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (!partition) return;

    for (let i = 0; i < 8; i++) {
      partition.partitions.value[i] = i;
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Different entity counts (256 entities)",
  fn: () => {
    const buffer = new PartitionedBuffer(1024 * 4, 256);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "test",
      schema: { value: Int32Array },
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (!partition) return;

    for (let i = 0; i < 256; i++) {
      partition.partitions.value[i] = i;
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Different entity counts (1024 entities)",
  fn: () => {
    const buffer = new PartitionedBuffer(1024 * 16, 1024);
    type Schema = { value: number };
    const spec: PartitionSpec<Schema> = {
      name: "test",
      schema: { value: Int32Array },
    };
    const partition = buffer.addPartition(new Partition(spec));
    if (!partition) return;

    for (let i = 0; i < 1024; i++) {
      partition.partitions.value[i] = i;
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Memory fragmentation patterns",
  fn: () => {
    const buffer = new PartitionedBuffer(2048, 16);

    // Create partitions with mixed sizes to cause fragmentation
    const specs = [
      { name: "small1", schema: { value: Int8Array } },
      { name: "large1", schema: { value: Float64Array } },
      { name: "small2", schema: { value: Int8Array } },
      { name: "medium1", schema: { value: Int32Array } },
      { name: "large2", schema: { value: Float64Array } },
      { name: "small3", schema: { value: Int8Array } },
    ];

    for (const spec of specs) {
      try {
        buffer.addPartition(new Partition(spec as PartitionSpec<{ value: number }>));
      } catch {
        break;
      }
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Cross-partition operations",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);

    type PosSchema = { x: number; y: number; z: number };
    const posSpec: PartitionSpec<PosSchema> = {
      name: "position",
      schema: {
        x: Float32Array,
        y: Float32Array,
        z: Float32Array,
      },
    };

    type VelSchema = { x: number; y: number; z: number };
    const velSpec: PartitionSpec<VelSchema> = {
      name: "velocity",
      schema: {
        x: Float32Array,
        y: Float32Array,
        z: Float32Array,
      },
    };

    const posPartition = buffer.addPartition(new Partition(posSpec));
    const velPartition = buffer.addPartition(new Partition(velSpec));

    if (!posPartition || !velPartition) return;

    // Simulate physics update across partitions
    for (let i = 0; i < 16; i++) {
      posPartition.partitions.x[i] += velPartition.partitions.x?.[i] ?? 0;
      posPartition.partitions.y[i] += velPartition.partitions.y?.[i] ?? 0;
      posPartition.partitions.z[i] += velPartition.partitions.z?.[i] ?? 0;
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Buffer utilization efficiency test",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16);
    let partitionCount = 0;

    // Fill buffer to capacity
    while (buffer.getFreeSpace() >= 64) { // Minimum space for Int32Array partition
      try {
        type Schema = { value: number };
        const spec: PartitionSpec<Schema> = {
          name: `partition${partitionCount}`,
          schema: { value: Int32Array },
        };
        buffer.addPartition(new Partition(spec));
        partitionCount++;
      } catch {
        break;
      }
    }
  },
});

// =============================================================================
// MISSING BENCHMARKS - REAL-WORLD USAGE PATTERNS
// =============================================================================

Deno.bench({
  name: "PartitionedBuffer - Entity creation/destruction simulation",
  fn: () => {
    const buffer = new PartitionedBuffer(2048, 32);

    // Simulate entity components
    type PosSchema = { x: number; y: number };
    const posSpec: PartitionSpec<PosSchema> = {
      name: "position",
      schema: { x: Float32Array, y: Float32Array },
      maxOwners: 16, // Sparse
    };

    type HealthSchema = { current: number; max: number };
    const healthSpec: PartitionSpec<HealthSchema> = {
      name: "health",
      schema: { current: [Int16Array, 100], max: [Int16Array, 100] },
      maxOwners: 16, // Sparse
    };

    const posPartition = buffer.addPartition(new Partition(posSpec));
    const healthPartition = buffer.addPartition(new Partition(healthSpec));

    if (!posPartition || !healthPartition) return;

    // Simulate entity lifecycle
    for (let entity = 0; entity < 16; entity++) {
      // Create entity
      posPartition.partitions.x[entity * 10] = Math.random() * 100;
      posPartition.partitions.y[entity * 10] = Math.random() * 100;
      healthPartition.partitions.current[entity * 10] = 100;
      healthPartition.partitions.max[entity * 10] = 100;

      // Update entity
      posPartition.partitions.x[entity * 10] += 1;
      posPartition.partitions.y[entity * 10] += 1;
      healthPartition.partitions.current[entity * 10] -= 10;

      // Destroy entity (every other one)
      if (entity % 2 === 0) {
        delete posPartition.partitions.x[entity * 10];
        delete posPartition.partitions.y[entity * 10];
        delete healthPartition.partitions.current[entity * 10];
        delete healthPartition.partitions.max[entity * 10];
      }
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Game loop simulation",
  fn: () => {
    const buffer = new PartitionedBuffer(4096, 64);

    // Game components
    type TransformSchema = { x: number; y: number; rotation: number };
    const transformSpec: PartitionSpec<TransformSchema> = {
      name: "transform",
      schema: {
        x: Float32Array,
        y: Float32Array,
        rotation: Float32Array,
      },
    };

    type PhysicsSchema = { vx: number; vy: number; mass: number };
    const physicsSpec: PartitionSpec<PhysicsSchema> = {
      name: "physics",
      schema: {
        vx: Float32Array,
        vy: Float32Array,
        mass: [Float32Array, 1],
      },
    };

    type RenderSchema = { sprite: number; layer: number };
    const renderSpec: PartitionSpec<RenderSchema> = {
      name: "render",
      schema: {
        sprite: Uint16Array,
        layer: [Uint8Array, 0],
      },
    };

    const transform = buffer.addPartition(new Partition(transformSpec));
    const physics = buffer.addPartition(new Partition(physicsSpec));
    const render = buffer.addPartition(new Partition(renderSpec));

    if (!transform || !physics || !render) return;

    // Simulate game loop operations
    for (let i = 0; i < 64; i++) {
      // Physics system
      transform.partitions.x[i] += physics.partitions.vx?.[i] ?? 0;
      transform.partitions.y[i] += physics.partitions.vy?.[i] ?? 0;

      // Rotation update
      transform.partitions.rotation[i] += 0.01;
      if ((transform.partitions.rotation?.[i] ?? 0) > Math.PI * 2) {
        transform.partitions.rotation[i] = 0;
      }

      // Render system queries (values used for simulation)
      render.partitions.sprite?.[i];
      render.partitions.layer?.[i];

      // Collision detection (simple bounds check)
      if ((transform.partitions.x?.[i] ?? 0) < 0 || (transform.partitions.x?.[i] ?? 0) > 800) {
        physics.partitions.vx[i] *= -1;
      }
      if ((transform.partitions.y?.[i] ?? 0) < 0 || (transform.partitions.y?.[i] ?? 0) > 600) {
        physics.partitions.vy[i] *= -1;
      }
    }
  },
});

Deno.bench({
  name: "PartitionedBuffer - Memory pressure scenario",
  fn: () => {
    const buffer = new PartitionedBuffer(1024, 16); // Tight memory constraints
    const partitions: Array<{ name: string; partition: any }> = [];

    // Phase 1: Fill buffer with various component types
    const componentTypes = [
      { name: "position", schema: { x: Float32Array, y: Float32Array } },
      { name: "velocity", schema: { x: Float32Array, y: Float32Array } },
      { name: "health", schema: { current: Int16Array, max: Int16Array } },
      { name: "damage", schema: { value: Int16Array } },
      { name: "level", schema: { value: Uint8Array } },
    ];

    // Add partitions until memory is full
    for (let i = 0; i < componentTypes.length && buffer.getFreeSpace() > 0; i++) {
      const componentType = componentTypes[i];
      if (!componentType) continue;

      try {
        const spec = {
          name: componentType.name,
          schema: componentType.schema,
        };
        const partition = buffer.addPartition(new Partition(spec as PartitionSpec<any>));
        if (partition) {
          partitions.push({ name: spec.name, partition });
        }
      } catch {
        break;
      }
    }

    // Phase 2: Intensive operations on limited memory
    for (const { partition } of partitions) {
      for (let i = 0; i < 16; i++) {
        // Write to all properties
        Object.values(partition.partitions).forEach((array: any, idx) => {
          array[i] = idx;
        });
      }
    }

    // Phase 3: Clear and reuse
    buffer.clear();

    // Phase 4: Re-add single large partition
    try {
      type Schema = { data: number };
      const spec: PartitionSpec<Schema> = {
        name: "large",
        schema: { data: Float64Array },
      };
      buffer.addPartition(new Partition(spec));
    } catch {
      // Expected if still too large
    }
  },
});
