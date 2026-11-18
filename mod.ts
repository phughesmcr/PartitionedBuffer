/**
 * @description Named typed-array storage in one ArrayBuffer, with dense and sparse entity access.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 * @module      PartitionedBuffer
 */

import {
  Partition,
  type PartitionMeta,
  type PartitionSchema,
  type PartitionSpec,
  type PartitionStorage,
} from "./src/Partition.ts";
import {
  type BufferLayout,
  type ColumnLayout,
  createPartitionViews,
  type CreatePartitionViewsOptions,
  type PartitionLayout,
  type PartitionViews,
  type TypedArrayName,
} from "./src/manifest.ts";
import { PartitionedBuffer } from "./src/PartitionedBuffer.ts";
import {
  getEntitySize,
  getPartitionByteSize,
  isSchema,
  type Schema,
  type SchemaProperty,
  type SchemaSpec,
  type SchemaStorage,
} from "./src/Schema.ts";
import { SharedPartitionedBuffer } from "./src/SharedPartitionedBuffer.ts";
import { isValidName, type TypedArray, type TypedArrayConstructor } from "./src/utils.ts";

/**
 * Partition is a convenient way to define an object in a PartitionedBuffer.
 * PartitionedBuffer stores named typed-array columns in one ArrayBuffer.
 * SharedPartitionedBuffer stores them in one SharedArrayBuffer that workers can view with createPartitionViews.
 */
export {
  createPartitionViews,
  getEntitySize,
  getPartitionByteSize,
  isSchema,
  isValidName,
  Partition,
  PartitionedBuffer,
  SharedPartitionedBuffer,
};
export type {
  BufferLayout,
  ColumnLayout,
  CreatePartitionViewsOptions,
  PartitionLayout,
  PartitionMeta,
  PartitionSchema,
  PartitionSpec,
  PartitionStorage,
  PartitionViews,
  Schema,
  SchemaProperty,
  SchemaSpec,
  SchemaStorage,
  TypedArray,
  TypedArrayConstructor,
  TypedArrayName,
};
