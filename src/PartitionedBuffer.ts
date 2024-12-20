/**
 * @module      PartitionedBuffer
 * @description A convenient way to manage a data in ArrayBuffers.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 */

import type { PartitionSpec, PartitionStorage } from "./Partition.ts";
import type { Schema, SchemaProperty, SchemaSpec } from "./Schema.ts";
import { sparseFacade } from "./SparseFacade.ts";
import type { TypedArray, TypedArrayConstructor } from "./utils.ts";

/** A PartitionedBuffer is an ArrayBuffer with named storage partitions. */
export class PartitionedBuffer extends ArrayBuffer {
  // A map of all partition names for fast lookup
  readonly #partitionsByNames: Map<
    string,
    PartitionStorage<SchemaSpec<unknown>> | null
  >;

  /** The current offset into the underlying ArrayBuffer */
  #offset: number;

  /** The partitions in the buffer */
  readonly #partitions: Map<
    PartitionSpec<SchemaSpec<unknown>>,
    PartitionStorage<SchemaSpec<unknown>> | null
  >;

  /** The maximum possible number of owners per partition */
  readonly #maxEntitiesPerPartition: number;

  /**
   * Create a new PartitionedBuffer
   * @param size the size of the buffer
   * @param maxEntitiesPerPartition the length of each row in the buffer [min = 8]
   * @throws {TypeError} if `size` or `maxEntitiesPerPartition` are not numbers
   * @throws {RangeError} if `size` or `maxEntitiesPerPartition` are not positive safe integers or  `size` is not a multiple of `maxEntitiesPerPartition`
   */
  constructor(size: number, maxEntitiesPerPartition: number) {
    // Validate size
    if (typeof size !== "number" || isNaN(size)) {
      throw new TypeError("size must be a number");
    }
    if (!Number.isSafeInteger(size)) {
      throw new RangeError("size must be a safe integer");
    }
    if (size <= 0) {
      throw new RangeError("size must be positive");
    }

    // Validate maxEntitiesPerPartition
    if (typeof maxEntitiesPerPartition !== "number" || isNaN(maxEntitiesPerPartition)) {
      throw new TypeError("maxEntitiesPerPartition must be a number");
    }
    if (!Number.isSafeInteger(maxEntitiesPerPartition)) {
      throw new RangeError("maxEntitiesPerPartition must be a safe integer");
    }
    if (maxEntitiesPerPartition <= 0) {
      throw new RangeError("maxEntitiesPerPartition must be positive");
    }
    if (maxEntitiesPerPartition < 8) {
      throw new RangeError(
        "maxEntitiesPerPartition must be at least 8 to accommodate all possible TypedArray alignments",
      );
    }
    if (size % maxEntitiesPerPartition !== 0) {
      throw new RangeError("size must be a multiple of maxEntitiesPerPartition");
    }

    super(size);
    this.#partitionsByNames = new Map();
    this.#offset = 0;
    this.#partitions = new Map();
    this.#maxEntitiesPerPartition = maxEntitiesPerPartition;
  }

  /** The length of each row in the buffer */
  get maxEntitiesPerPartition(): number {
    return this.#maxEntitiesPerPartition;
  }

