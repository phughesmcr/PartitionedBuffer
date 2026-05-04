/**
 * @module      SparseFacade
 * @description A SparseFacade is a proxy to a dense TypedArray that allows for sparse storage of values.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 */

import { BitPool } from "@phughesmcr/bitpool";
import type { TypedArray } from "./utils.ts";

/** Sparse entity-id access layered over dense typed-array storage. */
export type SparseEntityStorage<T extends TypedArray> = {
  /** The dense backing array used for cache-friendly storage. */
  readonly dense: T;
  /** Read a value by sparse entity ID. */
  getEntity(entity: number): number | undefined;
  /** Set a value by sparse entity ID. */
  setEntity(entity: number, value: number): void;
  /** Remove an entity from the sparse mapping. */
  deleteEntity(entity: number): boolean;
  /** Clear all sparse mappings and zero the dense backing storage. */
  clearSparse(): void;
};

/**
 * A SparseFacade preserves typed-array operations on dense storage while adding
 * sparse entity-id bracket access.
 */
export type SparseFacade<T extends TypedArray> = T & SparseEntityStorage<T>;

/** Sentinel value indicating an entity is not present in the sparse mapping */
const NOT_PRESENT = -1;

type SparseIndexOptions = {
  maxEntityId?: number;
};

/**
 * Shared entity-to-dense index mapping for sparse facades.
 * Supports zero-allocation mode when maxEntityId is provided.
 */
export class SparseIndex {
  readonly #maxEntityId?: number;
  readonly #available: BitPool;
  readonly #denseArrays: Set<TypedArray>;
  readonly #sparseMap?: Map<number, number>;
  readonly #sparseArray?: Int32Array;
  readonly #denseToEntity?: Int32Array;

  constructor(denseLength: number, options: SparseIndexOptions = {}) {
    if (denseLength === 0) {
      throw new Error("Cannot create SparseIndex with zero-length array");
    } else if (denseLength > 2 ** 31 - 1) {
      throw new Error("Array length exceeds maximum safe BitPool size");
    }

    const { maxEntityId } = options;
    if (maxEntityId !== undefined) {
      if (!Number.isSafeInteger(maxEntityId) || maxEntityId < 0) {
        throw new Error("maxEntityId must be a non-negative safe integer");
      }
      this.#maxEntityId = maxEntityId;
      this.#sparseArray = new Int32Array(maxEntityId + 1);
      this.#sparseArray.fill(NOT_PRESENT);
      this.#denseToEntity = new Int32Array(denseLength);
      this.#denseToEntity.fill(NOT_PRESENT);
    } else {
      this.#sparseMap = new Map<number, number>();
    }

    this.#available = new BitPool(denseLength);
    this.#denseArrays = new Set<TypedArray>();
  }

  registerDenseArray(dense: TypedArray): void {
    this.#denseArrays.add(dense);
  }

