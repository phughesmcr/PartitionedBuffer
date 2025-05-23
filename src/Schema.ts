/**
 * @module      Schema
 * @description A schema is a component storage definition.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 */

import {
  isObject,
  isTypedArrayConstructor,
  isValidName,
  isValidTypedArrayValue,
  type TypedArray,
  type TypedArrayConstructor,
} from "./utils.ts";

/** Minimum alignment in bytes for TypedArrays */
const MIN_ALIGNMENT = 8;

/**
 * Storage convenience object
 */
export type SchemaStorage<T> = {
  byteOffset: number;
  byteLength: number;
  partitions: Record<keyof T, TypedArray>;
};

/**
 * Schema property definition
 *
 * A schema property is either a TypedArrayConstructor or
 * an array where the 0th index is a TypedArrayConstructor and the 1st index is
 * a default value to initialise the array to.
 *
 * @example { x: Float32Array, y: Float32Array }
 * @example { x: [Float32Array, 100], y: [Float32Array, 100] }
 * @see Schema
 */
export type SchemaProperty = TypedArrayConstructor | [TypedArrayConstructor, number];

/**
 * A schema definition is a plain object where each property is a number
 *
 * It defines what input data is valid for each schema property.
 *
 * @example ```
 * type Vec2 = { x: number, y: number }; // the schema definition
 * const positionSchema: Schema<Vec2> = { x: Float32Array, y: Float32Array }; // works
 * ```
 */
export type SchemaSpec<T> = {
  [K in keyof T]: T[K];
};

/**
 * Schemas are component storage definitions.
 *
 * Schemas use TypedArray objects and so can only store a single number per property per entity.
 *
 * Values in TypedArrays are initialised to 0 by default.
 *
 * To set an initial value: `{ property: [Int8Array, defaultValue] }`.
 *
 * @example ```
 *  type Vec2 = { x: number, y: number };
 *  const positionSchema: Schema<Vec2> = { x: Float32Array, y: Float32Array };
 * ```
 *
 * @example ```
 *  type Vec2 = { x: number, y: number };
 *  const positionSchema: Schema<Vec2> = { x: [Float32Array, 100], y: [Float32Array, 100] };
 * ```
 */
export type Schema<T extends SchemaSpec<T>> = {
  [K in keyof T]: SchemaProperty;
};

/**
 * @internal
 * Validates the names and values of a schema's entries
 */
const isValidSchemaEntry = (prop: [string, SchemaProperty]): boolean => {
  const [name, value] = prop;
  if (!isValidName(name)) {
    return false;
  }
  if (!Array.isArray(value)) {
    return isTypedArrayConstructor(value);
  }
  // if this is an array, the user wants to set an initial value
  const [arrayConstructor, n] = value as [TypedArrayConstructor, number];
  return isTypedArrayConstructor(arrayConstructor) && isValidTypedArrayValue(arrayConstructor, n);
};

/**
 * @public
 * Schema type guard
 * @param schema the object to test
 */
export const isSchema = (schema: unknown): schema is Schema<SchemaSpec<any>> | null => {
  if (schema === null) return true; // Explicitly handle null schemas
  try {
    if (!isObject(schema)) return false;
    const entries = Object.entries(schema) as [string, SchemaProperty][];
    if (!entries.length) return false;
    return entries.every(isValidSchemaEntry);
  } catch (_) {
    return false;
  }
};

/**
 * Calculate the aligned size of a single entity in bytes
 * @param schema the schema to calculate the size of
 * @returns the size in bytes for one entity
 */
export function getEntitySize<T extends SchemaSpec<T>>(schema: Schema<T>): number {
  if (!schema || !isSchema(schema)) return Number.NaN;

  let size = 0;
  let maxAlignment = 1;
  const schemaEntries = Object.entries(schema);

  if (schemaEntries.length === 0) return 0;

  // First pass: find maximum alignment requirement
  for (const [name, value] of schemaEntries) {
    const Ctr = Array.isArray(value) ? value[0] : value;
    const alignment = Math.max(Ctr.BYTES_PER_ELEMENT, MIN_ALIGNMENT);

    // Validate alignment is power of 2
    if ((alignment & (alignment - 1)) !== 0) {
      throw new Error(`Invalid alignment ${alignment} for property "${name}"`);
    }

    maxAlignment = Math.max(maxAlignment, alignment);
  }

  // Second pass: calculate aligned size
  for (const [name, value] of schemaEntries) {
    const Ctr = Array.isArray(value) ? value[0] : value;
    const alignment = Math.max(Ctr.BYTES_PER_ELEMENT, MIN_ALIGNMENT);
    const bytes = Ctr.BYTES_PER_ELEMENT;

    // Align current offset
    const alignedOffset = (size + alignment - 1) & ~(alignment - 1);

    // Check for overflow
    if (alignedOffset < size || alignedOffset > Number.MAX_SAFE_INTEGER - bytes) {
      throw new Error(`Size calculation overflow at property "${name}"`);
    }

    size = alignedOffset + bytes;
  }

  // Align final size
  const finalSize = (size + maxAlignment - 1) & ~(maxAlignment - 1);
  if (finalSize < size) {
    throw new Error("Final size alignment overflow");
  }

  return finalSize;
}
