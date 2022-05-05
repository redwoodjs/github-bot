import { execSync } from 'child_process'
import path from 'path'

import { format } from 'date-fns'

export default async () => {
  execSync(
    `touch ${path.join(
      __dirname,
      `../notes/${format(new Date(), 'yyyy-MM-dd')}.excalidraw`
    )}`
  )
}
