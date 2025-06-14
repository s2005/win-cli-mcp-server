/**
 * Type declarations for @microsoft/mcp-sdk-server
 */

declare module '@microsoft/mcp-sdk-server' {
  export type McpRequestHandler = (params: any) => Promise<any>;
  
  export interface McpRequestFunction {
    (method: string, schema: any, handler: McpRequestHandler): { request: (params?: any) => Promise<any> };
  }

  export const mcpRequest: McpRequestFunction;
  
  export class McpError extends Error {
    constructor(code: number, message: string);
    code: number;
  }
  
  export enum ErrorCode {
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams = -32602
  }
}
