# MCP server plan

Status: deferred. `mcp/` remains a non-functional scaffold.

## Why deferred

Validation and derived-view logic still lives in the web workspace. Moving an MCP
server onto those web-only modules would duplicate rules or create a second
contract surface. Deletion is also an open product decision, so the scaffold
stays until the contract extraction in Phase 4.

## Target after Phase 4

If the product decides to keep MCP, expose read-only tools first:

- list canvases
- get a canvas document
- validate a canvas
- return a derived view

No write tools before the auth and tenant review. The server should reuse the
contract package rather than web code.

## Decision point

After Phase 4, choose one:

1. implement the read-only tools above, or
2. delete `mcp/` and its workspace scripts.
