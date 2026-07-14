# Contributing to AXL

We'd love your help in making AXL better! This document outlines how to contribute to the AXL Compiler, Engine, and CLI.

## Setup for Local Development

1. Fork and clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the test suite to ensure your environment is working:
   ```bash
   npx vitest run
   ```

## Contribution Guidelines

### 1. Stability First
AXL powers backend APIs and workflows. We prioritize stability, backward compatibility, and security above all else. Please do not introduce breaking architectural changes without prior discussion in an Issue.

### 2. Testing
Every new feature or bug fix must be accompanied by a test in the `test/` directory. If you are modifying the CLI, update the tests in `packages/cli/test/`. We maintain 100% pass rates on our test suite.

### 3. Pull Request Process
1. Ensure `npx vitest run` passes locally.
2. Update the `CHANGELOG.md` with your changes under the `[Unreleased]` section.
3. Submit your PR with a clear description of the problem solved or feature added.

Thank you for contributing!
