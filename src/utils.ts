/** @returns `true` if ```typeof n === 'number'``` */
export const isNumber = (n: unknown): n is number => typeof n === "number";

/** @returns `true` if n is a number, >= 0, <= 2^32 - 1 (4294967295) and is an integer*/
export const isUint32 = (n: number): n is number => {
  return Number.isSafeInteger(n) && n >= 0 && n <= 4294967295;
};

/** @returns true if `n` is a Uint32 > 0 */
export const isPositiveUint32 = (n: number): n is number => isUint32(n) && n > 0;

/** All the various kinds of typed arrays */
export type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

/** All the various kinds of typed array constructors */
export type TypedArrayConstructor =
  | Int8ArrayConstructor
  | Uint8ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Int16ArrayConstructor
  | Uint16ArrayConstructor
  | Int32ArrayConstructor
  | Uint32ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor;

/** An array of strings that cannot be used for component or schema property names */
export const FORBIDDEN_NAMES: Set<string> = new Set([
  // partition properties:
  "isTag",
  "maxEntities",
  "name",
  "schema",
  "size",
  // object getters/setters used in `SparseFacade`:
  "deleteProperty",
  "get",
  "set",
  // object prototype properties (`Object.getOwnPropertyNames(Object.getPrototypeOf({}))`):
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "__proto__",
  "constructor",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "prototype",
  "toLocaleString",
  "toString",
  "valueOf",
]);

/** Valid string name characters */
export const VALID_NAME_PATTERN: RegExp = /^(?![0-9])[a-zA-Z0-9$_]+$/;

/**
 * Test if a string is a valid name / label
 *
 * Valid names are string between 1 and 255 characters,
 * which match the `VALID_NAME_PATTERN` regex,
 * and is not in the `FORBIDDEN_NAMES` set.
 *
 * @param str the string to test
 * @returns `true` if the string is a valid name / label
 */
export const isValidName = (str: string): boolean => {
  if (typeof str !== "string") return false;
  const trimmed = str.trim();
  return trimmed.length > 0 &&
    trimmed.length <= 255 &&
    !FORBIDDEN_NAMES.has(trimmed) &&
    VALID_NAME_PATTERN.test(trimmed);
};

/**
 * Test if an object is a valid Record
 * @param object the object to test
 * @returns `true` if the object is a valid Record
 */
export const isObject = <T extends Record<string, unknown>>(object: unknown): object is T => {
  return (object !== null && typeof object === "object" && !Array.isArray(object));
};

/**
 * Test if a number is between two values
 * @param value the value to test
 * @param min the minimum value
 * @param max the maximum value
 * @param inclusive (defaults to true) test if the number is greater/less than **or equal to** the min/max
 * @returns true if the value is between the min and max values
 */
export const isNumberBetween = (value: number, min: number, max: number, inclusive = true): boolean => {
  if (inclusive) return value >= min && value <= max;
  return value > min && value < max;
};

/**
 * @param object the object to test
 * @param key the key to test
 * @returns `true` if the object has the given key
 */
export const hasOwnProperty = <T>(object: T, key: PropertyKey): key is keyof T => {
  if (object == null) return false; // Handle null and undefined
  return Object.prototype.hasOwnProperty.call(object, key);
};

/**
 * Test if an object is a typed array and not a dataview
 * @param object the object to test
 * @returns `true` if the object is a typed array and not a dataview
 */
export const isTypedArray = <T extends TypedArray>(object: unknown): object is T => {
  return (ArrayBuffer.isView(object) && !(object instanceof DataView));
};

/**
 * Test if an object is a typed array constructor (e.g., `Uint8Array`)
 * @param object the object to test
 * @returns `true` if the object is a typed array constructor
 */
export const isTypedArrayConstructor = <T extends TypedArrayConstructor>(
  object: unknown,
): object is T => {
  return (typeof object === "function" && hasOwnProperty(object, "BYTES_PER_ELEMENT"));
};

/**
 * Test if a value is valid for a given TypedArrayConstructor's min/max values
 * @param constructor the typed array constructor
 * @param value the value to test
 * @returns `true` if the value is valid for the given typed array constructor
 */
export const isValidTypedArrayValue = (
  constructor: TypedArrayConstructor,
  value: number,
): boolean => {
  if (!constructor || isNaN(value)) return false;
  switch (constructor.name) {
    case "Int8Array":
      return Number.isSafeInteger(value) && isNumberBetween(value, -128, 127);
    case "Uint8Array":
    case "Uint8ClampedArray":
      return Number.isSafeInteger(value) && isNumberBetween(value, 0, 255);
    case "Int16Array":
      return Number.isSafeInteger(value) && isNumberBetween(value, -32768, 32767);
    case "Uint16Array":
      return Number.isSafeInteger(value) && isNumberBetween(value, 0, 65535);
    case "Int32Array":
      return Number.isSafeInteger(value) && isNumberBetween(value, -2147483648, 2147483647);
    case "Uint32Array":
      return Number.isSafeInteger(value) && isNumberBetween(value, 0, 4294967295);
    case "Float32Array":
    case "Float64Array":
      return true;
    default:
      return false;
  }
};

/**
 * Dispose of a SparseFacade and clear its sparse mappings.
 *
 * This function provides a clearer alternative to the magic `delete array[-1]` syntax
 * for disposing of SparseFacade arrays. For regular TypedArrays, this function has no effect.
 *
 * @param array the array to dispose (SparseFacade or regular TypedArray)
 *
 * @example
 * ```typescript
 * const dense = new Float32Array(100);
 * const sparse = sparseFacade(dense);
 *
 * // Method 1: Magic deletion
 * delete sparse[-1];
 *
 * // Method 2: Helper function (clearer intent)
 * disposeSparseArray(sparse);
 * ```
 */
export function disposeSparseArray<T extends TypedArray>(array: T): void {
  // deno-lint-ignore no-explicit-any
  delete (array as any)[-1];
}

/**
 * Zero out a typed array.
 *
 * For SparseFacade arrays, this also disposes the sparse mapping by calling the
 * internal disposal mechanism which zeroes the underlying dense array.
 * For regular TypedArrays, this simply fills the array with zeros.
 *
 * @param array the array to zero out
 * @returns the zeroed array
 *
 * @example
 * ```typescript
 * // For regular arrays
 * const regular = new Float32Array([1, 2, 3]);
 * zeroArray(regular); // [0, 0, 0]
 *
 * // For SparseFacade arrays (disposes and zeros)
 * const sparse = sparseFacade(new Float32Array(100));
 * sparse[42] = 3.14;
 * zeroArray(sparse); // Disposes sparse mappings and zeros underlying array
 * ```
 */
export function zeroArray<T extends TypedArray>(array: T): T {
  // Try to get the underlying target if it's a proxy
  try {
    // deno-lint-ignore no-explicit-any
    delete (array as any)[-1]; // Dispose SparseFacade (which zeros) or no-op for regular arrays
    // If array.fill works without error, use it (handles both regular arrays and post-disposal proxies)
    array.fill(0);
  } catch (error) {
    // If fill() fails (shouldn't happen with our fix), the disposal already zeroed the underlying array
    if (!(error instanceof TypeError && error.message.includes("not a typed array"))) {
      throw error; // Re-throw unexpected errors
    }
  }
  return array;
}
