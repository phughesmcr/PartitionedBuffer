/// <reference lib="deno.worker" />

// Rebuilds the main thread's columns from a BufferLayout and writes known values into them.
import { type BufferLayout, createPartitionViews } from "../../mod.ts";

type Message = { buffer: SharedArrayBuffer; layout: BufferLayout };
type Views = { position: { x: Float32Array; y: Float32Array }; health: { value: Float16Array } };

self.onmessage = (event: MessageEvent<Message>) => {
  const { buffer, layout } = event.data;
  const views = createPartitionViews<Views>(buffer, layout);
  const { x, y } = views.position;
  const half = views.health.value;
  for (let i = 0; i < x.length; i++) {
    x[i] = i * 2;
    y[i] = -i;
    half[i] = i + 0.1;
  }
  self.postMessage({ sparseViewed: "sparse" in views, partitions: Object.keys(views) });
};
