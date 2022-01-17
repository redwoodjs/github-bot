import { getNextCoreTeamTriageAssignee } from 'api/src/services/triage'

export default async () => {
  const id = await getNextCoreTeamTriageAssignee()
  console.log(id)
}
