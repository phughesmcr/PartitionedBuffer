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
 * @param dense the typed array to apply the facade to
 * @returns A proxy to the dense array
 * @note Use `delete facade[-1]` to dispose of the facade and zero out the dense array
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
    get: (_target: T, key: string | symbol) => get(Number(key) as number),
    set: (_target: T, key: string | symbol, value: number) => set(Number(key) as number, value),
    deleteProperty: (_target: T, key: string | symbol) => deleteProperty(Number(key) as number),
  }) as SparseFacade<T>;
}
