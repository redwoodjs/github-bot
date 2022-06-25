import { createAppAuth } from '@octokit/auth-app'
import { rest } from 'msw'
import { Octokit } from 'octokit'
import SmeeClient from 'smee-client'

export const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.PRIVATE_KEY,
    installationId: process.env.GITHUB_INSTALLATION_ID,
  },
})

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

const coreTeamTriageUsernamesToIds = {
  callingmedic911: 'MDQ6VXNlcjI2Mjk5MDI',
  dac09: 'MDQ6VXNlcjE1MjE4Nzc=',
  dthyresson: 'MDQ6VXNlcjEwNTE2MzM=',
  jtoar: 'MDQ6VXNlcjMyOTkyMzM1',
  simoncrypta: 'MDQ6VXNlcjE4MDEzNTMy',
}

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

/**
 * For testing
 */

export const installationHandler = rest.post(
  `https://api.github.com/app/installations/${process.env.GITHUB_INSTALLATION_ID}/access_tokens`,
  (_req, res, _ctx) => res()
)
