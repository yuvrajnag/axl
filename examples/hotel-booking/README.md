# Hotel Booking Reference Implementation

This directory contains a complete, production-ready example of an AXL project. It demonstrates how to build a robust backend for a hotel booking system using AXL's declarative `.flow` language.

## Features Demonstrated

- **Authentication**: Usage of `public: true` for unauthenticated routes vs strict authentication by default.
- **Role-based Permissions**: Usage of `@hasRole(user, 'admin')` for administrative actions.
- **OTP Confirmations**: Usage of `confirm: true` to require two-factor authentication before a sensitive action (like cancelling a booking or processing a refund) completes.
- **Complex Workflows**: Multi-step state machines for booking a room (reserve, process payment, confirm).
- **Data Binding**: Passing values between workflow steps explicitly using the `bind` directive.

## Project Structure

- `axl.config.json` - Configuration file defining paths.
- `flow/` - The source directory for `.flow` files.
  - `entities.flow` - Data models (User, Hotel, Room, Booking).
  - `auth.flow` - Public login and registration actions.
  - `booking.flow` - Protected booking actions.
  - `admin.flow` - Admin-only management actions.
  - `workflows.flow` - Complex state machines combining actions.

## Running the Example

Assuming you have installed the AXL CLI globally:

1. **Compile the project**:
   ```bash
   axl compile
   ```

2. **Serve the project (REST + MCP)**:
   ```bash
   axl serve --both
   ```

3. **Make requests**:
   Your server is now running on `http://localhost:3960`. 
   You can connect an AI agent using the MCP protocol, or use standard REST calls.
