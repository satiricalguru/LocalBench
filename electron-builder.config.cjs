module.exports = {
  appId: 'com.localbench.app',
  productName: 'LocalBench',
  files: ['dist/**/*', 'dist-electron/**/*'],
  mac: {
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] }
    ],
    icon: 'build/icon.icns',
    category: 'public.app-category.developer-tools'
  },
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] }
    ],
    icon: 'build/icon.ico'
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true
  }
}
