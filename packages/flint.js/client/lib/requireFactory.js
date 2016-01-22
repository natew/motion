const parentFolderMatch = s => s.match(/\.\.\//g)

export default function requireFactory(root) {
  let app = ''

  function require(name, folder) {
    if (name.charAt(0) == '.') {
      let parentDirs = folder.split('/')
      let upDirs = parentFolderMatch(name)

      // remove from folder based on upwards ../
      if (upDirs && upDirs.length) {
        if (upDirs.length > parentDirs.length) {
          throw new Error(`The path ${name} is looking upwards above the root!`)
        }

        parentDirs.splice(-upDirs.length)
      }

      let parentPath = parentDirs.join('/')

      let cleanName = (parentPath ? parentPath + '/' : '')
        + name.replace(/^(\.\.?\/)+/, '')

      let pkg = root.exports[`${app}-internals`]

      // try /index for directory shorthand
      return pkg[cleanName] || pkg[`${cleanName}/index`]
    }

    // todo this looks jank
    if (name == 'bluebird')
      return root._bluebird
    if (name == 'React')
      return root.React
    if (name == 'ReactDOM')
      return root.ReactDOM

    // get pkg
    let pkg = root.exports[`${app}-externals`][name]

    // we may be waiting for packages reload
    if (!pkg) return

    // may not export a default
    if (!pkg.default)
      pkg.default = pkg

    return pkg
  }

  require.setApp = (appname) => {
    app = appname
  }

  return require
}