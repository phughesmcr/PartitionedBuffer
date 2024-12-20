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
 */
export function sparseFacade<T extends TypedArray>(dense: T): SparseFacade<T> {
  /** Map<ID, Dense Array Index> */
  const sparse = new Map<number, number>();

  /** Array of available indexes in dense */
  const available = new BitPool(dense.length);

  /** @returns the entity's value from the dense array or undefined if non-existent */
  const get = (entity: number): number | undefined => dense[sparse.get(entity) ?? -1];

  /** @returns `false` if dense array is full or error, `true` if value set successfully */
  const set = (entity: number, value: number): boolean => {
    if (entity < 0 || isNaN(entity) || !Number.isInteger(entity)) return false;
    const idx = sparse.get(entity) ?? available.acquire();
    if (idx === -1) return false;
    dense[idx] = value;
    sparse.set(entity, idx);
    return true;
  };

  /** @returns `false` if the entity isn't already stored, `true` if deleted successfully */
  const deleteProperty = (entity: number): boolean => {
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
