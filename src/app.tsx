import { useEffect, useMemo, useState } from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { ActionMenu } from "./components/action-menu.js"
import { LogPanel } from "./components/log-panel.js"
import { ParamForm } from "./components/param-form.js"
import { buildPayload, menu, validateAction } from "./protocol.js"
import { appendLog, backToMenu, createInitialState, nextFocus, openAction, previousFocus, setConnectionStatus, updateFormValue, updateSelectedAction } from "./state.js"
import { connectHttpTransport } from "./ws.js"
import type { AppState } from "./types.js"
import type { Selection } from "@opentui/core"

type AppProps = {
  host: string
  port: number
  connectBackend: boolean
}

type MenuFocusTarget = "content" | "http-input" | "reconnect"

export function App({ host, port, connectBackend }: AppProps) {
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()
  const [state, setState] = useState(createInitialState)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [apiUrl, setApiUrl] = useState(`http://${host}:${port}`)
  const [connectUrl, setConnectUrl] = useState(`http://${host}:${port}`)
  const [reconnectVersion, setReconnectVersion] = useState(0)
  const [menuFocusTarget, setMenuFocusTarget] = useState<MenuFocusTarget>("content")
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const httpInputFocused = state.screen === "menu" && menuFocusTarget === "http-input"
  const reconnectFocused = state.screen === "menu" && menuFocusTarget === "reconnect"

  const connection = useMemo(() => {
    return connectHttpTransport({
      url: connectUrl,
      enabled: connectBackend,
      onLog: (message: string) => setState((current: AppState) => appendLog(current, message)),
      onStatusChange: (status) => setState((current: AppState) => setConnectionStatus(current, status))
    })
  }, [connectBackend, connectUrl, reconnectVersion])

  useEffect(() => {
    if (!connectBackend) {
      setState((current: AppState) => appendLog(setConnectionStatus(current, "idle"), "[local] backend integration disabled"))
    }
    return () => connection.dispose()
  }, [connectBackend, connection])

  useEffect(() => {
    const handleSelection = (selection: Selection) => {
      const text = selection.getSelectedText()
      if (!text) {
        return
      }
      renderer.copyToClipboardOSC52(text)
      setToastMessage(`Copied ${text.length} chars to clipboard`)
    }

    renderer.on("selection", handleSelection)
    return () => {
      renderer.off("selection", handleSelection)
    }
  }, [renderer])

  useEffect(() => {
    if (!toastMessage) {
      return
    }
    const timer = setTimeout(() => {
      setToastMessage(null)
    }, 3000)
    return () => clearTimeout(timer)
  }, [toastMessage])

  const reconnect = () => {
    setValidationError(null)
    setState((current: AppState) => appendLog(current, `[system] reconnect requested: ${apiUrl}`))
    setConnectUrl(apiUrl)
    setReconnectVersion((value) => value + 1)
  }

  const cycleMenuFocus = (backward: boolean) => {
    const order: MenuFocusTarget[] = ["http-input", "reconnect", "content"]
    const currentIndex = order.indexOf(menuFocusTarget)
    const nextIndex = backward
      ? (currentIndex - 1 + order.length) % order.length
      : (currentIndex + 1) % order.length
    setMenuFocusTarget(order[nextIndex])
  }

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      renderer.destroy()
      return
    }

    if (state.screen === "menu") {
      if (menuFocusTarget === "http-input") {
        if (key.name === "tab") {
          cycleMenuFocus(Boolean(key.shift))
          return
        }
        if (key.name === "escape") {
          setMenuFocusTarget("content")
        }
        return
      }

      if (menuFocusTarget === "reconnect") {
        if (key.name === "tab") {
          cycleMenuFocus(Boolean(key.shift))
          return
        }
        if (key.name === "enter" || key.name === "return") {
          reconnect()
          return
        }
        if (key.name === "escape") {
          setMenuFocusTarget("content")
        }
        return
      }

      if (key.name === "up") {
        setState((current: AppState) => updateSelectedAction(current, (current.selectedActionIndex - 1 + menu.length) % menu.length))
        return
      }
      if (key.name === "down") {
        setState((current: AppState) => updateSelectedAction(current, (current.selectedActionIndex + 1) % menu.length))
        return
      }
      if (key.name === "tab") {
        cycleMenuFocus(Boolean(key.shift))
        return
      }
      if (key.name === "enter" || key.name === "return") {
        setValidationError(null)
        setState((current: AppState) => openAction(current))
        return
      }
      return
    }

    const inputCount = menu[state.selectedActionIndex].params.length

    if (key.name === "escape") {
      setValidationError(null)
      setState((current: AppState) => backToMenu(current))
      return
    }
    if (key.name === "tab") {
      setState((current: AppState) => nextFocus(current, inputCount))
      return
    }
    if (key.shift && key.name === "tab") {
      setState((current: AppState) => previousFocus(current, inputCount))
      return
    }
    if ((key.name === "enter" || key.name === "return") && state.focusIndex === inputCount) {
      if (!validateAction(state.selectedActionIndex, state.formValues)) {
        setValidationError("Param Invalid")
        setState((current: AppState) => appendLog(current, "Param Invalid"))
        return
      }
      setValidationError(null)
      const payload = buildPayload(state.selectedActionIndex, state.formValues)
      setState((current: AppState) => appendLog(current, `[request] ${payload}`))
      connection.send(payload)
    }
  })

  if (width < 100 || height < 30) {
    return <text>Window need to larger than 100x30, current={width}x{height}</text>
  }

  return (
    <box width="100%" height="100%" flexDirection="column" padding={1} gap={1} position="relative">
      {toastMessage ? (
        <box position="absolute" top={0} right={2} zIndex={20} border borderColor="#3b82f6" backgroundColor="#172554" paddingX={1} paddingY={0}>
          <text fg="#bfdbfe">{toastMessage}</text>
        </box>
      ) : null}
      <box border borderColor="#2563eb" height={3} minHeight={3} maxHeight={3} paddingX={1} paddingY={0} flexDirection="row" alignItems="center" justifyContent="flex-start" gap={1}>
        <text fg="#93c5fd">HTTP</text>
        <box
          flexGrow={1}
          backgroundColor={httpInputFocused ? "#2563eb" : undefined}
          border={httpInputFocused}
          borderColor={httpInputFocused ? "#bfdbfe" : undefined}
        >
          <input value={apiUrl} onChange={setApiUrl} width="100%" focused={httpInputFocused} />
        </box>
        <box
          border
          borderColor={reconnectFocused ? "#bfdbfe" : "#22c55e"}
          backgroundColor={reconnectFocused ? "#2563eb" : undefined}
          paddingX={1}
          paddingY={0}
          flexGrow={0}
          flexShrink={0}
          alignSelf="center"
          width={13}
          focusable
          onMouseDown={() => {
            setMenuFocusTarget("reconnect")
            reconnect()
          }}
        >
          <text fg={reconnectFocused ? "#eff6ff" : "#22c55e"}>Reconnect</text>
        </box>
        <box flexGrow={0} flexShrink={0} width={12}>
          <text fg={state.connectionStatus === "connected" ? "#22c55e" : state.connectionStatus === "error" ? "#f87171" : "#facc15"}>
            {state.connectionStatus}
          </text>
        </box>
      </box>
      <box flexDirection="row" flexGrow={1} gap={1}>
        <box width="50%" flexGrow={1}>
          {state.screen === "menu" ? (
            <ActionMenu
              focused={menuFocusTarget === "content"}
              selectedIndex={state.selectedActionIndex}
              onChange={(index: number) => setState((current: AppState) => updateSelectedAction(current, index))}
              onSelect={(index: number) => {
                setValidationError(null)
                setState((current: AppState) => openAction(current, index))
              }}
            />
          ) : (
            <ParamForm
              actionIndex={state.selectedActionIndex}
              values={state.formValues}
              focusIndex={state.focusIndex}
              focused
              validationError={validationError}
              onChange={(index: number, value: string) => setState((current: AppState) => updateFormValue(current, index, value))}
            />
          )}
        </box>
        <box width="50%" flexGrow={1}>
          <LogPanel logs={state.logs} focused={false} />
        </box>
      </box>
    </box>
  )
}
