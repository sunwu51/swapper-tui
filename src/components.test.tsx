import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { ActionMenu } from "./components/action-menu.js"
import { LogPanel } from "./components/log-panel.js"
import { ParamForm } from "./components/param-form.js"

let setup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  setup?.renderer.destroy()
  setup = undefined
})

describe("components", () => {
  test("ActionMenu renders menu title and options", async () => {
    setup = await testRender(<ActionMenu focused selectedIndex={0} onChange={() => {}} onSelect={() => {}} />, {
      width: 70,
      height: 20
    })
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    expect(frame).toContain("Input the action?")
    expect(frame).toContain("Watch")
    expect(frame).toContain("FindSubclasses")
  })

  test("LogPanel renders logs and status", async () => {
    setup = await testRender(<LogPanel logs={["hello", "world"]} />, {
      width: 60,
      height: 16
    })
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    expect(frame).toContain("Logs")
    expect(frame).toContain("world")
  })

  test("ParamForm renders the per-action ClassLoader hash input", async () => {
    setup = await testRender(
      <ParamForm
        actionIndex={0}
        values={["demo.Service#run", "", "0", "3", "", ""]}
        focusIndex={1}
        focused
        validationError={null}
        onChange={() => {}}
      />,
      { width: 70, height: 24 }
    )
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("ClassLoaderHash (optional)")
  })
})
