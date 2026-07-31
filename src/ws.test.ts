import { describe, expect, test } from "bun:test"
import { shouldLogJsonRpcResponse } from "./ws.js"

describe("HTTP response logging", () => {
  test("does not duplicate a successful decompile response streamed through SSE", () => {
    expect(shouldLogJsonRpcResponse("decompile", {
      result: {
        structuredContent: {
          success: true,
          message: "swap success",
          data: { source: "class Demo {}" }
        }
      }
    })).toBe(false)
  })

  test("keeps decompile failures and other tool responses visible", () => {
    expect(shouldLogJsonRpcResponse("decompile", {
      result: {
        isError: true,
        structuredContent: { success: false, message: "decompile failed" }
      }
    })).toBe(true)

    expect(shouldLogJsonRpcResponse("outer_watch", {
      result: {
        structuredContent: { success: true, message: "swap success" }
      }
    })).toBe(true)
  })
})
