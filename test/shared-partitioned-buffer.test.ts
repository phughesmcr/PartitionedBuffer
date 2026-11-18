/// <reference lib="deno.window" />

import { assertEquals, assertThrows } from "jsr:@std/assert@^1.0.9";
import {
  type BufferLayout,
  createPartitionViews,
  getPartitionByteSize,
  PartitionedBuffer,
  type Schema,
  SharedPartitionedBuffer,
} from "../mod.ts";

type Vec2 = { x: number; y: number };
type Value = { value: number };
const vec2: Schema<Vec2> = { x: Float32Array, y: Float32Array };

const workerUrl = new URL("./fixtures/shared.worker.ts", import.meta.url);
// Loading a worker module needs read permission for the repository: `deno task ci` grants it with --allow-read=.
const canLoadWorker = Deno.permissions.querySync({ name: "read", path: new URL("../", import.meta.url) }).state ===
  "granted";

Deno.test("SharedPartitionedBuffer - columns are views over a SharedArrayBuffer", () => {
  assertEquals(SharedPartitionedBuffer.isSupported(), true);
  const shared = new SharedPartitionedBuffer(1024, 16);
  const position = shared.addPartition<Vec2>({ name: "position", schema: vec2 });

  assertEquals(shared.buffer instanceof SharedArrayBuffer, true);
  assertEquals(shared.byteLength, 1024);
  assertEquals(position.partitions.x.buffer, shared.buffer);
  assertEquals(position.byteLength, getPartitionByteSize(vec2, 16));
  assertEquals(shared.getFreeSpace(), 1024 - position.byteLength);
  assertEquals(shared.getOffset(), position.byteLength);

  position.set("x", 3, 1.5);
  assertEquals(new Float32Array(shared.buffer, position.partitions.x.byteOffset, 16)[3], 1.5);
});

Deno.test("SharedPartitionedBuffer - reports and rejects a runtime without SharedArrayBuffer", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "SharedArrayBuffer")!;
  delete (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer;
  try {
    assertEquals(SharedPartitionedBuffer.isSupported(), false);
    assertThrows(() => new SharedPartitionedBuffer(64, 8), TypeError, "cross-origin isolated");
  } finally {
    Object.defineProperty(globalThis, "SharedArrayBuffer", descriptor);
  }
  assertEquals(SharedPartitionedBuffer.isSupported(), true);
});

Deno.test("SharedPartitionedBuffer - mirrors the PartitionedBuffer API and layout", () => {
  const plain = new PartitionedBuffer(1024, 16);
  const shared = new SharedPartitionedBuffer(1024, 16);
  for (const buffer of [plain, shared]) {
    buffer.addPartition<Vec2>({ name: "position", schema: vec2 });
    buffer.addPartition({ name: "alive" });
    buffer.addPartition<Value>({ name: "sparse", schema: { value: [Int16Array, 7] }, maxOwners: 4, maxEntityId: 99 });
  }

  assertEquals(shared.getLayout().partitions, plain.getLayout().partitions);
  assertEquals(shared.getOffset(), plain.getOffset());
  assertEquals(shared.hasPartition("alive"), true);
  assertEquals(shared.getPartition("alive"), null);
  assertEquals(shared.getPartition<Value>("sparse")?.get("value", 5), undefined);
  shared.getPartition<Value>("sparse")?.set("value", 5, 9);
  assertEquals(shared.getPartition<Value>("sparse")?.get("value", 5), 9);
  assertThrows(() => shared.addPartition<Vec2>({ name: "position", schema: vec2 }), Error, "already exists");
  assertThrows(() => new SharedPartitionedBuffer(100, 16), SyntaxError, "multiple");
  assertEquals(SharedPartitionedBuffer.MIN_ALIGNMENT, PartitionedBuffer.MIN_ALIGNMENT);
});

Deno.test("SharedPartitionedBuffer - clear zeros memory and resets the layout", () => {
  const shared = new SharedPartitionedBuffer(256, 16);
  const position = shared.addPartition<Vec2>({ name: "position", schema: { x: [Float32Array, 4], y: Float32Array } });
  const views = createPartitionViews(shared.buffer, shared.getLayout());

  shared.clear();
  assertEquals(views["position"]!["x"]![0], 0);
  assertEquals(position.partitions.x[0], 0);
  assertEquals(shared.getLayout().partitions, []);
  assertEquals(shared.getFreeSpace(), 256);
});

Deno.test("getLayout - describes columns as structured-cloneable plain data", () => {
  const buffer = new PartitionedBuffer(512, 16);
  buffer.addPartition({ name: "tag" });
  const mixed = buffer.addPartition<{ a: number; b: number }>({
    name: "mixed",
    schema: { a: Uint8Array, b: [Float64Array, 1] },
  });
  buffer.addPartition<Value>({ name: "half", schema: { value: Float16Array }, maxOwners: 9 });

  const layout = buffer.getLayout();
  assertEquals(layout, {
    byteLength: 512,
    maxEntitiesPerPartition: 16,
    partitions: [
      {
        name: "mixed",
        mode: "dense",
        byteOffset: 0,
        byteLength: 144,
        rowCount: 16,
        columns: [
          { name: "a", type: "Uint8Array", byteOffset: 0, length: 16 },
          { name: "b", type: "Float64Array", byteOffset: 16, length: 16 },
        ],
      },
      {
        name: "half",
        mode: "sparse",
        byteOffset: 144,
        byteLength: 24,
        rowCount: 9,
        columns: [{ name: "value", type: "Float16Array", byteOffset: 144, length: 9 }],
      },
    ],
  });
  assertEquals(layout.partitions[0]?.columns[1]?.byteOffset, mixed.partitions.b.byteOffset);
  assertEquals(structuredClone(layout), layout);

  // The snapshot is a copy: mutating it does not change the buffer's layout.
  layout.partitions[0]!.columns.length = 0;
  assertEquals(buffer.getLayout().partitions[0]?.columns.length, 2);
});

