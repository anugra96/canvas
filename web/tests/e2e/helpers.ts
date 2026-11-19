import { expect, type Page } from '@playwright/test'

export async function createCanvas(page: Page, name = 'Untitled canvas') {
  await page.getByRole('button', { name: 'New canvas' }).click()
  const dialog = page.getByRole('dialog', { name: 'Name your canvas' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Canvas name').fill(name)
  await dialog.getByRole('button', { name: 'Create canvas' }).click()
}

export async function waitForSaved(page: Page) {
  await page.waitForTimeout(1300)
  await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 5000 })
}

const addLabels: Record<string, string> = {
  repository: 'Repository',
  actor: 'Actor',
  system: 'System',
  artifact: 'Artifact',
  schema: 'Schema',
  code: 'Code',
  note: 'Note',
}

export async function addCanvasItem(page: Page, item: string) {
  const label = addLabels[item] ?? item
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: label, exact: true }).click()
}

export async function runCanvasCommand(page: Page, label: string) {
  await page.getByRole('button', { name: 'More canvas actions' }).click()
  await page.getByRole('menuitem').filter({ hasText: label }).click()
}
