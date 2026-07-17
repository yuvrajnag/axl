# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Discovery Endpoints**: `GET /.well-known/axl` and `GET /manifest.json` now expose server
  capabilities, active transports, and manifest location for AI client discovery (Thunderstrike, etc.).
- **REST Transport Adapter**: AXL now natively mounts standard REST API routes (`/actions`, `/workflows`, `/confirm`) directly alongside the MCP transport.
- **Backend Adapter Extraction**: The core backend execution engine was successfully extracted to `src/backend-adapter.js` to ensure the core execution model remains transport agnostic.
- **CLI Options**: Added `--rest` and `--both` flags to `axl serve` to seamlessly expose the REST API alongside MCP endpoints.
- **Documentation Overhaul**: Added `docs/installation.md`, `docs/quickstart.md`, `AGENT.md`, and modernized the `README.md` to be an open-source landing page.

### Changed
- Standardized CLI output format and improved command descriptions for a more polished developer experience.

### Fixed
- Fixed an issue where a global `express.json()` middleware accidentally broke the MCP `StreamableHTTPServerTransport` by consuming the stream body early.
