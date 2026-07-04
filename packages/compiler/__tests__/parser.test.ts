import { describe, it, expect } from "vitest";
import { Parser } from "../parser.js";

describe("Parser", () => {
  it("parses an app file", () => {
    const source = `
APP MyApp
NAME "My Application"
VERSION 1.0.0
DESCRIPTION "Test app"
`;
    const parser = new Parser(source, "app.flow");
    const result = parser.detectAndParse();
    
    expect(result.diagnostics).toHaveLength(0);
    expect(result.type).toBe("app");
    if (result.type === "app") {
      expect(result.node.name).toBe("MyApp");
      expect(result.node.displayName).toBe("My Application");
      expect(result.node.version).toBe("1.0.0");
      expect(result.node.description).toBe("Test app");
    }
  });

  it("parses a schema file", () => {
    const source = `
ENTITY User
  id : String
  tags : List<String>
`;
    const parser = new Parser(source, "schema.flow");
    const result = parser.detectAndParse();
    
    expect(result.diagnostics).toHaveLength(0);
    expect(result.type).toBe("schema");
    if (result.type === "schema") {
      expect(result.nodes).toHaveLength(1);
      const entity = result.nodes[0]!;
      expect(entity.name).toBe("User");
      expect(entity.fields).toHaveLength(2);
      expect(entity.fields[0]?.name).toBe("id");
      expect(entity.fields[0]?.type.name).toBe("String");
      expect(entity.fields[1]?.name).toBe("tags");
      expect(entity.fields[1]?.type.name).toBe("List");
      expect(entity.fields[1]?.type.typeArgument?.name).toBe("String");
    }
  });

  it("parses an action file", () => {
    const source = `
ACTION get_user
  DESC "Get a user"
  INPUT
    id : String REQUIRED
  OUTPUT User
  ENDPOINT GET /users/{id}
`;
    const parser = new Parser(source, "actions.flow");
    const result = parser.detectAndParse();
    
    expect(result.diagnostics).toHaveLength(0);
    expect(result.type).toBe("actions");
    if (result.type === "actions") {
      expect(result.nodes).toHaveLength(1);
      const action = result.nodes[0]!;
      expect(action.name).toBe("get_user");
      expect(action.description).toBe("Get a user");
      expect(action.inputs).toHaveLength(1);
      expect(action.inputs[0]?.name).toBe("id");
      expect(action.inputs[0]?.required).toBe(true);
      expect(action.output.name).toBe("User");
      expect(action.endpoint.method).toBe("GET");
      expect(action.endpoint.path).toBe("/users/{id}");
    }
  });
});
