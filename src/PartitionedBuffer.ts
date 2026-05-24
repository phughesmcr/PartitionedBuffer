/**
 * @description A convenient way to manage a data in ArrayBuffers.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 * @module      PartitionedBuffer
 */

import { alignOffset, getPartitionByteSize, MAX_PARTITION_SIZE, MIN_ALIGNMENT } from "./layout.ts";
import { Partition, type PartitionSpec, type PartitionStorage } from "./Partition.ts";
import type { SchemaProperty, SchemaSpec } from "./Schema.ts";
import { sparseFacade, SparseIndex } from "./SparseFacade.ts";
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

/** A PartitionedBuffer is an ArrayBuffer with named storage partitions. */
export class PartitionedBuffer extends ArrayBuffer {
  /** Minimum alignment in bytes for TypedArrays */
  static readonly MIN_ALIGNMENT: typeof MIN_ALIGNMENT = MIN_ALIGNMENT;

  /** Maximum safe partition size to prevent allocation errors */
  static readonly MAX_PARTITION_SIZE: typeof MAX_PARTITION_SIZE = MAX_PARTITION_SIZE;

  /** The maximum possible number of owners per partition */
  readonly maxEntitiesPerPartition: number;

  /** Partition storage keyed by name */
  readonly #storageByName: Map<string, PartitionStorage<SchemaSpec<unknown>> | null>;

  /** Identity fast-path: same Partition instance re-add returns cached storage */
  readonly #partitionsByInstance: Map<
    Partition<SchemaSpec<unknown> | null>,
    PartitionStorage<SchemaSpec<unknown>> | null
  >;

  /** The current offset into the underlying ArrayBuffer */
  #offset: number;

  /**
   * Create a new PartitionedBuffer
   * @param size the size of the buffer
   * @param maxEntitiesPerPartition the length of each row in the buffer [min = 8]
   * @throws {SyntaxError} if `size` or `maxEntitiesPerPartition` are not numbers
   *   or if `size` or `maxEntitiesPerPartition` are not positive safe integers
   *   or if `size` is not a multiple of `maxEntitiesPerPartition`
   */
  constructor(size: number, maxEntitiesPerPartition: number = size) {
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

    super(size);
    this.#storageByName = new Map();
    this.#partitionsByInstance = new Map();
    this.#offset = 0;
    this.maxEntitiesPerPartition = maxEntitiesPerPartition;
  }

  #alignOffset(alignment: number): void {
    try {
      this.#offset = alignOffset(this.#offset, alignment, this.byteLength);
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
    this.#validateSchemaEntry(String(name), value);

    const Ctr: TypedArrayConstructor = Array.isArray(value) ? value[0] : value;
    const initialValue: number = Array.isArray(value) ? value[1] : 0;
    const bytesPerElement = Ctr.BYTES_PER_ELEMENT;
    const elements = maxOwners ?? this.maxEntitiesPerPartition;
    const requiredBytes = elements * bytesPerElement;

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

    if (this.#offset + requiredBytes > this.byteLength) {
      const available = this.byteLength - this.#offset;
      throw new Error(
        `Buffer overflow: insufficient space for partition "${String(name)}"\n` +
          `Required: ${requiredBytes} bytes\n` +
          `Available: ${available} bytes\n` +
          `Missing: ${requiredBytes - available} bytes`,
      );
    }

    let typedArray: TypedArray;
    try {
      typedArray = new Ctr(this, this.#offset, elements);
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
    if (this.#partitionsByInstance.has(partition)) return;

    if (this.#storageByName.has(name)) {
      throw new Error(`Partition name ${name} already exists`);
    }

    if (maxOwners !== null && (!Number.isSafeInteger(maxOwners) || maxOwners <= 0)) {
      throw new Error("maxOwners must be a positive integer or null");
    }
  }

  /**
   * Add a partition to the buffer.
   * @param specOrPartition the partition specification or instance to add
   * @returns the partition storage, or null if no schema was provided
   * @throws {Error} if the partition name exists or there is not enough space
   * @throws {TypeError} if the schema contains invalid properties
   */
  addPartition<T extends SchemaSpec<T> | null = null>(
    specOrPartition: PartitionSpec<T> | Partition<T>,
  ): PartitionStorage<T> {
    const partition = specOrPartition instanceof Partition ? specOrPartition : new Partition(specOrPartition);
    const { name, schema = null, maxOwners = null, maxEntityId = null } = partition;

    if (this.#partitionsByInstance.has(partition)) {
      return this.#partitionsByInstance.get(partition) as PartitionStorage<T>;
    }

    this.#validatePartitionParams(partition, name, maxOwners);

    if (!schema) {
      this.#partitionsByInstance.set(partition, null);
      this.#storageByName.set(name, null);
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

    this.#partitionsByInstance.set(partition, result);
    this.#storageByName.set(name, result);

    return result as PartitionStorage<T>;
  }

  /**
   * Clear the buffer and release references.
   *
   * Existing partition storage handles still reference their typed-array views
   * over this ArrayBuffer, but they are no longer registered with the buffer.
   * Add partitions again and retrieve fresh handles after calling clear().
   */
  clear(): this {
    for (const storage of this.#storageByName.values()) {
      clearAllPartitionArrays(storage);
    }
    this.#partitionsByInstance.clear();
    this.#storageByName.clear();
    this.#offset = 0;
    return this;
  }

  /** The amount of free space in bytes in the underlying ArrayBuffer */
  getFreeSpace(): number {
    return this.byteLength - this.#offset;
  }

  /**
   * Get a partition by name or spec.
   * @param key the partition name or spec to retrieve
   * @returns the partition storage if found, undefined otherwise
   * @throws {TypeError} if key is null or undefined
   */
  getPartition<T extends SchemaSpec<T> | null = null>(
    key: PartitionSpec<T> | Partition<T> | string,
  ): PartitionStorage<T> | undefined {
    if (!key) {
      throw new TypeError("key must be a string or PartitionSpec");
    }
    const name = this.#resolvePartitionName(key);
    if (key instanceof Partition) {
      const byInstance = this.#partitionsByInstance.get(key);
      if (byInstance !== undefined) return byInstance as PartitionStorage<T>;
    }
    return this.#storageByName.get(name!) as PartitionStorage<T> | undefined;
  }

  /** Get the current offset into the underlying ArrayBuffer */
  getOffset(): number {
    return this.#offset;
  }

  /**
   * Check if a partition exists.
   * @param key the partition name or spec to check
   * @returns true if the partition exists, false otherwise
   */
  hasPartition<T extends SchemaSpec<T> | null = null>(
    key: PartitionSpec<T> | Partition<T> | string,
  ): boolean {
    if (!key) {
      throw new TypeError("key must be a string or PartitionSpec");
    }
    if (key instanceof Partition) {
      return this.#partitionsByInstance.has(key);
    }
    const name = this.#resolvePartitionName(key);
    return this.#storageByName.has(name!);
  }

  #validateSchemaEntry(name: string, value: SchemaProperty): void {
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
}
