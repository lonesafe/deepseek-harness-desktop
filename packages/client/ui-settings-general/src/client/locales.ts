/** Shell chrome and General-nav dictionaries; feature rows own their copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger': '设置',
  'title': '设置',
  'close': '关闭',
  'openDocument': '打开配置文件',
  'openDocument.error': '无法打开配置文件',
  'general.nav': '通用设置',
  'remote.title': '远程控制',
  'remote.description': '登录官网并开启后，可从手机或其他设备安全连接这台电脑。',
  'remote.manage': '管理',
} satisfies Record<string, string>

/** The settings namespace key union. */
export type SettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger': 'Settings',
  'title': 'Settings',
  'close': 'Close',
  'openDocument': 'Open configuration file',
  'openDocument.error': 'Could not open configuration file',
  'general.nav': 'General',
  'remote.title': 'Remote control',
  'remote.description': 'Sign in and enable it to securely use this computer from your phone or another device.',
  'remote.manage': 'Manage',
} satisfies Record<SettingsKey, string>
