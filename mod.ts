/**
 * @module      PartitionedBuffer
 * @description A convenient way to manage a data in ArrayBuffers.
 * @copyright   2024 the PartitionedBuffer authors. All rights reserved.
 * @license     MIT
 */

import { PartitionedBuffer } from "./src/PartitionedBuffer.ts";
import type { Schema } from "./src/Schema.ts";

/**
 * PartitionedBuffer is a fast pool of single bits backed by a Uint32Array.
 */
export { PartitionedBuffer };
export type { Schema };
