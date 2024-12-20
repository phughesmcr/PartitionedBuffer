/**
 * @module      Partition
 * @description A partition is a component storage interface.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 */

import type { Schema, SchemaSpec, SchemaStorage } from "./Schema.ts";

/**
 * Partition specification
 *
 * A partition is a component storage interface.
 *
 * @example ```
 * // A schema:
 * type Vec2 = { x: number, y: number };
 * const partition: PartitionSpec<Vec2> = { name: "position", schema: { x: Float32Array, y: Float32Array } };
 * ```
 *
 * @example ```
 * // A tag:
 * const partition: PartitionSpec<null> = { name: "isAlive" };
 * ```
 *
 * @example ```
 * // A tag with a maximum number of owners:
 * const partition: PartitionSpec<null> = { name: "isSpecial", maxOwners: 100 };
 * ```
 */
export type PartitionSpec<T extends SchemaSpec<T> | null = null> =
  & (T extends SchemaSpec<infer U> ? {
      /** The component's property definitions */
      schema: Schema<U>;
    }
    : {
      /** No schema for tag components */
      schema?: null;
    })
  & {
    /**
     * The maximum number of entities able to equip this component per world.
     *
     * __Warning__: use this only where memory use is a concern, performance will be worse.
     */
    maxOwners?: number | null;

    /** The component's label */
    name: string;
  };

/**
 * Internal partition data storage
 */
export type PartitionStorage<T extends SchemaSpec<T> | null> = T extends SchemaSpec<infer U> ? SchemaStorage<U> : null;
