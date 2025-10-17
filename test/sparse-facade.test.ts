// deno-lint-ignore-file no-explicit-any no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals, assertThrows } from "jsr:@std/assert@^1.0.9";
import { sparseFacade } from "../src/SparseFacade.ts";

Deno.test("SparseFacade - Disposal mechanism", () => {
  const dense = new Int32Array([1, 2, 3, 4]);
  const sparse = sparseFacade(dense);

  // Set some values
  sparse[10] = 42;
  sparse[20] = 84;

  // Verify values are set
  assertEquals(sparse[10], 42);
  assertEquals(sparse[20], 84);

  // Verify sparse values stored in dense array
  assertEquals(dense[0], 42);
  assertEquals(dense[1], 84);

  // Dispose using delete facade[-1]
  const disposed = delete sparse[-1];
  assertEquals(disposed, true);

  // Verify dense array is zeroed after disposal
  assertEquals(Array.from(dense), [0, 0, 0, 0]);

  // Verify sparse facade is cleared
  assertEquals(sparse[10], undefined);
  assertEquals(sparse[20], undefined);
});

Deno.test("SparseFacade - Proxy behavior edge cases", () => {
  const dense = new Int32Array(4);
  const sparse = sparseFacade(dense);

  // Test with invalid entity IDs
  assertEquals(sparse[-2], undefined);
  assertEquals(sparse[1.5] as any, undefined);
  assertEquals(sparse[NaN] as any, undefined);

  // Test setting invalid values
  try {
    sparse[-2] = 42;
    assertEquals(false, true, "Should have thrown");
  } catch (error) {
    assertEquals(error instanceof TypeError, true);
  }

  try {
    sparse[1.5] = 42;
    assertEquals(false, true, "Should have thrown");
  } catch (error) {
    assertEquals(error instanceof TypeError, true);
  }

  assertEquals(dense[0], 0);

  // Test deletion of non-existent entities
  try {
    delete sparse[999];
    assertEquals(false, true, "Should have thrown");
  } catch (error) {
    assertEquals(error instanceof TypeError, true);
  }

  try {
    delete sparse[-2];
    assertEquals(false, true, "Should have thrown");
  } catch (error) {
    assertEquals(error instanceof TypeError, true);
  }
});

Deno.test("SparseFacade - BitPool exhaustion", () => {
  const dense = new Int32Array(2);
  const sparse = sparseFacade(dense);

  // Fill all available slots
  sparse[1] = 10;
  sparse[2] = 20;

  // Try to add more
  try {
    sparse[3] = 30;
    assertEquals(false, true, "Should have thrown");
  } catch (error) {
    assertEquals(error instanceof TypeError, true);
  }

  assertEquals(sparse[3], undefined);

  // Verify the dense array is full
  assertEquals(dense[0] === 10 || dense[1] === 10, true);
  assertEquals(dense[0] === 20 || dense[1] === 20, true);
});

Deno.test("SparseFacade - Error conditions", () => {
  // Zero-length array
  assertThrows(
    () => sparseFacade(new Int32Array(0)),
    Error,
    "Cannot create SparseFacade with zero-length array",
  );
});
