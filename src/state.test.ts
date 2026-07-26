import { describe, expect, test } from "bun:test"
import { menu } from "./protocol.js"
import { appendLog, backToMenu, createInitialState, nextFocus, openAction, previousFocus, updateFormValue, updateSelectedAction } from "./state.js"

function actionIndex(name: string): number {
  const index = menu.findIndex((item) => item.name === name)
  if (index < 0) {
    throw new Error(`missing action ${name}`)
  }
  return index
}

describe("state helpers", () => {
  test("openAction builds form state", () => {
    const initial = updateSelectedAction(createInitialState(), actionIndex("ChangeBody"))
    const opened = openAction(initial)
    expect(opened.screen).toBe("form")
    expect(opened.focusIndex).toBe(0)
    expect(opened.formValues.length).toBe(5)
  })

  test("focus wraps across inputs and submit button", () => {
    const opened = openAction(updateSelectedAction(createInitialState(), actionIndex("Watch")))
    const inputCount = menu[actionIndex("Watch")].params.length
    expect(nextFocus(opened, inputCount).focusIndex).toBe(1)
    expect(nextFocus({ ...opened, focusIndex: inputCount }, inputCount).focusIndex).toBe(0)
    expect(previousFocus(opened, inputCount).focusIndex).toBe(inputCount)
  })

  test("updateFormValue and backToMenu keep expected data", () => {
    const opened = openAction(updateSelectedAction(createInitialState(), actionIndex("Decompile")))
    const updated = updateFormValue(opened, 0, "hello")
    expect(updated.formValues[0]).toBe("hello")
    expect(backToMenu(updated).screen).toBe("menu")
  })

  test("appendLog keeps newest messages first", () => {
    const state = appendLog(appendLog(createInitialState(), "first"), "second")
    expect(state.logs).toEqual(["first", "second"])
  })
})
