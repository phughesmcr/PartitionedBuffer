# Changelog

All notable changes to this project are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Earlier releases are recorded in the git tags.

## [Unreleased]

### Added

- `Float16Array` columns. `TypedArray` and `TypedArrayConstructor` now include `Float16Array` and
  `Float16ArrayConstructor`, and the `[Float16Array, initialValue]` tuple form is validated: the initial value must be
  finite and within ±65504. Stored values round as `Math.f16round` does.

### Notes

- TypeScript consumers need a `lib` that declares `Float16Array` (`es2025`, `esnext`, or later), because the exported
  `TypedArray` union now references it. Runtimes without `Float16Array` are unaffected unless they use it in a schema.

## [0.4.1] - 2026-05-24

See the `v0.4.1` tag.
