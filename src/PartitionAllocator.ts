/**
 * @module      PartitionAllocator
 * @description Internal partition allocator shared by PartitionedBuffer and SharedPartitionedBuffer.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 */

import { alignOffset, getPartitionByteSize, MAX_PARTITION_SIZE, MIN_ALIGNMENT } from "./layout.ts";
import type { ColumnLayout, PartitionLayout, TypedArrayName } from "./manifest.ts";
import { Partition, type PartitionSpec, type PartitionStorage } from "./Partition.ts";
import type { SchemaProperty, SchemaSpec } from "./Schema.ts";
import { type SparseEntityStorage, sparseFacade, SparseIndex } from "./SparseFacade.ts";
import { createSchemaStorage } from "./storage.ts";
import {
  isTypedArrayConstructor,
  isUint32,
  isValidTypedArrayValue,
  type TypedArray,
  type TypedArrayConstructor,
  zeroArray,
} from "./utils.ts";

/**
 * Validate the size arguments shared by both buffer constructors.
 * @throws {SyntaxError} if the arguments are invalid
 */
export function validateBufferSize(size: number, maxEntitiesPerPartition: number): void {
  if (!isUint32(size)) {
    throw new SyntaxError("size must be a Uint32 number");
  } else if (size === 0) {
    throw new SyntaxError("size must be > 0");
  }

  if (maxEntitiesPerPartition !== size) {
    if (!isUint32(maxEntitiesPerPartition)) {
      throw new SyntaxError("maxEntitiesPerPartition must be a Uint32 number");
    } else if (size % maxEntitiesPerPartition !== 0) {
      throw new SyntaxError("size must be a multiple of maxEntitiesPerPartition");
    }
  }

  if (maxEntitiesPerPartition < MIN_ALIGNMENT) {
    throw new SyntaxError(
      "maxEntitiesPerPartition must be at least 8 to accommodate all possible TypedArray alignments",
    );
  }
}

/**
 * Clear all partitions in a buffer
 * @param partition the partition to clear
 * @returns the partition
 * @note Uses for...in to avoid Object.values() allocation
 */
function clearAllPartitionArrays<T extends SchemaSpec<T>>(
  partition: PartitionStorage<T> | null,
): PartitionStorage<T> | null {
  if (!partition) return null;
  for (const key in partition.partitions) {
    if (Object.prototype.hasOwnProperty.call(partition.partitions, key)) {
      zeroArray(partition.partitions[key as keyof typeof partition.partitions]);
    }
  }
  return partition;
}

function validateSchemaEntry(name: string, value: SchemaProperty): void {
  const Ctr = Array.isArray(value) ? value[0] : value;
  const initialValue = Array.isArray(value) ? value[1] : 0;

  if (!isTypedArrayConstructor(Ctr)) {
    throw new TypeError(`Invalid type for schema property "${String(name)}"`);
  }

  if (Array.isArray(value) && !isValidTypedArrayValue(Ctr, initialValue)) {
    throw new TypeError(
      `Invalid initial value ${initialValue} for schema property "${String(name)}" of type ${Ctr.name}`,
    );
  }
}

/**
 * Allocates named partitions as typed-array views over one backing buffer.
 *
 * The backing buffer can be an `ArrayBuffer` (including a `PartitionedBuffer`) or a `SharedArrayBuffer`.
 */
export class PartitionAllocator {
  /** The maximum possible number of owners per partition */
  readonly maxEntitiesPerPartition: number;

  /** The memory the typed-array views are created over */
  readonly #buffer: ArrayBufferLike;

  /** Partition storage keyed by name (read-only outside this class) */
  readonly storageByName: Map<string, PartitionStorage<SchemaSpec<unknown>> | null>;

  /** Identity fast-path: same Partition instance re-add returns cached storage (read-only outside this class) */
  readonly partitionsByInstance: Map<
    Partition<SchemaSpec<unknown> | null>,
    PartitionStorage<SchemaSpec<unknown>> | null
  >;

