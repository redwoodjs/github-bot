jest.mock('fs', () => {
  const fs = jest.requireActual('fs')

  return {
    ...fs,
    readFileSync(filepath) {
      if (filepath.includes('private-key.pem')) {
        return 'private-key-pem'
      }

      return fs.readFileSync(filepath)
    },
  }
})
