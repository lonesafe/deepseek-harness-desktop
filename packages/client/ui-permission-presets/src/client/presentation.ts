/** Machine value of the preset that requires an explicit GUI risk gate. */
export const FULL_ACCESS_PRESET = 'danger-full-access'

/** Locale keys shared by every permission-preset picker. */
export type PermissionPresetLabelKey =
  | 'preset.readOnly'
  | 'preset.workspaceWrite'
  | 'preset.fullAccess'

const PRESET_LABEL_KEYS: Readonly<Record<string, PermissionPresetLabelKey>> = {
  'read-only': 'preset.readOnly',
  'workspace-write': 'preset.workspaceWrite',
  [FULL_ACCESS_PRESET]: 'preset.fullAccess',
}

/**
 * Convert conventional kebab-case preset names into user-facing title case.
 * @param name - host-supplied preset label or key.
 * @returns the title-cased conventional key, or a non-kebab label unchanged.
 */
export function displayPresetName(name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/**
 * Render a permission preset under its product label.
 * @param value - preset machine value.
 * @param name - host-supplied preset name.
 * @returns the Full access product label or the conventional display name.
 */
export function displayPermissionPreset(
  value: string,
  name: string,
  translate?: (key: PermissionPresetLabelKey) => string,
): string {
  const localeKey = PRESET_LABEL_KEYS[value]
  if (translate !== undefined && localeKey !== undefined) return translate(localeKey)
  return value === FULL_ACCESS_PRESET ? 'Full access' : displayPresetName(name)
}
