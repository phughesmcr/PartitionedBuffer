/**
 * @module      Partition
 * @description A partition is a component storage interface.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 */

import { getEntitySize, isSchema, type Schema, type SchemaSpec, type SchemaStorage } from "./Schema.ts";
import { isValidName } from "./utils.ts";

/**
 * Partition metadata
 */
export type PartitionMeta<T extends SchemaSpec<T> | null> = {
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
 * Partition schema
 * If T is null, the partition is a tag and no schema is defined or required.
 * If T is a SchemaSpec, the partition is a component and a schema value is required.
 */
export type PartitionSchema<T extends SchemaSpec<T> | null> = T extends SchemaSpec<infer U> ? {
    schema: Schema<U>;
  }
  : {
    schema?: null;
  };

/**
 * Partition specification
 *
 * The partition creation instructions. Consisting of a PartitionMeta and a PartitionSchema object.
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
export type PartitionSpec<T extends SchemaSpec<T> | null = null> = PartitionSchema<T> & PartitionMeta<T>;

/**
 * Internal partition data storage
 */
export type PartitionStorage<T extends SchemaSpec<T> | null> = T extends SchemaSpec<infer U> ? SchemaStorage<U> : null;

/**
 * Typeguard for a partition specification
 * @param spec the partition specification
 * @returns `true` if the specification is valid
 */
export function isValidPartitionSpec<T extends SchemaSpec<T> | null>(spec: unknown): spec is PartitionSpec<T> {
  const { name, schema = null, maxOwners = null } = spec as PartitionSpec<T>;
  if (!isValidName(name)) return false;
  if (maxOwners !== null && (!Number.isSafeInteger(maxOwners) || maxOwners <= 0)) {
    throw new Error("maxOwners must be a positive integer or null");
  }
  if (schema && !isSchema(schema)) return false;
  return true;
}

/** Partition Class */
export class Partition<T extends SchemaSpec<T> | null = null> {
  /** The partition's label */
  readonly name: string;
  /** The partition's storage schema */
  readonly schema: T extends SchemaSpec<infer U> ? Schema<U> : null;
  /** The maximum number of entities able to equip this component per instance. */
  readonly maxOwners: number | null;
  /** The storage requirements of the schema in bytes for a single entity */
  readonly size: number;
  /** `true` if the partition is a tag */
  readonly isTag: T extends null ? true : false;

  /**
   * Create a new partition
   * @param spec the partition specification
   * @throws {SyntaxError} if the specification is invalid
   */
  constructor(spec: PartitionSpec<T>) {
    if (!isValidPartitionSpec(spec)) {
      throw new SyntaxError("Invalid partition specification.");
    }
    const { name, schema = null, maxOwners = null } = spec;
    this.name = name;
    this.schema = schema as T extends SchemaSpec<infer U> ? Schema<U> : null;
    this.maxOwners = maxOwners ?? null;
    this.size = schema ? getEntitySize(schema) : 0;
    this.isTag = (schema === null) as T extends null ? true : false;
  }
}
