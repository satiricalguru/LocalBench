module.exports = {
  appId: 'com.localbench.app',
  productName: 'LocalBench',
  directories: {
    output: 'release'
  },
  files: ['dist/**/*', 'dist-electron/**/*'],
  asar: true,
  asarUnpack: [
    '**/node_modules/better-sqlite3/**/*'
  ],
  mac: {
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] }
    ],
    icon: 'public/icon.icns',
    category: 'public.app-category.developer-tools'
  },
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] }
    ],
    icon: 'public/icon.ico'
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true
  }
}
