/**
 * @module      storage
 * @description Factory for partition schema storage handles.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 */

import type { SchemaSpec, SchemaStorage } from "./Schema.ts";
import type { TypedArray } from "./utils.ts";

export function createSchemaStorage<T extends SchemaSpec<T>>(opts: {
  byteOffset: number;
  byteLength: number;
  partitions: Record<keyof T, TypedArray>;
  mode: "dense" | "sparse";
}): SchemaStorage<T> {
  const { byteOffset, byteLength, partitions, mode } = opts;

  return {
    byteOffset,
    byteLength,
    partitions,
    get: (partition: keyof T, index: number): number | undefined => {
      return partitions[partition]?.[index] ?? undefined;
    },
    set: (partition: keyof T, index: number, value: number): void => {
      const partitionStorage = partitions[partition];
      if (!partitionStorage) {
        throw new Error(`Partition ${String(partition)} not found`);
      }
      if (mode === "dense" && (index < 0 || index >= partitionStorage.length)) {
        throw new RangeError(`Index ${index} out of bounds for partition ${String(partition)}`);
      }
      partitionStorage[index] = value;
    },
  };
}
