/**
 * @module      PartitionedBuffer
 * @description A convenient way to manage a data in ArrayBuffers.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 */

import { Partition, type PartitionSpec } from "./src/Partition.ts";
import { PartitionedBuffer } from "./src/PartitionedBuffer.ts";
import { getSchemaSize, isSchema, type Schema, type SchemaStorage } from "./src/Schema.ts";
import { isValidName, type TypedArray, type TypedArrayConstructor } from "./src/utils.ts";

/**
 * Partition is a convenient way to define an object in a PartitionedBuffer.
 * PartitionedBuffer is a convenient way to manage a data in ArrayBuffers.
 */
export { getSchemaSize, isSchema, isValidName, Partition, PartitionedBuffer };
export type { PartitionSpec, Schema, SchemaStorage, TypedArray, TypedArrayConstructor };
