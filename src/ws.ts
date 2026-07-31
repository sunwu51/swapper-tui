export type ConnectionOptions = {
  url: string
  enabled: boolean
  onLog: (message: string) => void
  onStatusChange: (status: "connecting" | "connected" | "disconnected" | "error") => void
}

type LogMessage = {
  content?: string
  id?: string
  level?: number
  timestamp?: number
  type?: string
}

type JsonRpcResponse = {
  error?: {
    code?: number
    message?: string
  }
  result?: {
    isError?: boolean
    structuredContent?: {
      success?: boolean
      message?: string
      data?: unknown
    }
    content?: Array<{
      type?: string
      text?: string
    }>
  }
}

type JsonRpcRequest = {
  params?: {
    name?: string
  }
}

function formatLog(content: string): string {
  const timestamp = new Date()
  const formatted = timestamp.toISOString().replace("T", " ").slice(0, 19)
  return `[${formatted}] ${content}`
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "")
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed
  }
  return `http://${trimmed}`
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`
}

function stringifyData(data: unknown): string {
  if (data === undefined || data === null || data === "") {
    return ""
  }
  if (typeof data === "string") {
    return data
  }
  try {
    return JSON.stringify(data)
  } catch {
    return String(data)
  }
}

function truncate(value: string): string {
  return value.length > 8000 ? `${value.slice(0, 8000)}...` : value
}

function formatSseData(data: string): string {
  try {
    const parsed = JSON.parse(data) as LogMessage
    const content = parsed.content ?? data
    return parsed.id ? `[${parsed.id}] ${content}` : content
  } catch {
    return data
  }
}

function formatJsonRpcResponse(response: JsonRpcResponse): string {
  if (response.error) {
    return `[response:error] ${response.error.message ?? JSON.stringify(response.error)}`
  }

  const structured = response.result?.structuredContent
  if (structured) {
    const prefix = structured.success === false || response.result?.isError ? "[response:error]" : "[response]"
    const data = stringifyData(structured.data)
    return truncate(data ? `${prefix} ${structured.message ?? ""}: ${data}` : `${prefix} ${structured.message ?? ""}`)
  }

  const text = response.result?.content?.map((item) => item.text).filter(Boolean).join("\n")
  if (text) {
    return truncate(`[response] ${text}`)
  }

  return truncate(`[response] ${JSON.stringify(response)}`)
}

export function shouldLogJsonRpcResponse(toolName: string | undefined, response: JsonRpcResponse): boolean {
  if (toolName !== "decompile") {
    return true
  }

  const structured = response.result?.structuredContent
  return Boolean(response.error || response.result?.isError || !structured || structured.success === false)
}

function parseSseEvents(buffer: string, onEvent: (data: string) => void): string {
  let rest = buffer.replace(/\r\n/g, "\n")
  while (true) {
    const separatorIndex = rest.indexOf("\n\n")
    if (separatorIndex < 0) {
      return rest
    }

    const rawEvent = rest.slice(0, separatorIndex)
    rest = rest.slice(separatorIndex + 2)
    const data = rawEvent
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")

    if (data) {
      onEvent(data)
    }
  }
}

export function connectHttpTransport(options: ConnectionOptions): { send: (message: string) => void; dispose: () => void } {
  const baseUrl = normalizeBaseUrl(options.url)
  const abortController = new AbortController()
  let closed = false

  if (options.enabled) {
    options.onStatusChange("connecting")
    void (async () => {
      try {
        const response = await fetch(endpoint(baseUrl, "/log"), {
          headers: { Accept: "text/event-stream" },
          signal: abortController.signal
        })
        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`)
        }

        options.onStatusChange("connected")
        options.onLog(formatLog(`SSE connected: ${endpoint(baseUrl, "/log")}`))

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (!closed) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }
          buffer = parseSseEvents(buffer + decoder.decode(value, { stream: true }), (data) => {
            options.onLog(formatLog(formatSseData(data)))
          })
        }

        if (!closed) {
          options.onStatusChange("disconnected")
          options.onLog(formatLog(`SSE disconnected: ${endpoint(baseUrl, "/log")}`))
        }
      } catch (error) {
        if (closed || abortController.signal.aborted) {
          return
        }
        options.onStatusChange("error")
        options.onLog(formatLog(`SSE connect failed (${endpoint(baseUrl, "/log")}): ${String(error)}`))
      }
    })()
  }

  return {
    send(message: string) {
      if (!options.enabled) {
        options.onLog(formatLog("HTTP transport is disabled"))
        return
      }
      void (async () => {
        let toolName: string | undefined
        try {
          toolName = (JSON.parse(message) as JsonRpcRequest).params?.name
        } catch {
          // The backend response remains authoritative for malformed requests.
        }
        try {
          const response = await fetch(endpoint(baseUrl, "/mcp"), {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json"
            },
            body: message
          })
          const text = await response.text()
          if (!response.ok) {
            options.onLog(formatLog(`[response:error] HTTP ${response.status} ${response.statusText}: ${truncate(text)}`))
            return
          }
          try {
            const jsonResponse = JSON.parse(text) as JsonRpcResponse
            if (shouldLogJsonRpcResponse(toolName, jsonResponse)) {
              options.onLog(formatLog(formatJsonRpcResponse(jsonResponse)))
            }
          } catch {
            options.onLog(formatLog(`[response] ${truncate(text)}`))
          }
        } catch (error) {
          options.onStatusChange("error")
          options.onLog(formatLog(`HTTP request failed (${endpoint(baseUrl, "/mcp")}): ${String(error)}`))
        }
      })()
    },
    dispose() {
      closed = true
      abortController.abort()
    }
  }
}
