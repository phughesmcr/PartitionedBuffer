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

/**
 * A Sparse Facade is a proxy to a dense TypedArray that allows for sparse storage of values.
 *
 * The SparseFacade maintains a mapping between entity IDs and dense array indices, allowing
 * efficient sparse storage while keeping the underlying memory dense for cache performance.
 *
 * @param dense the typed array to apply the facade to
 * @returns A proxy to the dense array that supports sparse operations
 *
 * @example
 * ```typescript
 * const dense = new Float32Array(100);
 * const sparse = sparseFacade(dense);
 *
 * // Set values for specific entities
 * sparse[42] = 3.14;
 * sparse[1337] = 2.71;
 *
 * // Access values
 * console.log(sparse[42]);   // 3.14
 * console.log(sparse[999]);  // undefined (not set)
 *
 * // Delete specific entities
 * delete sparse[42];  // Removes entity 42
 *
 * // Dispose of the entire facade and zero out the dense array
 * delete sparse[-1];  // Magic disposal - clears all mappings and zeros dense array
 * ```
 *
 * @note **Disposal Methods:**
 * - `delete facade[-1]` - Magic disposal that clears all sparse mappings and zeros the dense array
 * - Use `disposeSparseArray(facade)` helper function for clearer intent
 * - Use `zeroArray(facade)` to dispose and zero in one operation
 */
export function sparseFacade<T extends TypedArray>(dense: T): SparseFacade<T> {
  if (dense.length === 0) {
    throw new Error("Cannot create SparseFacade with zero-length array");
  } else if (dense.length > 2 ** 31 - 1) {
    throw new Error("Array length exceeds maximum safe BitPool size");
  }

  /** Map<ID, Dense Array Index> */
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
    sparse.set(entity, idx); // the entity's index in the sparse array
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
      // Ensure methods like fill() receive the underlying typed array as receiver
      return Reflect.get(target, key, target);
    },
    set: (_target: T, key: string | symbol, value: number) => {
      // For non-numeric or invalid properties, return false to trigger throwing in strict mode
      if (typeof key !== "string") return false;
      const num = Number(key);
      if (isNaN(num) || !Number.isInteger(num) || num < 0) return false;
      return set(num, value);
    },
    deleteProperty: (_target: T, key: string | symbol) => {
      // Special case: -1 is the disposal key
      if (key === "-1") return deleteProperty(-1);
      // For non-numeric or invalid properties, return false to trigger throwing in strict mode
      if (typeof key !== "string") return false;
      const num = Number(key);
      if (isNaN(num) || !Number.isInteger(num) || num < 0) return false;
      return deleteProperty(num);
    },
  }) as SparseFacade<T>;
}
