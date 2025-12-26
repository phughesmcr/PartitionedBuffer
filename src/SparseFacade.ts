/**
 * @module      SparseFacade
 * @description A SparseFacade is a proxy to a dense TypedArray that allows for sparse storage of values.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 */

import { BitPool } from "@phughesmcr/bitpool";
import type { TypedArray } from "./utils.ts";

/** A SparseFacade is a wrapper around a dense TypedArray that allows for sparse storage of values. */
export type SparseFacade<T extends TypedArray> = T;

/** Sentinel value indicating an entity is not present in the sparse mapping */
const NOT_PRESENT = -1;

/**
 * A Sparse Facade is a proxy to a dense TypedArray that allows for sparse storage of values.
 *
 * The SparseFacade maintains a mapping between entity IDs and dense array indices, allowing
 * efficient sparse storage while keeping the underlying memory dense for cache performance.
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
  maxEntityId?: number,
): SparseFacade<T> {
  if (dense.length === 0) {
    throw new Error("Cannot create SparseFacade with zero-length array");
  } else if (dense.length > 2 ** 31 - 1) {
    throw new Error("Array length exceeds maximum safe BitPool size");
  }

  // Use zero-allocation mode when maxEntityId is provided
  if (maxEntityId !== undefined) {
    if (!Number.isSafeInteger(maxEntityId) || maxEntityId < 0) {
      throw new Error("maxEntityId must be a non-negative safe integer");
    }
    return sparseFacadeZeroAlloc(dense, maxEntityId);
  }

  // Fall back to Map-based implementation for arbitrary entity IDs
  return sparseFacadeMap(dense);
}

/**
 * Zero-allocation SparseFacade implementation using pre-allocated Int32Arrays.
 * @internal
 */
function sparseFacadeZeroAlloc<T extends TypedArray>(
  dense: T,
  maxEntityId: number,
): SparseFacade<T> {
  /** Pre-allocated sparse array: entityId -> denseIndex (NOT_PRESENT = not stored) */
  const sparse = new Int32Array(maxEntityId + 1);
  sparse.fill(NOT_PRESENT);

  /** Pre-allocated dense-to-entity mapping: denseIndex -> entityId */
  const denseToEntity = new Int32Array(dense.length);
  denseToEntity.fill(NOT_PRESENT);

  /** BitPool for tracking available dense indices - uses zero-allocation iteration */
  const available = new BitPool(dense.length);

  /** @returns the entity's value from the dense array or undefined if non-existent */
  const get = (entity: number): number | undefined => {
    if (entity < 0 || entity > maxEntityId) return undefined;
    const idx = sparse[entity] as number;
    return idx === NOT_PRESENT ? undefined : dense[idx];
  };

  /** @returns `false` if dense array is full, entity out of bounds, or error; `true` if set successfully */
  const set = (entity: number, value: number): boolean => {
    if (entity < 0 || !Number.isSafeInteger(entity) || entity > maxEntityId) return false;

    let idx = sparse[entity] as number; // Safe: entity is already bounds-checked
    if (idx === NOT_PRESENT) {
      idx = available.acquire();
      if (idx === NOT_PRESENT) return false; // Pool exhausted
      sparse[entity] = idx;
      denseToEntity[idx] = entity;
    }
    dense[idx] = value;
    return true;
  };

  const dispose = () => {
    sparse.fill(NOT_PRESENT);
    denseToEntity.fill(NOT_PRESENT);
    available.clear();
    dense.fill(0);
    return true;
  };

  /** @returns `false` if the entity isn't stored, `true` if deleted successfully */
  const deleteProperty = (entity: number): boolean => {
    if (entity === NOT_PRESENT) return dispose();
    if (entity < 0 || !Number.isSafeInteger(entity) || entity > maxEntityId) return false;

    const idx = sparse[entity] as number; // Safe: entity is already bounds-checked
    if (idx === NOT_PRESENT) return false;

    dense[idx] = 0;
    sparse[entity] = NOT_PRESENT;
    denseToEntity[idx] = NOT_PRESENT;
    available.release(idx);
    return true;
  };

  return new Proxy(dense, {
    get: (target: T, key: string | symbol, _receiver: unknown) => {
      if (typeof key === "string") {
        const num = Number(key);
        if (!isNaN(num) && Number.isInteger(num) && num >= 0) {
          return get(num);
        }
      }
      return Reflect.get(target, key, target);
    },
    set: (_target: T, key: string | symbol, value: number) => {
      if (typeof key !== "string") return false;
      const num = Number(key);
      if (isNaN(num) || !Number.isInteger(num) || num < 0) return false;
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

/**
 * Map-based SparseFacade implementation for arbitrary entity IDs.
 * Note: This allocates on first insertion of each new entity ID.
 * @internal
 */
function sparseFacadeMap<T extends TypedArray>(dense: T): SparseFacade<T> {
  /** Map<ID, Dense Array Index> - allocates on new insertions */
  const sparse = new Map<number, number>();

  /** Array of available indexes in dense */
  const available = new BitPool(dense.length);

  /** @returns the entity's value from the dense array or undefined if non-existent */
  const get = (entity: number): number | undefined => {
    const idx = sparse.get(entity);
    return idx === undefined ? undefined : dense[idx];
  };

  /** @returns `false` if dense array is full or error, `true` if value set successfully */
  const set = (entity: number, value: number): boolean => {
    if (isNaN(entity) || entity < 0 || !Number.isSafeInteger(entity)) return false;
    const idx = sparse.get(entity) ?? available.acquire();
    if (idx === -1) return false;
    dense[idx] = value;
    sparse.set(entity, idx);
    return true;
  };

  const dispose = () => {
    sparse.clear();
    available.clear();
    dense.fill(0);
    return true;
  };

  /** @returns `false` if the entity isn't already stored, `true` if deleted successfully */
  const deleteProperty = (entity: number): boolean => {
    if (entity === -1) return dispose();
    if (isNaN(entity) || entity < 0 || !Number.isSafeInteger(entity)) return false;
    const idx = sparse.get(entity);
    if (idx === undefined) return false;

    dense[idx] = 0;
    sparse.delete(entity);
    available.release(idx);
    return true;
  };

  return new Proxy(dense, {
    get: (target: T, key: string | symbol, _receiver: unknown) => {
      if (typeof key === "string") {
        const num = Number(key);
        if (!isNaN(num) && Number.isInteger(num) && num >= 0) {
          return get(num);
        }
      }
      return Reflect.get(target, key, target);
    },
    set: (_target: T, key: string | symbol, value: number) => {
      if (typeof key !== "string") return false;
      const num = Number(key);
      if (isNaN(num) || !Number.isInteger(num) || num < 0) return false;
      return set(num, value);
    },
    deleteProperty: (_target: T, key: string | symbol) => {
      if (key === "-1") return deleteProperty(-1);
      if (typeof key !== "string") return false;
      const num = Number(key);
      if (isNaN(num) || !Number.isInteger(num) || num < 0) return false;
      return deleteProperty(num);
    },
  }) as SparseFacade<T>;
}
