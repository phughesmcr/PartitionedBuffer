/**
 * @module      manifest
 * @description Plain-data layout manifests and view reconstruction for sharing buffers between threads.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 */

import type { TypedArray, TypedArrayConstructor } from "./utils.ts";

/** The `name` of each typed-array constructor a schema can use. */
export type TypedArrayName =
  | "Int8Array"
  | "Uint8Array"
  | "Uint8ClampedArray"
  | "Int16Array"
  | "Uint16Array"
  | "Int32Array"
  | "Uint32Array"
  | "Float16Array"
  | "Float32Array"
  | "Float64Array";

/** One schema property's typed-array column within a buffer. */
export type ColumnLayout = {
  /** The schema property name */
  name: string;
  /** The typed-array constructor name, e.g. `"Float32Array"` */
  type: TypedArrayName;
  /** Byte offset of the column from the start of the buffer */
  byteOffset: number;
  /** Number of elements in the column */
  length: number;
};

/** The column layout of one partition with storage. */
export type PartitionLayout = {
  /** The partition name */
  name: string;
  /**
   * `"dense"` columns are indexed by slot. `"sparse"` columns hold `rowCount` owner slots, and the
   * entity-to-slot index lives on the JavaScript heap of the thread that created the buffer.
   */
  mode: "dense" | "sparse";
  /** Byte offset of the partition's first column from the start of the buffer */
  byteOffset: number;
  /** Bytes used by the partition, including alignment padding */
  byteLength: number;
  /** Elements per column: `maxEntitiesPerPartition` when dense, `maxOwners` when sparse */
  rowCount: number;
  /** The partition's columns, in schema order */
  columns: ColumnLayout[];
};

/**
 * A structured-cloneable description of every partition with storage in a buffer.
 *
 * Send it to a worker with the buffer's memory to rebuild the same typed-array views there
 * with `createPartitionViews`. Tag partitions (no schema) have no storage and are not listed.
 */
export type BufferLayout = {
  /** The byte length of the buffer the layout was taken from */
  byteLength: number;
  /** Rows per dense partition */
  maxEntitiesPerPartition: number;
  /** Partitions with storage, in allocation order */
  partitions: PartitionLayout[];
};

/** Typed-array views rebuilt from a `BufferLayout`, keyed by partition name and then property name. */
export type PartitionViews = Record<string, Record<string, TypedArray>>;

/** Options for `createPartitionViews`. */
export type CreatePartitionViewsOptions = {
  /**
   * Also create views for sparse partitions (default `false`).
   *
   * Sparse views are indexed by owner slot, not entity ID, because the entity-to-slot index is not
   * stored in the buffer.
   */
  includeSparse?: boolean;
};

const TYPED_ARRAY_NAMES: ReadonlySet<string> = new Set<TypedArrayName>([
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float16Array",
  "Float32Array",
  "Float64Array",
]);

function resolveConstructor(name: string): TypedArrayConstructor {
  const Ctr = TYPED_ARRAY_NAMES.has(name) ? (globalThis as Record<string, unknown>)[name] : undefined;
  if (typeof Ctr !== "function") {
    throw new TypeError(`Unsupported typed-array type "${name}" in buffer layout`);
  }
  return Ctr as TypedArrayConstructor;
}

/**
 * Rebuild typed-array views over a buffer from its `BufferLayout`.
 *
 * Use it in a worker that received a `SharedPartitionedBuffer`'s `buffer` and `getLayout()`.
 * The views share memory with the original partitions, so writes on one thread are visible on the other
 * after the threads synchronise (for example with `postMessage` or `Atomics.wait`/`Atomics.notify`).
 *
 * Pass a type argument to name the expected partitions and columns. It is not checked at runtime.
 *
 * @typeParam V the expected shape of the views
 * @param buffer the memory the layout describes, usually a `SharedArrayBuffer`
 * @param layout the layout from `getLayout()`
 * @param options set `includeSparse` to also view sparse partitions by owner slot
 * @returns views keyed by partition name and then property name
 * @throws {RangeError} if the buffer is smaller than the layout's `byteLength`
 * @throws {TypeError} if a column type is unknown or not available in this runtime
 *
 * @example
 * ```ts
 * // worker.ts
 * import { type BufferLayout, createPartitionViews } from "@phughesmcr/partitionedbuffer";
 *
 * type Views = { position: { x: Float32Array; y: Float32Array } };
 *
 * self.onmessage = (event: MessageEvent<{ buffer: SharedArrayBuffer; layout: BufferLayout }>) => {
 *   const { position } = createPartitionViews<Views>(event.data.buffer, event.data.layout);
 *   for (let i = 0; i < position.x.length; i++) position.x[i] = position.y[i]! * 2;
 *   self.postMessage("done");
 * };
 * ```
 */
export function createPartitionViews<V extends PartitionViews = PartitionViews>(
  buffer: ArrayBufferLike,
  layout: BufferLayout,
  options: CreatePartitionViewsOptions = {},
): V {
  if (buffer.byteLength < layout.byteLength) {
    throw new RangeError(
      `Buffer byteLength (${buffer.byteLength}) is smaller than the layout byteLength (${layout.byteLength})`,
    );
  }
  const views: PartitionViews = {};
  for (const partition of layout.partitions) {
    if (partition.mode === "sparse" && !options.includeSparse) continue;
    const columns: Record<string, TypedArray> = {};
    for (const column of partition.columns) {
      const Ctr = resolveConstructor(column.type);
      // The constructor union only types an ArrayBuffer overload; every typed array also accepts a SharedArrayBuffer.
      columns[column.name] = new Ctr(buffer as ArrayBuffer, column.byteOffset, column.length);
    }
    views[partition.name] = columns;
  }
  return views as V;
}
