import fs from 'node:fs'
import path from 'node:path'

import { EventActions } from './github'

export let payload: {
  action: string
  issue?: Content
  pull_request?: Content
  repository: Record<string, any>
  organization: Record<string, any>
  sender: {
    login: string
  }
}

interface Content {
  id: string
  assignees: string[]
  labels: Array<{
    node_id: string
  }>
  milestone?: string
}

export let content: Content

type Sender = 'contributor' | 'coreTeam' | 'renovate'

type Payloads = `${EventActions}.${Sender}`

export function setPayload(eventAction: EventActions | Payloads) {
  payload = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'payloads', `${eventAction}.json`),
      'utf-8'
    )
  )

  content = payload.issue ?? payload.pull_request
}
