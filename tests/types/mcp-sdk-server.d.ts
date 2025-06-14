/**
 * Type declarations for @microsoft/mcp-sdk-server
 * Used for testing purposes
 */
declare module '@microsoft/mcp-sdk-server' {
  export enum ErrorCode {
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams = -32602,
    InternalError = -32603,
    ParseError = -32700,
  }

  export class McpError extends Error {
    constructor(code: ErrorCode, message: string);
    readonly code: ErrorCode;
  }

  export function mcpRequest(
    method: string,
    schema: any,
    handler: Function
  ): { request: (params: any) => Promise<any> };
}
