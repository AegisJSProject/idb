<!-- markdownlint-disable -->
# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [v1.0.5] - 2025-12-03

### Added
- Add `putAllItems()` to `put()` multiple items in a single transaction

## [v1.0.4] - 2025-03-27

### Added
- Add support for querying using `IDBKeyRange` and optional `indexName`

## [v1.0.3] - 2025-01-24

### Added
- Add `fallback` option for `getItem()`
- Add maintenance `createStore()` and `deleteStore()` functions

### Changed
- Support both updating DB schema and handling `onUpgrade` when opening a DB

### Fixed
- `reject()` in `handleIDBRequest()` if a `signal` aborts

## [v1.0.2] - 2025-01-23

### Added
- Add support for a db schema instead of `onUpgrade` handler

## [v1.0.1] - 2025-01-23

### Added
- Add async iterator of object stores using `IDBCursorWithValue`

## [v1.0.0] - 2025-01-21

Initial Release
