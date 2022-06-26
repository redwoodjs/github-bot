import fs from 'node:fs'
import path from 'node:path'

import { createAppAuth } from '@octokit/auth-app'
import { rest } from 'msw'
import { Octokit } from 'octokit'
import SmeeClient from 'smee-client'

export const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: process.env.GITHUB_APP_ID,
    privateKey:
      process.env.NODE_ENV === 'test'
        ? // From https://github.com/probot/probot/blob/529197ed60ec4d978622882c0a0d843221ef9711/test/e2e/e2e.test.ts#L67-L82
          '-----BEGIN RSA PRIVATE KEY-----\nMIIBOQIBAAJBAIILhiN9IFpaE0pUXsesuuoaj6eeDiAqCiE49WB1tMB8ZMhC37kY\nFl52NUYbUxb7JEf6pH5H9vqw1Wp69u78XeUCAwEAAQJAb88urnaXiXdmnIK71tuo\n/TyHBKt9I6Rhfzz0o9Gv7coL7a537FVDvV5UCARXHJMF41tKwj+zlt9EEUw7a1HY\nwQIhAL4F/VHWSPHeTgXYf4EaX2OlpSOk/n7lsFtL/6bWRzRVAiEArzJs2vopJitv\nA1yBjz3q2nX+zthk+GLXrJQkYOnIk1ECIHfeFV8TWm5gej1LxZquBTA5pINoqDVq\nNKZSuZEHqGEFAiB6EDrxkovq8SYGhIQsJeqkTMO8n94xhMRZlFmIQDokEQIgAq5U\nr1UQNnUExRh7ZT0kFbMfO9jKYZVlQdCL9Dn93vo=\n-----END RSA PRIVATE KEY-----'
        : fs.readFileSync(
            path.resolve(__dirname, '../../../private-key.pem'),
            'utf-8'
          ),
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