  #clearDenseSlot(index: number): void {
    for (const dense of this.#denseArrays) {
      dense[index] = 0;
    }
  }

  get(entity: number): number | undefined {
    if (!Number.isSafeInteger(entity) || entity < 0) return undefined;
    if (this.#maxEntityId !== undefined && entity > this.#maxEntityId) return undefined;

    if (this.#sparseArray) {
      const idx = this.#sparseArray[entity] as number;
      return idx === NOT_PRESENT ? undefined : idx;
    }

    const idx = this.#sparseMap?.get(entity);
    return idx === undefined ? undefined : idx;
  }

  ensure(entity: number): number {
    if (!Number.isSafeInteger(entity)) {
      throw new TypeError(`Entity must be a safe integer, got ${entity}`);
    }
    if (entity < 0) {
      throw new RangeError(`Entity index must be non-negative, got ${entity}`);
    }
    if (this.#maxEntityId !== undefined && entity > this.#maxEntityId) {
      throw new RangeError(`Entity ${entity} out of bounds [0, ${this.#maxEntityId}]`);
    }

    if (this.#sparseArray) {
      let idx = this.#sparseArray[entity] as number;
      if (idx === NOT_PRESENT) {
        idx = this.#available.acquire();
        if (idx === NOT_PRESENT) {
          throw new RangeError(`Dense storage exhausted (capacity: ${this.#available.size})`);
        }
        this.#sparseArray[entity] = idx;
        if (this.#denseToEntity) {
          this.#denseToEntity[idx] = entity;
        }
      }
      return idx;
    }

    const existing = this.#sparseMap?.get(entity);
    if (existing !== undefined) return existing;
    const idx = this.#available.acquire();
    if (idx === NOT_PRESENT) {
      throw new RangeError(`Dense storage exhausted (capacity: ${this.#available.size})`);
    }
    this.#sparseMap?.set(entity, idx);
    return idx;
  }

  delete(entity: number): boolean {
    if (!Number.isSafeInteger(entity) || entity < 0) return false;
    if (this.#maxEntityId !== undefined && entity > this.#maxEntityId) return false;

    if (this.#sparseArray) {
      const idx = this.#sparseArray[entity] as number;
      if (idx === NOT_PRESENT) return true;
      this.#sparseArray[entity] = NOT_PRESENT;
      if (this.#denseToEntity) {
        this.#denseToEntity[idx] = NOT_PRESENT;
      }
      this.#clearDenseSlot(idx);
      this.#available.release(idx);
      return true;
    }

    const idx = this.#sparseMap?.get(entity);
    if (idx === undefined) return true;
    this.#sparseMap?.delete(entity);
    this.#clearDenseSlot(idx);
    this.#available.release(idx);
    return true;
  }

  clear(): void {
    if (this.#sparseArray) {
      this.#sparseArray.fill(NOT_PRESENT);
      this.#denseToEntity?.fill(NOT_PRESENT);
    }
    this.#sparseMap?.clear();
    this.#available.clear();
    for (const dense of this.#denseArrays) {
      dense.fill(0);
    }
  }
}

/**
 * A Sparse Facade is a proxy to a dense TypedArray that allows for sparse storage of values.
 *
 * The SparseFacade maintains a mapping between entity IDs and dense array indices, allowing
 * efficient sparse storage while keeping the underlying memory dense for cache performance.
 * Numeric bracket access uses entity IDs. TypedArray methods such as `slice()` and `fill()`
 * are bound to the dense backing array and operate on dense slots.
 *
 * **Zero-Allocation Mode**: When `maxEntityId` is provided, the facade uses pre-allocated
 * Int32Arrays for the sparse mapping, achieving zero GC allocations during runtime operations.
 * This is ideal for ECS systems where entity IDs are bounded.
 *
 * **Dynamic Mode**: When `maxEntityId` is omitted, the facade uses a Map for arbitrary entity IDs,
 * which may allocate on first insertion of each new entity.
 *
 * @param dense the typed array to apply the facade to
 * @param maxEntityId optional maximum entity ID for zero-allocation mode (inclusive)
 * @returns A proxy to the dense array that supports sparse operations
 *
 * @example Zero-Allocation Mode (recommended for ECS):
 * ```typescript
 * const dense = new Float32Array(100);
 * const sparse = sparseFacade(dense, 10000); // Pre-allocate for entity IDs 0-10000
 *
 * sparse[42] = 3.14;   // Zero allocation
 * sparse[1337] = 2.71; // Zero allocation
 * ```
 *
 * @example Dynamic Mode (for arbitrary entity IDs):
 * ```typescript
 * const dense = new Float32Array(100);
 * const sparse = sparseFacade(dense); // Map-based, allocates on new entities
 *
 * sparse[42] = 3.14;
 * sparse[999999] = 2.71;
 * ```
 *
 * @note **Disposal Methods:**
 * - `delete facade[-1]` - Magic disposal that clears all sparse mappings and zeros the dense array
 * - Use `disposeSparseArray(facade)` helper function for clearer intent
 * - Use `zeroArray(facade)` to dispose and zero in one operation
 */
export function sparseFacade<T extends TypedArray>(
  dense: T,
  maxEntityId?: number | SparseIndex,
  sharedIndex?: SparseIndex,
): SparseFacade<T> {
  let resolvedMaxEntityId: number | undefined;
  let index: SparseIndex | undefined;

  if (maxEntityId instanceof SparseIndex) {
    index = maxEntityId;
  } else {
    resolvedMaxEntityId = maxEntityId;
    index = sharedIndex;
  }

  if (!index) {
    index = new SparseIndex(dense.length, { maxEntityId: resolvedMaxEntityId });
  }

  index.registerDenseArray(dense);
  return sparseFacadeWithIndex(dense, index);
}

/**
 * Zero-allocation SparseFacade implementation using pre-allocated Int32Arrays.
 * @internal
 */
function sparseFacadeWithIndex<T extends TypedArray>(dense: T, index: SparseIndex): SparseFacade<T> {
  /** @returns the entity's value from the dense array or undefined if non-existent */
  const get = (entity: number): number | undefined => {
    const idx = index.get(entity);
    return idx === undefined ? undefined : dense[idx];
  };

  /** @throws {TypeError} if entity is not a valid integer */
  /** @throws {RangeError} if entity is out of bounds or dense array is full */
  const set = (entity: number, value: number): true => {
    const idx = index.ensure(entity);
    dense[idx] = value;
    return true;
  };

  const dispose = () => {
    index.clear();
    return true;
  };

  /** @returns `false` for invalid entity IDs, `true` otherwise */
  const deleteProperty = (entity: number): boolean => {
    if (entity === NOT_PRESENT) return dispose();
    return index.delete(entity);
  };

  return new Proxy(dense, {
    get: (target: T, key: string | symbol, _receiver: unknown) => {
      if (key === "dense") return target;
      if (key === "getEntity") return get;
      if (key === "setEntity") {
        return (entity: number, value: number): void => {
          set(entity, value);
        };
      }
      if (key === "deleteEntity") return (entity: number): boolean => index.delete(entity);
      if (key === "clearSparse") {
        return (): void => {
          index.clear();
        };
      }
      if (typeof key === "string") {
        const num = Number(key);
        if (!isNaN(num) && Number.isInteger(num) && num >= 0) {
          return get(num);
        }
      }
      const value = Reflect.get(target, key, target);
      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },
    set: (_target: T, key: string | symbol, value: number) => {
      if (typeof key !== "string") {
        throw new TypeError(`Property key must be a string, got ${typeof key}`);
      }
      const num = Number(key);
      if (isNaN(num) || !Number.isInteger(num)) {
        throw new TypeError(`Property key must be an integer, got "${key}"`);
      }
      if (num < 0) {
        throw new RangeError(`Entity index must be non-negative, got ${num}`);
      }
      return set(num, value);
    },
    deleteProperty: (_target: T, key: string | symbol) => {
      if (key === "-1") return deleteProperty(NOT_PRESENT);
      if (typeof key !== "string") return false;
      const num = Number(key);
      if (isNaN(num) || !Number.isInteger(num) || num < 0) return false;
      return deleteProperty(num);
    },
  }) as SparseFacade<T>;
}
