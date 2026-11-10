import { expect, type Page } from '@playwright/test'

export async function createCanvas(page: Page, name = 'Untitled canvas') {
  await page.getByRole('button', { name: 'New canvas' }).click()
  const dialog = page.getByRole('dialog', { name: 'Name your canvas' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Canvas name').fill(name)
  await dialog.getByRole('button', { name: 'Create canvas' }).click()
}
