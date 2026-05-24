/**
 * @module      layout
 * @description Canonical SoA column layout and entity stride sizing for schemas.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 */

import type { Schema, SchemaProperty, SchemaSpec } from "./Schema.ts";
import type { TypedArrayConstructor } from "./utils.ts";

/** Minimum alignment in bytes for TypedArrays */
export const MIN_ALIGNMENT = 8 as const;

/** Maximum safe column size to prevent allocation errors */
export const MAX_PARTITION_SIZE = 1073741824 as const; // 1GB

export type ColumnDescriptor = {
  name: string;
  bytesPerElement: number;
  alignment: number;
  length: number;
  byteOffset: number;
  byteLength: number;
};

function schemaConstructor(value: SchemaProperty): TypedArrayConstructor {
  return Array.isArray(value) ? value[0] : value;
}

function columnAlignment(bytesPerElement: number): number {
  return Math.max(bytesPerElement, MIN_ALIGNMENT);
}

function assertPositiveSafeRowCount(rowCount: number): void {
  if (!Number.isSafeInteger(rowCount) || rowCount <= 0) {
    throw new RangeError("rowCount must be a positive safe integer");
  }
}

/**
 * Align an offset within a buffer to the given alignment (power of 2).
 * @returns the aligned offset
 */
export function alignOffset(offset: number, alignment: number, bufferByteLength: number): number {
  alignment = Math.max(alignment, MIN_ALIGNMENT);
  if ((alignment & (alignment - 1)) !== 0) {
    throw new RangeError(`Alignment must be a power of 2, got ${alignment}`);
  }

  const remainder = offset % alignment;
  const aligned = remainder === 0 ? offset : offset + alignment - remainder;
  if (aligned < offset || aligned > Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Alignment calculation overflow");
  }
  if (aligned > bufferByteLength) {
    throw new RangeError("Insufficient space for alignment");
  }
  return aligned;
}

/**
 * Per-entity stride: sum of `BYTES_PER_ELEMENT` with no inter-field padding (SoA).
 */
export function getEntityStride<T extends SchemaSpec<T>>(schema: Schema<T>): number {
  let stride = 0;
  for (const value of Object.values(schema)) {
    const Ctr = schemaConstructor(value as SchemaProperty);
    stride += Ctr.BYTES_PER_ELEMENT;
  }
  return stride;
}

/**
 * Per-entity stride in bytes (sum of column element sizes, no inter-field padding).
 * @param schema the schema to measure
 */
export function getEntitySize<T extends SchemaSpec<T>>(schema: Schema<T>): number {
  return getEntityStride(schema);
}

export type ColumnLayoutResult = {
  byteLength: number;
  columns: ColumnDescriptor[];
};

/**
 * SoA column layout for a schema block: one TypedArray per property with inter-column alignment.
 */
export function columnLayout<T extends SchemaSpec<T>>(
  schema: Schema<T>,
  rowCount: number,
): ColumnLayoutResult {
  assertPositiveSafeRowCount(rowCount);

  let alignedSize = 0;
  let lastAlignment: number = MIN_ALIGNMENT;
  const columns: ColumnDescriptor[] = [];

  for (const [name, value] of Object.entries(schema)) {
    const Ctr = schemaConstructor(value as SchemaProperty);
    const bytesPerElement = Ctr.BYTES_PER_ELEMENT;
    const alignment = columnAlignment(bytesPerElement);
    const byteLength = rowCount * bytesPerElement;

    if (byteLength > MAX_PARTITION_SIZE) {
      throw new RangeError(
        `Partition property "${name}" size (${byteLength} bytes) exceeds maximum allowed (${MAX_PARTITION_SIZE} bytes)`,
      );
    }

    lastAlignment = Math.max(lastAlignment, alignment);

    const remainder = alignedSize % alignment;
    const byteOffset = remainder === 0 ? alignedSize : alignedSize + alignment - remainder;
    if (byteOffset < alignedSize || byteOffset > Number.MAX_SAFE_INTEGER - byteLength) {
      throw new RangeError(`Schema size calculation overflow at property "${name}"`);
    }

    columns.push({
      name,
      bytesPerElement,
      alignment,
      length: rowCount,
      byteOffset,
      byteLength,
    });

    alignedSize = byteOffset + byteLength;
  }

  const remainder = alignedSize % lastAlignment;
  const finalSize = remainder === 0 ? alignedSize : alignedSize + lastAlignment - remainder;
  if (finalSize < alignedSize) {
    throw new RangeError("Final size alignment overflow");
  }

  return { byteLength: finalSize, columns };
}

/**
 * Total bytes for one partition block (SoA columns + inter-column alignment).
 */
export function getPartitionByteSize<T extends SchemaSpec<T>>(
  schema: Schema<T>,
  rowCount: number,
): number {
  if (!schema || Object.keys(schema).length === 0) return 0;
  return columnLayout(schema, rowCount).byteLength;
}
