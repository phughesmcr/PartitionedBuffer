# Changelog

All notable changes to this project are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Earlier releases are recorded in the git tags.

## [Unreleased]

### Added

- `Float16Array` columns. `TypedArray` and `TypedArrayConstructor` now include `Float16Array` and
  `Float16ArrayConstructor`, and the `[Float16Array, initialValue]` tuple form is validated: the initial value must be
  finite and within ±65504. Stored values round as `Math.f16round` does.

- `SharedPartitionedBuffer`: the `PartitionedBuffer` partition API over a `SharedArrayBuffer` (its `buffer` property),
  so workers can read and write the same columns. `SharedPartitionedBuffer.isSupported()` reports whether
  `SharedArrayBuffer` is available. Importing the package stays safe where it is not (non-isolated browser pages).
- `getLayout()` on both buffer classes returns a structured-cloneable `BufferLayout` (partition name, mode, offsets,
  row count, and each column's name, typed-array type, byte offset and length).
- `createPartitionViews(buffer, layout, { includeSparse? })` rebuilds typed-array views from a `BufferLayout`, for use in
  a worker.
- New exported types: `BufferLayout`, `PartitionLayout`, `ColumnLayout`, `PartitionViews`,
  `CreatePartitionViewsOptions`, `TypedArrayName`.

### Changed

- `PartitionedBuffer` now delegates partition allocation to an internal allocator shared with
  `SharedPartitionedBuffer`. Its public API and behaviour are unchanged, and benchmarks match 0.4.1.
- `deno task ci` runs tests with `--allow-read=.` so the worker test can load its module. A bare `deno test` skips it.

### Notes

- TypeScript consumers need a `lib` that declares `Float16Array` (`es2025`, `esnext`, or later), because the exported
  `TypedArray` union now references it. Runtimes without `Float16Array` are unaffected unless they use it in a schema.
- Sparse partitions of a `SharedPartitionedBuffer` share only their numeric columns; the entity-to-slot index stays on
  the creating thread.

## [0.4.1] - 2026-05-24

See the `v0.4.1` tag.
