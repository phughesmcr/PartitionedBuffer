/**
 * @module      PartitionedBuffer
 * @description A convenient way to manage a data in ArrayBuffers.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 */

import type { Partition, PartitionSpec, PartitionStorage } from "./Partition.ts";
import type { Schema, SchemaProperty, SchemaSpec } from "./Schema.ts";
import { sparseFacade } from "./SparseFacade.ts";
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
 */
function clearAllPartitionArrays<T extends SchemaSpec<T>>(
  partition: PartitionStorage<T> | null,
): PartitionStorage<T> | null {
  if (!partition) return null;
  Object.values<TypedArray>(partition.partitions).forEach(zeroArray);
  return partition;
}

/** A PartitionedBuffer is an ArrayBuffer with named storage partitions. */
export class PartitionedBuffer extends ArrayBuffer {
  /** Minimum alignment in bytes for TypedArrays */
  static readonly MIN_ALIGNMENT = 8 as const;

  /** Maximum safe partition size to prevent allocation errors */
  static readonly MAX_PARTITION_SIZE = 1073741824 as const; // 1GB (1024 * 1024 * 1024)

  /** The maximum possible number of owners per partition */
  readonly #maxEntitiesPerPartition: number;

  /** The partitions in the buffer */
  // deno-lint-ignore no-explicit-any
  readonly #partitions: Map<Partition<any>, PartitionStorage<any> | null>;

  /** A map of all partition names for fast lookup */
  // deno-lint-ignore no-explicit-any
  readonly #partitionsByNames: Map<string, PartitionStorage<any> | null>;

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
    // Validate size
    if (!isUint32(size)) {
      throw new SyntaxError("size must be a multiple of maxEntitiesPerPartition and a Uint32 number");
    } else if (size <= 0) {
      throw new SyntaxError("size must be > 0");
    }

    // Validate maxEntitiesPerPartition
    if (maxEntitiesPerPartition !== size) {
      if (!isUint32(maxEntitiesPerPartition)) {
        throw new SyntaxError("maxEntitiesPerPartition must be a Uint32 number");
      } else if (maxEntitiesPerPartition <= 0) {
        throw new SyntaxError("maxEntitiesPerPartition must be > 0");
      } else if (maxEntitiesPerPartition < 8) {
        throw new SyntaxError(
          "maxEntitiesPerPartition must be at least 8 to accommodate all possible TypedArray alignments",
        );
      } else if (size % maxEntitiesPerPartition !== 0) {
        throw new SyntaxError("size must be a multiple of maxEntitiesPerPartition");
      }
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
    const oldOffset = this.#offset;
    // Ensure minimum alignment and power of 2
    alignment = Math.max(alignment, PartitionedBuffer.MIN_ALIGNMENT);
    if ((alignment & (alignment - 1)) !== 0) {
      throw new RangeError(`Alignment must be a power of 2, got ${alignment}`);
    }
    if (this.#offset + alignment > this.byteLength) {
      throw new RangeError("Insufficient space for alignment");
    }

    this.#offset = (oldOffset + alignment - 1) & ~(alignment - 1);

    if (this.#offset < oldOffset) {
      throw new RangeError("Alignment calculation overflow");
    }
  }

