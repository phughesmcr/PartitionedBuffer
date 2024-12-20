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

/**
 * Internal schema data storage
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
export const isSchema = (schema: unknown): schema is Schema<SchemaSpec<unknown> | null> => {
  try {
    if (!schema || !isObject(schema)) {
      return false;
    }
    const entries = Object.entries(schema) as [string, SchemaProperty][];
    if (!entries.length) {
      return false;
    }
    return entries.every(isValidSchemaEntry);
  } catch (_) {
    return false;
  }
};

/**
 * @internal
 * Utility function to add a typed array's bytes per element to a total
 * @see calculateSchemaSize
 */
const byteSum = (total: unknown, value: unknown): number => {
  const size = Array.isArray(value)
    ? (value[0] as TypedArray).BYTES_PER_ELEMENT
    : (value as TypedArray).BYTES_PER_ELEMENT;
  return (total as number) + size;
};

/**
 * @returns the required size in bytes for a component's storage for one entity, or `NaN` if the object is invalid;
 */
export const getSchemaSize = (schema: Schema<SchemaSpec<unknown> | null>): number => {
  if (!schema) {
    return 0;
  }
  if (!isSchema(schema)) {
    return Number.NaN;
  }
  return Object.values(schema).reduce(byteSum, 0) as number;
};
