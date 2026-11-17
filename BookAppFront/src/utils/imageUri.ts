// Book providers can return legacy HTTP cover URLs. Request HTTPS directly
// so web rendering does not depend on the browser's mixed-content upgrade.
export function secureImageUri(uri: string | null | undefined): string | undefined {
  return uri?.trim().replace(/^http:\/\//i, 'https://') || undefined;
}