  #alignOffset(alignment: number): void {
    // Bitwise alignment is faster than Math.ceil
    this.#offset = (this.#offset + alignment - 1) & ~(alignment - 1);
  }

  #createPartition<T extends SchemaSpec<T> | null>(
    [name, value]: [keyof T, SchemaProperty],
    maxOwners: number | null = null,
  ): [keyof T, TypedArray] {
    const Ctr: TypedArrayConstructor = Array.isArray(value) ? value[0] : value;
    const initialValue: number = Array.isArray(value) ? value[1] : 0;
    const bytesPerElement = Ctr.BYTES_PER_ELEMENT;

    // Pre-calculate required space
    const elements = this.#maxEntitiesPerPartition;
    const requiredBytes = elements * bytesPerElement;

    // Single alignment calculation
    this.#alignOffset(bytesPerElement);

    if (this.#offset + requiredBytes > this.byteLength) {
      throw new Error(`Buffer overflow: insufficient space for partition ${String(name)}`);
    }

    // Create array at aligned offset
    const typedArray = new Ctr(this, this.#offset, elements);

    // Use native fill which is faster than loop
    typedArray.fill(initialValue);

    this.#offset += requiredBytes;

    return [name, maxOwners ? sparseFacade(typedArray) : typedArray];
  }

  /**
   * Add a partition to the buffer
   * @param partition - The partition specification to add
   * @param partition.name - Unique name for the partition
   * @param partition.schema - Schema defining the data structure
   * @param partition.maxOwners - Optional limit on number of owners
   * @returns The partition storage, or null if no schema was provided
   * @throws {Error} If the partition name exists or there isn't enough space
   * @throws {TypeError} If the schema contains invalid properties
   */
  addPartition<T extends SchemaSpec<T> | null = null>(spec: PartitionSpec<T>): PartitionStorage<T> {
    const { name, schema = null, maxOwners = null } = spec;

    if (!schema) return null as PartitionStorage<T>;

    // Fast path for existing partitions
    if (this.#partitions.has(spec as PartitionSpec<SchemaSpec<unknown>>)) {
      return this.#partitions.get(spec as PartitionSpec<SchemaSpec<unknown>>) as PartitionStorage<T>;
    }

    if (this.#partitionsByNames.has(name)) {
      throw new Error(`Partition name ${name} already exists`);
    }

    if (maxOwners !== null && (!Number.isSafeInteger(maxOwners) || maxOwners < 0)) {
      throw new Error("maxOwners must be a positive integer or null");
    }

    // Pre-calculate total size needed including alignment
    let alignedSize = 0;
    const schemaEntries = Object.entries(schema as Schema<T>) as [keyof T, SchemaProperty][];
    const numProperties = schemaEntries.length;

    // Pre-allocate array for partitions
    const partitions: [keyof T, TypedArray][] = new Array(numProperties);

    // Calculate aligned size in single pass
    for (let i = 0; i < numProperties; i++) {
      const [_, value] = schemaEntries[i]!;
      const Ctr = Array.isArray(value) ? value[0] : value;
      alignedSize = (alignedSize + Ctr.BYTES_PER_ELEMENT - 1) & ~(Ctr.BYTES_PER_ELEMENT - 1);
      alignedSize += this.#maxEntitiesPerPartition;
    }

    if (alignedSize > this.getFreeSpace()) {
      throw new Error(`Not enough free space to add partition ${name} (needs ${alignedSize} bytes)`);
    }

    // Create partitions in single pass
    for (let i = 0; i < numProperties; i++) {
      partitions[i] = this.#createPartition(schemaEntries[i]!, maxOwners);
    }

    const partition = {
      byteLength: alignedSize,
      byteOffset: this.#offset,
      partitions: Object.fromEntries(partitions) as Record<keyof T, TypedArray>,
    } as unknown as PartitionStorage<T>;

    this.#partitions.set(spec as PartitionSpec<SchemaSpec<unknown>>, partition);
    this.#partitionsByNames.set(name, partition);
    this.#offset += alignedSize;

    return partition;
  }

  /** Clear the buffer and release references */
  clear(): this {
    this.#partitions.forEach((partition) => {
      if (!partition) return;
      Object.values(partition.partitions).forEach((typedArray) => {
        (typedArray as TypedArray).fill(0);
      });
    });
    this.#offset = 0;
    this.#partitions.clear();
    this.#partitionsByNames.clear();
    return this;
  }

  /** The amount of free space in bytes in the underlying ArrayBuffer */
  getFreeSpace(): number {
    return this.byteLength - this.#offset;
  }

  /**
   * Get a partition by name or spec
   * @param key - The partition name or spec to retrieve
   * @returns The partition storage if found, undefined otherwise
   * @throws {TypeError} If key is null or undefined
   */
  getPartition<T extends SchemaSpec<T> | null = null>(
    key: PartitionSpec<T> | string,
  ): PartitionStorage<T> | undefined {
    if (!key) {
      throw new TypeError("key must be a string or PartitionSpec");
    }
    if (typeof key === "string") {
      return this.#partitionsByNames.get(key) as PartitionStorage<T> | undefined;
    }
    return this.#partitions.get(key as PartitionSpec<SchemaSpec<unknown>>) as PartitionStorage<T> | undefined;
  }

  /** Get the current offset into the underlying ArrayBuffer */
  getOffset(): number {
    return this.#offset;
  }

  /**
   * Check if a partition exists
   * @param key - The partition name or spec to check
   * @returns True if the partition exists, false otherwise
   */
  hasPartition<T extends SchemaSpec<T> | null = null>(
    key: PartitionSpec<T> | string,
  ): boolean {
    if (!key) {
      throw new TypeError("key must be a string or PartitionSpec");
    }
    if (typeof key === "string") {
      return this.#partitionsByNames.has(key);
    }
    return this.#partitions.has(key as PartitionSpec<SchemaSpec<unknown>>);
  }
}
