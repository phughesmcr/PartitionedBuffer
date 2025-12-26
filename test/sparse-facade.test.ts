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

Deno.test("SparseFacade - Zero-allocation mode with maxEntityId", () => {
  const dense = new Float32Array(4);
  // Create zero-allocation facade with maxEntityId = 100
  const sparse = sparseFacade(dense, 100);

  // Test writing within maxEntityId bounds
  sparse[10] = 1.5;
  sparse[50] = 2.5;
  sparse[100] = 3.5; // At the boundary

  assertEquals(sparse[10], 1.5);
  assertEquals(sparse[50], 2.5);
  assertEquals(sparse[100], 3.5);

  // Test entity ID outside maxEntityId bounds fails
  try {
    sparse[101] = 4.5; // Beyond maxEntityId
    assertEquals(false, true, "Should have thrown");
  } catch (error) {
    assertEquals(error instanceof TypeError, true);
  }
  assertEquals(sparse[101], undefined);

  // Test deletion works correctly
  const deleted = delete sparse[50];
  assertEquals(deleted, true);
  assertEquals(sparse[50], undefined);

  // Verify we can reuse the slot
  sparse[75] = 5.5;
  assertEquals(sparse[75], 5.5);

  // Test disposal
  const disposed = delete sparse[-1];
  assertEquals(disposed, true);
  assertEquals(sparse[10], undefined);
  assertEquals(sparse[100], undefined);
  assertEquals(Array.from(dense), [0, 0, 0, 0]);
});

Deno.test("SparseFacade - Zero-allocation mode validation", () => {
  // Invalid maxEntityId (negative)
  assertThrows(
    () => sparseFacade(new Int32Array(4), -1),
    Error,
    "maxEntityId must be a non-negative safe integer",
  );

  // Invalid maxEntityId (non-integer)
  assertThrows(
    () => sparseFacade(new Int32Array(4), 1.5),
    Error,
    "maxEntityId must be a non-negative safe integer",
  );
});

Deno.test("SparseFacade - Zero-allocation mode with maxEntityId = 0", () => {
  const dense = new Int32Array(4);
  const sparse = sparseFacade(dense, 0); // Only entity ID 0 is valid

  // Entity 0 should work
  sparse[0] = 42;
  assertEquals(sparse[0], 42);

  // Entity 1 should fail (beyond maxEntityId)
  try {
    sparse[1] = 100;
    assertEquals(false, true, "Should have thrown");
  } catch (error) {
    assertEquals(error instanceof TypeError, true);
  }
  assertEquals(sparse[1], undefined);

  // Cleanup works
  const disposed = delete sparse[-1];
  assertEquals(disposed, true);
  assertEquals(sparse[0], undefined);
});

Deno.test("SparseFacade - Zero-allocation pool exhaustion", () => {
  const dense = new Int32Array(2); // Only 2 slots
  const sparse = sparseFacade(dense, 1000); // maxEntityId much larger than pool

  // Fill both slots
  sparse[100] = 1;
  sparse[500] = 2;

  // Third entity should fail (pool exhausted, not maxEntityId limit)
  try {
    sparse[750] = 3;
    assertEquals(false, true, "Should have thrown");
  } catch (error) {
    assertEquals(error instanceof TypeError, true);
  }

  // Delete one to free slot
  const deleted = delete sparse[100];
  assertEquals(deleted, true);

  // Now we can add another
  sparse[750] = 3;
  assertEquals(sparse[750], 3);
});

Deno.test("SparseFacade - Zero-allocation slot reuse", () => {
  const dense = new Int32Array(4);
  const sparse = sparseFacade(dense, 100);

  // Fill all slots
  sparse[10] = 1;
  sparse[20] = 2;
  sparse[30] = 3;
  sparse[40] = 4;

  // Delete middle entries
  delete sparse[20];
  delete sparse[30];

  // Reuse freed slots with different entity IDs
  sparse[50] = 5;
  sparse[60] = 6;

  assertEquals(sparse[10], 1);
  assertEquals(sparse[40], 4);
  assertEquals(sparse[50], 5);
  assertEquals(sparse[60], 6);
  assertEquals(sparse[20], undefined);
  assertEquals(sparse[30], undefined);
});

Deno.test("SparseFacade - Zero-allocation maintains correct entity mapping", () => {
  // Use Int32Array to avoid float precision issues in tests
  const dense = new Int32Array(3);
  const sparse = sparseFacade(dense, 1000);

  // Set values for different entities
  sparse[100] = 11;
  sparse[500] = 55;
  sparse[999] = 99;

  // Verify correct mapping
  assertEquals(sparse[100], 11);
  assertEquals(sparse[500], 55);
  assertEquals(sparse[999], 99);

  // Non-existent entity
  assertEquals(sparse[750], undefined);

  // Update existing entity
  sparse[500] = 555;
  assertEquals(sparse[500], 555);

  // Other mappings unchanged
  assertEquals(sparse[100], 11);
  assertEquals(sparse[999], 99);
});

Deno.test("SparseFacade - Compare Map vs Zero-allocation behavior", () => {
  // Map-based (no maxEntityId)
  const denseMap = new Int32Array(4);
  const sparseMap = sparseFacade(denseMap);

  // Zero-allocation (with maxEntityId)
  const denseZero = new Int32Array(4);
  const sparseZero = sparseFacade(denseZero, 1000);

  // Both should behave the same for valid operations
  sparseMap[100] = 42;
  sparseZero[100] = 42;
  assertEquals(sparseMap[100], sparseZero[100]);

  // Both handle updates
  sparseMap[100] = 84;
  sparseZero[100] = 84;
  assertEquals(sparseMap[100], sparseZero[100]);

  // Both handle deletion
  delete sparseMap[100];
  delete sparseZero[100];
  assertEquals(sparseMap[100], sparseZero[100]); // Both undefined

  // Map-based allows larger entity IDs
  sparseMap[50000] = 999;
  assertEquals(sparseMap[50000], 999);

  // Zero-allocation rejects entity IDs beyond maxEntityId
  try {
    sparseZero[50000] = 999; // Beyond maxEntityId of 1000
    assertEquals(false, true, "Should have thrown");
  } catch {
    // Expected
  }
});
