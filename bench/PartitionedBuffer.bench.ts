/// <reference lib="deno.ns" />
/// <reference lib="dom" />

import { PartitionedBuffer } from "../src/PartitionedBuffer.ts";
import { Partition, type PartitionSpec } from "../src/Partition.ts";

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
