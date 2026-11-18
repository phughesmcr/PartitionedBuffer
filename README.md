# PartitionedBuffer

Named typed-array storage in one ArrayBuffer, with dense and sparse entity access.

[![JSR](https://jsr.io/badges/@phughesmcr/partitionedbuffer)](https://jsr.io/@phughesmcr/partitionedbuffer)
[![MIT license](https://badgen.net/badge/license/MIT/blue)](LICENSE)

PartitionedBuffer extends `ArrayBuffer`. Each schema property gets its own typed-array column over the same buffer
(a structure-of-arrays layout). Use it for entity/component storage, particle systems, and simulations where you want
to choose numeric types and allocate storage up front.

- Dense partitions expose typed-array views indexed by slot.
- Sparse partitions map entity IDs to a fixed number of stored owners.
- Schemas support mixed numeric types, including `Float16Array`, and initial values.
- Sizing helpers account for column alignment.
- `SharedPartitionedBuffer` puts the columns in a `SharedArrayBuffer` so workers can use them.

See the [API reference on JSR](https://jsr.io/@phughesmcr/partitionedbuffer/doc) for all exported classes, types and helpers.

## Installation

### Node

```bash
npx jsr add @phughesmcr/partitionedbuffer
```

### Deno

```bash
deno add jsr:@phughesmcr/partitionedbuffer
```

### Bun

```bash
bunx jsr add @phughesmcr/partitionedbuffer
```

After installation, use the same package import in each runtime. See [JSR's installation guide](https://jsr.io/docs/using-packages)
for other package managers.

## Quick start

This example allocates 1,024 bytes and reserves 64 slots per dense partition. The two `Float32Array` columns use 512 bytes.

```ts
import { PartitionedBuffer, type Schema } from "@phughesmcr/partitionedbuffer";

type Vec2 = { x: number; y: number };
const schema: Schema<Vec2> = { x: Float32Array, y: Float32Array };
const buffer = new PartitionedBuffer(1024, 64);
const position = buffer.addPartition<Vec2>({ name: "position", schema });

// Direct typed-array access, or use position.set("x", 0, 1).
position.partitions.x[0] = 1;
position.partitions.y[0] = 2;

console.log(position.get("x", 0)); // 1
console.log(buffer.getFreeSpace()); // 512 bytes
```

## Column types

Schema properties can use any of these typed-array constructors: `Int8Array`,
`Uint8Array`, `Uint8ClampedArray`, `Int16Array`, `Uint16Array`, `Int32Array`,
`Uint32Array`, `Float16Array`, `Float32Array` and `Float64Array`. Use a
`[Constructor, initialValue]` tuple to fill a column with a starting value. The
initial value must be finite and in range for the type.

`Float16Array` columns use 2 bytes per entity and hold IEEE half-precision
values: about 3 significant decimal digits, a finite range of ±65504, and a
smallest normal value of about 6.1e-5. Values are rounded on write as
`Math.f16round` does, and finite values beyond the range become `±Infinity`.
`Float16Array` needs a runtime that provides it (Baseline 2025: Chrome 135+,
Firefox 129+, Safari 18.2+, Node 24+, and current Deno and Bun). TypeScript
users need a `lib` that declares it, such as `es2025` or `esnext`.

```ts
type Particle = { life: number };
const particles = buffer.addPartition<Particle>({
  name: "particles",
  schema: { life: [Float16Array, 1] },
});
```

## Dense and sparse partitions

By default, partition arrays are dense typed-array views. The index is the slot
inside the partition, and each schema property has `maxEntitiesPerPartition`
entries.

Set `maxOwners` when only some entity IDs can own a component and memory use is
more important than direct dense indexing. In that mode, bracket access uses
entity IDs while the backing storage remains dense. Continuing the quick start,
this partition uses another 256 bytes for up to 32 owners:

```ts
const sparsePosition = buffer.addPartition<Vec2>({
  name: "sparsePosition",
  schema,
  maxOwners: 32,
  maxEntityId: 9999,
});

sparsePosition.set("x", 42, 1);
sparsePosition.set("y", 42, 2);

console.log(sparsePosition.get("x", 42)); // 1
console.log(sparsePosition.get("x", 43)); // undefined (no owner)

delete sparsePosition.partitions.x[42]; // removes entity 42 from every field
```

When `maxEntityId` is provided with `maxOwners`, sparse mappings are backed by
pre-allocated arrays for bounded entity IDs. Without it, sparse mappings use a
Map and support non-negative safe integer entity IDs. Sparse index structures
are allocated separately from the buffer's numeric columns. `maxOwners` limits
the number of simultaneously stored entities; `maxEntityId` is the largest
allowed entity ID, inclusive.

## Sharing columns with workers

`SharedPartitionedBuffer` has the same partition API as `PartitionedBuffer`,
but its columns are views over a `SharedArrayBuffer` in its `buffer` property.
It does not extend `ArrayBuffer`. Send `buffer` and the plain-data layout from
`getLayout()` to a worker, and rebuild the views there with
`createPartitionViews`:

```ts
// main.ts
import { SharedPartitionedBuffer } from "@phughesmcr/partitionedbuffer";

type Vec2 = { x: number; y: number };
const shared = new SharedPartitionedBuffer(1024, 64);
const position = shared.addPartition<Vec2>({
  name: "position",
  schema: { x: Float32Array, y: Float32Array },
});

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
worker.onmessage = () => console.log(position.partitions.x[1]); // 2
worker.postMessage({ buffer: shared.buffer, layout: shared.getLayout() });
```

```ts
// worker.ts
import { type BufferLayout, createPartitionViews } from "@phughesmcr/partitionedbuffer";

// Names the partitions and columns this worker expects; it is not checked at runtime.
type Views = { position: { x: Float32Array; y: Float32Array } };

self.onmessage = (event: MessageEvent<{ buffer: SharedArrayBuffer; layout: BufferLayout }>) => {
  const { position } = createPartitionViews<Views>(event.data.buffer, event.data.layout);
  for (let i = 0; i < position.x.length; i++) position.x[i] = i * 2;
  self.postMessage("done");
};
```

The layout lists each partition with storage: its name, `mode` (`"dense"` or
`"sparse"`), `byteOffset`, `byteLength`, `rowCount`, and each column's name,
typed-array `type` name, `byteOffset` and `length`. It is a snapshot, so send a
new one after adding partitions. `PartitionedBuffer` has `getLayout()` too, for
rebuilding views over a copy of its bytes.

Limits:

- Browsers expose `SharedArrayBuffer` only on cross-origin isolated pages
  (`Cross-Origin-Opener-Policy: same-origin` plus
  `Cross-Origin-Embedder-Policy: require-corp` or `credentialless`). Check
  `SharedPartitionedBuffer.isSupported()` and fall back to `PartitionedBuffer`.
  Importing the package is safe either way.
- Only numeric columns are shared. A sparse partition's entity-to-slot index
  stays on the thread that created it, so `createPartitionViews` skips sparse
  partitions unless you pass `{ includeSparse: true }`, and then indexes them
  by owner slot, not entity ID.
- Call `addPartition` and `clear` only while no other thread is using the
  memory. Other threads' views are not updated.
- Typed-array writes are not atomic. Give each thread its own rows or columns,
  and synchronise with `postMessage` or `Atomics` before reading another
  thread's writes. `Atomics` works on the `Int32Array` columns.
- The buffer has a fixed size; it is not growable.

## Sizing and lifecycle

`new PartitionedBuffer(byteLength, maxEntitiesPerPartition)` requires a positive
Uint32 byte length divisible by the slot count, which must be at least eight.
The buffer has fixed capacity; adding a partition throws if there is not enough
space. Each typed-array column starts at an offset aligned to at least eight bytes.

These helpers are exported from `@phughesmcr/partitionedbuffer`:

- `getEntitySize(schema)` — the sum of each property's `BYTES_PER_ELEMENT`.
  This is the logical size per entity, without alignment padding.
- `getPartitionByteSize(schema, rowCount)` — bytes for one partition's numeric
  columns, including alignment padding. Use the dense slot count or sparse
  `maxOwners` as `rowCount`; sparse index allocations are separate.

Calling `buffer.clear()` zeros the stored arrays and removes partition
registrations from the buffer. Existing partition handles are no longer
registered with the buffer; retrieve new handles after adding partitions again.

## Examples and development

From a clone of this repository:

```bash
deno task example # Animated ASCII fireworks; Ctrl+C to stop
deno run example/PartitionedBuffer.example.ts # Five-second particle simulation
deno task ci # Format, lint, type-check, test and check API documentation
```

## Contributing

Contributions are welcome. Run `deno task ci` before submitting a pull request.
See [CONTRIBUTING.md](CONTRIBUTING.md) for guidance.

## License

PartitionedBuffer is released under the [MIT license](LICENSE).

&copy; 2024 The PartitionedBuffer Authors. All rights reserved.

See `AUTHORS.md` for author details.
