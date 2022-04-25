import { addIdsToProcessEnv } from 'api/src/services/github'
import {
  getReleaseProjectItems,
  updateReleaseStatusField,
} from 'api/src/services/release'

interface FieldValue {
  projectField: { name: string }
  value: string
}

interface ProjectItem {
  id: string
  title: string
  isArchived: boolean
  fieldValues: { nodes: Array<FieldValue> }
}

export default async ({ args: _args }) => {
  await addIdsToProcessEnv({ owner: 'redwoodjs', name: 'redwood' })

  const projectItems = (await getReleaseProjectItems()) as Array<ProjectItem>

  const doneProjectItems = projectItems
    .filter((projectItem) => {
      return projectItem.fieldValues.nodes.some((fieldValue) => {
        if (fieldValue.projectField.name === 'Status') {
          if (fieldValue.value === process.env.DONE_STATUS_FIELD_ID) {
            return true
          }
        }
      })
    })
    .map((projectItem) => projectItem.id)

  for (const itemId of doneProjectItems) {
    process.stdout.write('.')

    await updateReleaseStatusField({
      itemId,
      value: process.env.ARCHIVED_STATUS_FIELD_ID,
    })
  }
}
