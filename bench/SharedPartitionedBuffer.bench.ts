/// <reference lib="deno.ns" />

import { createPartitionViews, PartitionedBuffer, type Schema, SharedPartitionedBuffer } from "../mod.ts";

type Vec2 = { x: number; y: number };
const schema: Schema<Vec2> = { x: Float32Array, y: Float32Array };
const ROWS = 16_384;
const SIZE = ROWS * 16;

for (
  const [label, Ctor] of [["ArrayBuffer", PartitionedBuffer], ["SharedArrayBuffer", SharedPartitionedBuffer]] as const
) {
  Deno.bench({
    name: `${label} - create buffer and add a Vec2 partition`,
    group: "create",
    baseline: Ctor === PartitionedBuffer,
    fn: () => {
      new Ctor(SIZE, ROWS).addPartition<Vec2>({ name: "position", schema });
    },
  });

  const { partitions: { x, y } } = new Ctor(SIZE, ROWS).addPartition<Vec2>({ name: "position", schema });
  Deno.bench({
    name: `${label} - integrate ${ROWS} Float32 rows`,
    group: "column access",
    baseline: Ctor === PartitionedBuffer,
    fn: () => {
      for (let i = 0; i < ROWS; i++) x[i]! += y[i]! * 0.016;
    },
  });
}

const shared = new SharedPartitionedBuffer(SIZE, ROWS);
shared.addPartition<Vec2>({ name: "position", schema });
const layout = shared.getLayout();
Deno.bench({
  name: "createPartitionViews - rebuild one Vec2 partition",
  fn: () => {
    createPartitionViews(shared.buffer, layout);
  },
});
