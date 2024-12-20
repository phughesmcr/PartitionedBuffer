# PartitionedBuffer

A high-performance PartitionedBuffer implementation backed by Uint32Array for efficient memory usage and fast bitwise operations.

<p align="left">
  <img src="https://badgen.net/badge/license/MIT/blue" alt="MIT License" />
  <img src="https://badgen.net/badge/icon/typescript?icon=typescript&label" alt="Written in Typescript">
  <img src="https://img.shields.io/badge/deno-^2.1.0-lightgrey?logo=deno" alt="Deno version" />
  <img src="https://img.shields.io/badge/bun-%5E1.1.0-lightgrey?logo=bun" alt="Bun version" />
  <img src="https://img.shields.io/badge/node-%5E22.0.0-lightgrey?logo=node.js" alt="Node version" />
</p>

See [jsr.io/@phughesmcr/partitionedbuffer](https://jsr.io/@phughesmcr/partitionedbuffer) for complete documentation.

## Installation

### Node

```bash
npx jsr add @phughesmcr/partitionedbuffer
```

```ts
import { PartitionedBuffer } from "@phughesmcr/partitionedbuffer";
```

### Deno

```bash
deno add jsr:@phughesmcr/partitionedbuffer
```

```ts
import { PartitionedBuffer } from "@phughesmcr/partitionedbuffer";
```

### Bun

```bash
bunx jsr add @phughesmcr/partitionedbuffer
```

```ts
import { PartitionedBuffer } from "@phughesmcr/partitionedbuffer";
```

## Usage

`deno task example` will run a complete example.

```ts
// Create a buffer with 1024 bytes and 64 entities (slots) per partition
const buffer = new PartitionedBuffer(1024, 64);

type Vec2 = { x: number, y: number };
const schema: Schema<Vec2> = { x: Float32Array, y: Float32Array };

// Add a partition with a schema
const position = buffer.addPartition({ name: "position", schema });

// Set the first entity's x and y values
position.partitions.x[0] = 1;
position.partitions.y[0] = 2;
```

## Contributing

Contributions are welcome. The aim of the project is performance - both in terms of speed and GC allocation pressure.

Please run `deno test` and `deno task prep` to run the tests before committing.

## License

PartitionedBuffer is released under the MIT license. See `LICENSE` for further details.

&copy; 2024 The PartitionedBuffer Authors. All rights reserved.

See `AUTHORS.md` for author details.