  #createPartition<T extends SchemaSpec<T> | null>(
    [name, value]: [keyof T, SchemaProperty],
    maxOwners: number | null = null,
  ): [keyof T, TypedArray] {
    // Validate schema entry
    this.#validateSchemaEntry(String(name), value);

    const Ctr: TypedArrayConstructor = Array.isArray(value) ? value[0] : value;
    const initialValue: number = Array.isArray(value) ? value[1] : 0;
    const bytesPerElement = Ctr.BYTES_PER_ELEMENT;

    // Pre-calculate required space
    const elements = this.#maxEntitiesPerPartition;
    const requiredBytes = elements * bytesPerElement;

    // Validate size
    if (requiredBytes > PartitionedBuffer.MAX_PARTITION_SIZE) {
      throw new RangeError(
        `Partition "${
          String(name)
        }" size (${requiredBytes} bytes) exceeds maximum allowed (${PartitionedBuffer.MAX_PARTITION_SIZE} bytes)`,
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

    // Create array at aligned offset
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

    return [name, maxOwners ? sparseFacade(typedArray) : typedArray];
  }

  /**
   * Validates partition parameters before creation
   * @throws {Error} If validation fails
   */
  #validatePartitionParams<T extends SchemaSpec<T>>(
    partition: Partition<T>,
    name: string,
    maxOwners: number | null,
  ): void {
    if (this.#partitions.has(partition)) return;

    if (this.#partitionsByNames.has(name)) {
      throw new Error(`Partition name ${name} already exists`);
    }

    if (maxOwners !== null && (!Number.isSafeInteger(maxOwners) || maxOwners <= 0)) {
      throw new Error("maxOwners must be a positive integer or null");
    }
  }

  /**
   * Calculates the total aligned size needed for a schema with validation
   */
  #calculateAlignedSize<T extends SchemaSpec<T>>(schema: Schema<T>): number {
    if (!schema) return 0;

    let alignedSize = 0;
    let lastAlignment: number = PartitionedBuffer.MIN_ALIGNMENT;

    for (const [name, value] of Object.entries(schema)) {
      this.#validateSchemaEntry(name, value as SchemaProperty);
      const Ctr = Array.isArray(value) ? value[0] : value;
      const alignment = Math.max(Ctr.BYTES_PER_ELEMENT, PartitionedBuffer.MIN_ALIGNMENT);
      const partitionSize = this.#maxEntitiesPerPartition * Ctr.BYTES_PER_ELEMENT;

      // Validate partition size
      if (partitionSize > PartitionedBuffer.MAX_PARTITION_SIZE) {
        throw new RangeError(
          `Partition property "${name}" size (${partitionSize} bytes) exceeds maximum allowed (${PartitionedBuffer.MAX_PARTITION_SIZE} bytes)`,
        );
      }

      // Track largest alignment for final size alignment
      lastAlignment = Math.max(lastAlignment, alignment);

      // Calculate aligned offset
      const alignedOffset = (alignedSize + alignment - 1) & ~(alignment - 1);

      // Check for overflow
      if (alignedOffset < alignedSize || alignedOffset > Number.MAX_SAFE_INTEGER - partitionSize) {
        throw new RangeError(`Schema size calculation overflow at property "${name}"`);
      }

      alignedSize = alignedOffset + partitionSize;
    }

    // Ensure final size is aligned
    const finalSize = (alignedSize + lastAlignment - 1) & ~(lastAlignment - 1);
    if (finalSize < alignedSize) {
      throw new RangeError("Final size alignment overflow");
    }

    return finalSize;
  }

  /**
   * Add a partition to the buffer
   * @param partition - The partition specification to add
   * @returns The partition storage, or null if no schema was provided
   * @throws {Error} If the partition name exists or there isn't enough space
   * @throws {TypeError} If the schema contains invalid properties
   */
  addPartition<T extends SchemaSpec<T> | null = null>(partition: Partition<T>): PartitionStorage<T> {
    const { name, schema = null, maxOwners = null } = partition;

    if (!schema) return null as PartitionStorage<T>;

    // Fast path for existing partitions
    if (this.#partitions.has(partition)) {
      return this.#partitions.get(partition) as PartitionStorage<T>;
    }

    // Validate parameters
    this.#validatePartitionParams(partition, name, maxOwners);

    // Calculate required space
    const alignedSize = this.#calculateAlignedSize(schema);
    if (alignedSize > this.getFreeSpace()) {
      const required = alignedSize - this.getFreeSpace();
      const hint = `(Size: ${alignedSize}; Available: ${this.getFreeSpace()}; Required: ${required})`;
      throw new Error(`Not enough free space to add partition ${name} ${hint}`);
    }

    // Capture start offset before creating partitions
    const startOffset = this.#offset;

    // Create partitions
    const schemaEntries = Object.entries(schema) as [keyof T, SchemaProperty][];
    const partitions = schemaEntries.map((entry) => this.#createPartition(entry, maxOwners));

    // Create and store the partition storage
    const result = {
      byteLength: alignedSize,
      byteOffset: startOffset,
      partitions: Object.fromEntries(partitions) as Record<keyof T, TypedArray>,
    } as unknown as PartitionStorage<T>;

    this.#partitions.set(partition, result);
    this.#partitionsByNames.set(name, result);

    return result;
  }

  /** Clear the buffer and release references */
  clear(): this {
    this.#partitions.forEach(clearAllPartitionArrays);
    this.#partitions.clear();
    this.#partitionsByNames.clear();
    this.#offset = 0;
    return this;
  }

  /** The amount of free space in bytes in the underlying ArrayBuffer */
  getFreeSpace(): number {
    return this.byteLength - this.#offset;
  }

  /**
   * Get a partition by name or spec
   * @param key - The partition name or object to retrieve
   * @returns The partition storage if found, undefined otherwise
   * @throws {TypeError} If key is null or undefined
   */
  getPartition<T extends SchemaSpec<T> | null = null>(
    key: Partition<T> | string,
  ): PartitionStorage<T> | undefined {
    if (!key) {
      throw new TypeError("key must be a string or PartitionSpec");
    }
    if (typeof key === "string") {
      return this.#partitionsByNames.get(key) as PartitionStorage<T> | undefined;
    }
    return this.#partitions.get(key as Partition<T>) as PartitionStorage<T> | undefined;
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
    return this.#partitions.has(key as Partition<T>);
  }

  /**
   * Validates schema entry values
   * @throws {TypeError} If the schema entry is invalid
   */
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