Deno.test("addPartition - rejects constructor-like objects that are not built-in typed arrays", () => {
  const Fake = Object.assign(function Fake(): void {}, { BYTES_PER_ELEMENT: 4 }) as unknown as Float32ArrayConstructor;
  const buffer = new SharedPartitionedBuffer(256, 16);
  buffer.addPartition<Value>({ name: "real", schema: { value: Uint8Array } });
  const offset = buffer.getOffset();
  assertThrows(() => buffer.addPartition<Value>({ name: "fake", schema: { value: Fake } }), Error, "Failed to create");
  assertEquals(buffer.hasPartition("fake"), false);
  assertEquals(buffer.getOffset(), offset);
  assertEquals(buffer.getLayout().partitions.map((p) => p.name), ["real"]);
});

Deno.test("createPartitionViews - rebuilds dense views and skips sparse partitions by default", () => {
  const shared = new SharedPartitionedBuffer(512, 16);
  const position = shared.addPartition<Vec2>({ name: "position", schema: vec2 });
  const sparse = shared.addPartition<Value>({ name: "sparse", schema: { value: Uint32Array }, maxOwners: 8 });
  sparse.set("value", 1000, 77);

  const views = createPartitionViews(shared.buffer, shared.getLayout());
  assertEquals(Object.keys(views), ["position"]);
  views["position"]!["y"]![2] = 5;
  assertEquals(position.partitions.y[2], 5);
  assertEquals(views["position"]!["y"] instanceof Float32Array, true);

  const withSparse = createPartitionViews(shared.buffer, shared.getLayout(), { includeSparse: true });
  assertEquals(withSparse["sparse"]!["value"]![0], 77); // owner slot 0, not entity 1000
});

Deno.test("createPartitionViews - works on a copied ArrayBuffer", () => {
  const buffer = new PartitionedBuffer(256, 16);
  const position = buffer.addPartition<Vec2>({ name: "position", schema: vec2 });
  position.set("x", 1, 3.5);

  const copy = buffer.slice(0);
  const views = createPartitionViews(copy, buffer.getLayout());
  assertEquals(views["position"]!["x"]![1], 3.5);
});

Deno.test("createPartitionViews - rejects small buffers and unknown types", () => {
  const layout: BufferLayout = {
    byteLength: 64,
    maxEntitiesPerPartition: 8,
    partitions: [{
      name: "p",
      mode: "dense",
      byteOffset: 0,
      byteLength: 32,
      rowCount: 8,
      columns: [{ name: "v", type: "Float32Array", byteOffset: 0, length: 8 }],
    }],
  };
  assertThrows(() => createPartitionViews(new ArrayBuffer(32), layout), RangeError, "smaller");

  const bad = structuredClone(layout);
  (bad.partitions[0]!.columns[0] as { type: string }).type = "BigInt64Array";
  assertThrows(() => createPartitionViews(new ArrayBuffer(64), bad), TypeError, "Unsupported");
  (bad.partitions[0]!.columns[0] as { type: string }).type = "constructor";
  assertThrows(() => createPartitionViews(new ArrayBuffer(64), bad), TypeError, "Unsupported");
});

Deno.test({
  name: "SharedPartitionedBuffer - a Deno Worker writes columns the main thread reads",
  ignore: !canLoadWorker,
  fn: async (): Promise<void> => {
    const shared = new SharedPartitionedBuffer(1024, 16);
    const position = shared.addPartition<Vec2>({ name: "position", schema: vec2 });
    const health = shared.addPartition<Value>({ name: "health", schema: { value: [Float16Array, 100] } });
    const sparse = shared.addPartition<Value>({ name: "sparse", schema: { value: Uint8Array }, maxOwners: 8 });
    sparse.set("value", 3, 42);

    const worker = new Worker(workerUrl, { type: "module" });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const reply = await new Promise<{ sparseViewed: boolean; partitions: string[] }>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("worker timed out")), 10_000);
        worker.onmessage = (event) => resolve(event.data);
        worker.onerror = (event) => {
          event.preventDefault();
          reject(new Error(`worker failed: ${event.message}`));
        };
        worker.postMessage({ buffer: shared.buffer, layout: shared.getLayout() });
      });

      assertEquals(reply, { sparseViewed: false, partitions: ["position", "health"] });
      for (let i = 0; i < 16; i++) {
        assertEquals(position.partitions.x[i], i * 2);
        assertEquals(position.partitions.y[i], -i);
        assertEquals(health.partitions.value[i], Math.f16round(i + 0.1));
      }
      assertEquals(sparse.get("value", 3), 42);
    } finally {
      clearTimeout(timer);
      worker.terminate();
    }
  },
});
