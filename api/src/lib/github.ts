import fs from 'fs'
import path from 'path'

import { App, Octokit } from 'octokit'
import SmeeClient from 'smee-client'

export const app = new App({
  appId: process.env.GITHUB_APP_ID,
  privateKey: fs.readFileSync(
    path.resolve(__dirname, '../../../private-key.pem'),
    'utf-8'
  ),
})

export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})

/**
 * This is the preferred strategy,
 * but it isn't viable till GitHub allows apps to access projects beta.
 */
// let redwoodInstallation

// const full_name =
//   process.env.NODE_ENV === 'development'
//     ? process.env.DEV_REPO
//     : 'redwoodjs/redwood'

// export async function getRedwoodInstallation() {
//   if (redwoodInstallation) {
//     return redwoodInstallation
//   }

//   for await (const { octokit, repository } of app.eachRepository.iterator()) {
//     if (repository.full_name === full_name) {
//       redwoodInstallation = {
//         octokit,
//         repository,
//       }
//       return redwoodInstallation
//     }
//   }
// }

/**
 * For routing webhooks to localhost in local dev.
 */
export const startSmeeClient = () => {
  const smee = new SmeeClient({
    source: 'https://smee.io/AyeWlHVe8FLb25OU',
    target: 'http://localhost:8911/github',
    logger: console,
  })

  const events = smee.start()

  process.on('exit', () => {
    events.close()
  })
}

export const coreTeamTriage = {
  callingmedic911: {
    id: 'MDQ6VXNlcjI2Mjk5MDI',
  },
  jtoar: {
    id: 'MDQ6VXNlcjMyOTkyMzM1',
  },
  simoncrypta: {
    id: 'MDQ6VXNlcjE4MDEzNTMy',
  },
}

export const coreTeamTriageLogins = Object.keys(coreTeamTriage)

export const coreTeamMaintainers = {
  cannikin: {
    id: 'MDQ6VXNlcjMwMA==',
  },
  dac09: {
    id: 'MDQ6VXNlcjE1MjE4Nzc=',
  },
  dthyresson: {
    id: 'MDQ6VXNlcjEwNTE2MzM=',
  },
  mojombo: {
    id: 'MDQ6VXNlcjE=',
  },
  peterp: {
    id: 'MDQ6VXNlcjQ0ODQ5',
  },
  thedavidprice: {
    id: 'MDQ6VXNlcjI5NTE=',
  },
  Tobbe: {
    id: 'MDQ6VXNlcjMwNzkz',
  },
  alicelovescake: {
    id: 'MDQ6VXNlcjY2NTQzNDQ5',
  },
  ...coreTeamTriage,
}

export const coreTeamMaintainerLogins = Object.keys(coreTeamMaintainers)
