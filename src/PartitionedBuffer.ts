/**
 * @description A convenient way to manage a data in ArrayBuffers.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 * @module      PartitionedBuffer
 */

import { MAX_PARTITION_SIZE, MIN_ALIGNMENT } from "./layout.ts";
import type { BufferLayout } from "./manifest.ts";
import { Partition, type PartitionSpec, type PartitionStorage } from "./Partition.ts";
import { PartitionAllocator, validateBufferSize } from "./PartitionAllocator.ts";
import type { SchemaSpec } from "./Schema.ts";

/** A PartitionedBuffer is an ArrayBuffer with named storage partitions. */
export class PartitionedBuffer extends ArrayBuffer {
  /** Minimum alignment in bytes for TypedArrays */
  static readonly MIN_ALIGNMENT: typeof MIN_ALIGNMENT = MIN_ALIGNMENT;

  /** Maximum safe partition size to prevent allocation errors */
  static readonly MAX_PARTITION_SIZE: typeof MAX_PARTITION_SIZE = MAX_PARTITION_SIZE;

  /** The maximum possible number of owners per partition */
  readonly maxEntitiesPerPartition: number;

  /** Allocates partition views over this buffer */
  readonly #allocator: PartitionAllocator;

  /** The allocator's partition maps, read directly so `hasPartition` stays as fast as a plain field lookup */
  readonly #storageByName: PartitionAllocator["storageByName"];

  /** See `#storageByName` */
  readonly #partitionsByInstance: PartitionAllocator["partitionsByInstance"];

  /**
   * Create a new PartitionedBuffer
   * @param size the size of the buffer
   * @param maxEntitiesPerPartition the length of each row in the buffer [min = 8]
   * @throws {SyntaxError} if `size` or `maxEntitiesPerPartition` are not numbers
   *   or if `size` or `maxEntitiesPerPartition` are not positive safe integers
   *   or if `size` is not a multiple of `maxEntitiesPerPartition`
   */
  constructor(size: number, maxEntitiesPerPartition: number = size) {
    validateBufferSize(size, maxEntitiesPerPartition);
    super(size);
    this.maxEntitiesPerPartition = maxEntitiesPerPartition;
    this.#allocator = new PartitionAllocator(this, maxEntitiesPerPartition);
    this.#storageByName = this.#allocator.storageByName;
    this.#partitionsByInstance = this.#allocator.partitionsByInstance;
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
    return this.#allocator.addPartition(specOrPartition);
  }

  /**
   * Clear the buffer and release references.
   *
   * Existing partition storage handles still reference their typed-array views
   * over this ArrayBuffer, but they are no longer registered with the buffer.
   * Add partitions again and retrieve fresh handles after calling clear().
   */
  clear(): this {
    this.#allocator.clear();
    return this;
  }

  /** The amount of free space in bytes in the underlying ArrayBuffer */
  getFreeSpace(): number {
    return this.#allocator.getFreeSpace();
  }

  /**
   * Describe where each partition's columns live in the buffer.
   *
   * The result is plain, structured-cloneable data. Pass it with a copy of this buffer's bytes
   * to `createPartitionViews` to rebuild the dense views elsewhere. To share live memory between
   * threads, use `SharedPartitionedBuffer` instead.
   * @returns a snapshot of the current layout; it does not update when partitions are added
   */
  getLayout(): BufferLayout {
    return {
      byteLength: this.byteLength,
      maxEntitiesPerPartition: this.maxEntitiesPerPartition,
      partitions: this.#allocator.getLayout(),
    };
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
    return this.#allocator.getPartition(key);
  }

  /** Get the current offset into the underlying ArrayBuffer */
  getOffset(): number {
    return this.#allocator.getOffset();
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
    return this.#storageByName.has(typeof key === "string" ? key : key.name);
  }
}
