/**
 * @description Named typed-array storage in one SharedArrayBuffer, for sharing columns with workers.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 * @module      SharedPartitionedBuffer
 */

import { MAX_PARTITION_SIZE, MIN_ALIGNMENT } from "./layout.ts";
import type { BufferLayout } from "./manifest.ts";
import type { Partition, PartitionSpec, PartitionStorage } from "./Partition.ts";
import { PartitionAllocator, validateBufferSize } from "./PartitionAllocator.ts";
import type { SchemaSpec } from "./Schema.ts";

/**
 * A SharedPartitionedBuffer has the same partition API as `PartitionedBuffer`, but its typed-array
 * columns are views over a `SharedArrayBuffer` held in `buffer`, so workers can read and write them.
 *
 * Send `buffer` and `getLayout()` to a worker with `postMessage`, then call `createPartitionViews` there.
 *
 * Limits:
 * - Only the numeric columns are shared. Sparse partitions keep their entity-to-slot index on the
 *   creating thread's heap, so other threads can only address their columns by owner slot.
 * - `addPartition` and `clear` change the layout on the creating thread only. Call them when no other
 *   thread is using the memory, and send a fresh layout afterwards.
 * - Typed-array writes are not atomic. Give each thread disjoint rows or columns, and synchronise with
 *   `postMessage` or `Atomics` before reading another thread's writes.
 * - `SharedArrayBuffer` must be available. Browsers expose it only on cross-origin isolated pages
 *   (COOP `same-origin` plus COEP `require-corp` or `credentialless`). Check `isSupported()` first.
 *
 * @example
 * ```ts
 * import { SharedPartitionedBuffer } from "@phughesmcr/partitionedbuffer";
 *
 * type Vec2 = { x: number; y: number };
 * const shared = new SharedPartitionedBuffer(1024, 64);
 * const position = shared.addPartition<Vec2>({ name: "position", schema: { x: Float32Array, y: Float32Array } });
 *
 * const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
 * worker.postMessage({ buffer: shared.buffer, layout: shared.getLayout() });
 * worker.onmessage = () => console.log(position.partitions.x[0]);
 * ```
 */
export class SharedPartitionedBuffer {
  /** Minimum alignment in bytes for TypedArrays */
  static readonly MIN_ALIGNMENT: typeof MIN_ALIGNMENT = MIN_ALIGNMENT;

  /** Maximum safe partition size to prevent allocation errors */
  static readonly MAX_PARTITION_SIZE: typeof MAX_PARTITION_SIZE = MAX_PARTITION_SIZE;

  /**
   * Check whether this runtime can create a SharedPartitionedBuffer.
   * @returns `true` if `SharedArrayBuffer` is available
   */
  static isSupported(): boolean {
    return typeof SharedArrayBuffer === "function";
  }

  /** The shared memory every partition column is a view of */
  readonly buffer: SharedArrayBuffer;

  /** The maximum possible number of owners per partition */
  readonly maxEntitiesPerPartition: number;

  /** Allocates partition views over `buffer` */
  readonly #allocator: PartitionAllocator;

  /**
   * Create a new SharedPartitionedBuffer
   * @param size the size of the buffer
   * @param maxEntitiesPerPartition the length of each row in the buffer [min = 8]
   * @throws {SyntaxError} if `size` or `maxEntitiesPerPartition` are not numbers
   *   or if `size` or `maxEntitiesPerPartition` are not positive safe integers
   *   or if `size` is not a multiple of `maxEntitiesPerPartition`
   * @throws {TypeError} if `SharedArrayBuffer` is not available
   */
  constructor(size: number, maxEntitiesPerPartition: number = size) {
    validateBufferSize(size, maxEntitiesPerPartition);
    if (!SharedPartitionedBuffer.isSupported()) {
      throw new TypeError(
        "SharedArrayBuffer is not available. Browsers require a cross-origin isolated page (COOP and COEP headers).",
      );
    }
    this.buffer = new SharedArrayBuffer(size);
    this.maxEntitiesPerPartition = maxEntitiesPerPartition;
    this.#allocator = new PartitionAllocator(this.buffer, maxEntitiesPerPartition);
  }

  /** The size of the shared buffer in bytes */
  get byteLength(): number {
    return this.buffer.byteLength;
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
   * Zero every partition and remove all registrations.
   *
   * Views in other threads keep pointing at the same memory, which may be reused by later partitions.
   * Send a fresh layout after adding partitions again.
   */
  clear(): this {
    this.#allocator.clear();
    return this;
  }

  /** The amount of free space in bytes in the shared buffer */
  getFreeSpace(): number {
    return this.#allocator.getFreeSpace();
  }

  /**
   * Describe where each partition's columns live in `buffer`.
   *
   * The result is plain, structured-cloneable data for `createPartitionViews`.
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

  /** Get the current offset into the shared buffer */
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
    return this.#allocator.hasPartition(key);
  }
}