  /** The current offset into the backing buffer */
  #offset: number;

  constructor(buffer: ArrayBufferLike, maxEntitiesPerPartition: number) {
    this.#buffer = buffer;
    this.storageByName = new Map();
    this.partitionsByInstance = new Map();
    this.#offset = 0;
    this.maxEntitiesPerPartition = maxEntitiesPerPartition;
  }

  #alignOffset(alignment: number): void {
    try {
      this.#offset = alignOffset(this.#offset, alignment, this.#buffer.byteLength);
    } catch (error) {
      throw new Error(`Failed to align offset: ${(error as Error).message}`);
    }
  }

  #resolvePartitionName(
    key: string | Partition<SchemaSpec<unknown> | null> | PartitionSpec<SchemaSpec<unknown> | null>,
  ): string | undefined {
    if (typeof key === "string") return key;
    if (key instanceof Partition) return key.name;
    return key.name;
  }

  #createPartition<T extends SchemaSpec<T> | null>(
    [name, value]: [keyof T, SchemaProperty],
    sharedIndex?: SparseIndex,
    maxOwners: number | null = null,
    maxEntityId: number | null = null,
  ): [keyof T, TypedArray] {
    validateSchemaEntry(String(name), value);

    const Ctr: TypedArrayConstructor = Array.isArray(value) ? value[0] : value;
    const initialValue: number = Array.isArray(value) ? value[1] : 0;
    const bytesPerElement = Ctr.BYTES_PER_ELEMENT;
    const elements = maxOwners ?? this.maxEntitiesPerPartition;
    const requiredBytes = elements * bytesPerElement;
    const byteLength = this.#buffer.byteLength;

    if (requiredBytes > MAX_PARTITION_SIZE) {
      throw new RangeError(
        `Partition "${
          String(name)
        }" size (${requiredBytes} bytes) exceeds maximum allowed (${MAX_PARTITION_SIZE} bytes)`,
      );
    }

    try {
      this.#alignOffset(bytesPerElement);
    } catch (error) {
      throw new Error(`Failed to align partition "${String(name)}": ${(error as Error).message}`);
    }

    if (this.#offset + requiredBytes > byteLength) {
      const available = byteLength - this.#offset;
      throw new Error(
        `Buffer overflow: insufficient space for partition "${String(name)}"\n` +
          `Required: ${requiredBytes} bytes\n` +
          `Available: ${available} bytes\n` +
          `Missing: ${requiredBytes - available} bytes`,
      );
    }

    let typedArray: TypedArray;
    try {
      // The constructor union only types an ArrayBuffer overload; every typed array also accepts a SharedArrayBuffer.
      typedArray = new Ctr(this.#buffer as ArrayBuffer, this.#offset, elements);
      typedArray.fill(initialValue);
    } catch (error) {
      throw new Error(
        `Failed to create TypedArray for partition "${String(name)}": ${(error as Error).message}`,
      );
    }

    this.#offset += requiredBytes;

    if (maxOwners) {
      return [name, sparseFacade(typedArray, maxEntityId ?? undefined, sharedIndex)];
    }
    return [name, typedArray];
  }

  #validatePartitionParams<T extends SchemaSpec<T>>(
    partition: Partition<T>,
    name: string,
    maxOwners: number | null,
  ): void {
    if (this.partitionsByInstance.has(partition)) return;

    if (this.storageByName.has(name)) {
      throw new Error(`Partition name ${name} already exists`);
    }

    if (maxOwners !== null && (!Number.isSafeInteger(maxOwners) || maxOwners <= 0)) {
      throw new Error("maxOwners must be a positive integer or null");
    }
  }

  addPartition<T extends SchemaSpec<T> | null = null>(
    specOrPartition: PartitionSpec<T> | Partition<T>,
  ): PartitionStorage<T> {
    const partition = specOrPartition instanceof Partition ? specOrPartition : new Partition(specOrPartition);
    const { name, schema = null, maxOwners = null, maxEntityId = null } = partition;

    if (this.partitionsByInstance.has(partition)) {
      return this.partitionsByInstance.get(partition) as PartitionStorage<T>;
    }

    this.#validatePartitionParams(partition, name, maxOwners);

    if (!schema) {
      this.partitionsByInstance.set(partition, null);
      this.storageByName.set(name, null);
      return null as PartitionStorage<T>;
    }

    const rowCount = maxOwners ?? this.maxEntitiesPerPartition;
    const alignedSize = getPartitionByteSize(schema, rowCount);
    if (alignedSize > this.getFreeSpace()) {
      const required = alignedSize - this.getFreeSpace();
      const hint = `(Size: ${alignedSize}; Available: ${this.getFreeSpace()}; Required: ${required})`;
      throw new Error(`Not enough free space to add partition ${name} ${hint}`);
    }

    const startOffset = this.#offset;
    const schemaEntries = Object.entries(schema) as [keyof T, SchemaProperty][];
    const sharedIndex = maxOwners ? new SparseIndex(maxOwners, { maxEntityId: maxEntityId ?? undefined }) : undefined;
    const partitions = Object.fromEntries(
      schemaEntries.map((entry) => this.#createPartition(entry, sharedIndex, maxOwners, maxEntityId)),
    ) as Record<keyof T, TypedArray>;

    const result = createSchemaStorage<T>({
      byteLength: alignedSize,
      byteOffset: startOffset,
      partitions,
      mode: maxOwners ? "sparse" : "dense",
    });

    this.partitionsByInstance.set(partition, result);
    this.storageByName.set(name, result);

    return result as PartitionStorage<T>;
  }

  clear(): void {
    for (const storage of this.storageByName.values()) {
      clearAllPartitionArrays(storage);
    }
    this.partitionsByInstance.clear();
    this.storageByName.clear();
    this.#offset = 0;
  }

  getFreeSpace(): number {
    return this.#buffer.byteLength - this.#offset;
  }

  /** Build the layout from the registered storage, so `addPartition` pays nothing for it. */
  getLayout(): PartitionLayout[] {
    const layout: PartitionLayout[] = [];
    for (const [name, storage] of this.storageByName) {
      if (!storage) continue;
      let mode: PartitionLayout["mode"] = "dense";
      let rowCount = 0;
      const columns: ColumnLayout[] = [];
      for (const [column, view] of Object.entries(storage.partitions as Record<string, TypedArray>)) {
        // A sparse column is a SparseFacade; its `dense` property is the typed array over the buffer.
        const dense = (view as Partial<SparseEntityStorage<TypedArray>>).dense ?? view;
        if (dense !== view) mode = "sparse";
        rowCount = dense.length;
        columns.push({
          name: column,
          type: dense.constructor.name as TypedArrayName,
          byteOffset: dense.byteOffset,
          length: dense.length,
        });
      }
      layout.push({ name, mode, byteOffset: storage.byteOffset, byteLength: storage.byteLength, rowCount, columns });
    }
    return layout;
  }

  getPartition<T extends SchemaSpec<T> | null = null>(
    key: PartitionSpec<T> | Partition<T> | string,
  ): PartitionStorage<T> | undefined {
    if (!key) {
      throw new TypeError("key must be a string or PartitionSpec");
    }
    const name = this.#resolvePartitionName(key);
    if (key instanceof Partition) {
      const byInstance = this.partitionsByInstance.get(key);
      if (byInstance !== undefined) return byInstance as PartitionStorage<T>;
    }
    return this.storageByName.get(name!) as PartitionStorage<T> | undefined;
  }

  getOffset(): number {
    return this.#offset;
  }

  hasPartition<T extends SchemaSpec<T> | null = null>(
    key: PartitionSpec<T> | Partition<T> | string,
  ): boolean {
    if (!key) {
      throw new TypeError("key must be a string or PartitionSpec");
    }
    if (key instanceof Partition) {
      return this.partitionsByInstance.has(key);
    }
    const name = this.#resolvePartitionName(key);
    return this.storageByName.has(name!);
  }
}
