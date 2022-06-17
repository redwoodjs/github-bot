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
 * For routing webhooks to localhost.
 */

let smeeClientStarted = false

export const startSmeeClient = () => {
  if (smeeClientStarted) {
    return
  }

  const smee = new SmeeClient({
    source: 'https://smee.io/AyeWlHVe8FLb25OU',
    target: 'http://localhost:8911/github',
    logger: console,
  })

  const events = smee.start()
  smeeClientStarted = true

  process.on('exit', () => {
    events.close()
    smeeClientStarted = false
  })
}

export const coreTeamTriageUsernamesToIds = {
  callingmedic911: 'MDQ6VXNlcjI2Mjk5MDI',
  dac09: 'MDQ6VXNlcjE1MjE4Nzc=',
  dthyresson: 'MDQ6VXNlcjEwNTE2MzM=',
  jtoar: 'MDQ6VXNlcjMyOTkyMzM1',
  simoncrypta: 'MDQ6VXNlcjE4MDEzNTMy',
}

export type CoreTeamTriage = keyof typeof coreTeamTriageUsernamesToIds

export const coreTeamTriage = Object.keys(coreTeamTriageUsernamesToIds)

export const coreTeamMaintainersUsernamesToIds = {
  cannikin: 'MDQ6VXNlcjMwMA==',
  mojombo: 'MDQ6VXNlcjE=',
  peterp: 'MDQ6VXNlcjQ0ODQ5',
  thedavidprice: 'MDQ6VXNlcjI5NTE=',
  Tobbe: 'MDQ6VXNlcjMwNzkz',
  alicelovescake: 'MDQ6VXNlcjY2NTQzNDQ5',
  ...coreTeamTriageUsernamesToIds,
}

export type CoreTeamMaintainers = keyof typeof coreTeamMaintainersUsernamesToIds

export const coreTeamMaintainers = Object.keys(
  coreTeamMaintainersUsernamesToIds
)
