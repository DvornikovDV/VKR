export async function copyInstallerJsonToClipboard(installerJson: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard API is unavailable.')
  }

  await navigator.clipboard.writeText(installerJson)
}
