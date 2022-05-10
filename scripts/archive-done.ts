import { addIdsToProcessEnv } from 'api/src/services/github'
import {
  getMainProjectDoneItems,
  updateMainProjectItemStatusFieldToArchived,
} from 'api/src/services/projects'

export default async ({ args: _args }) => {
  await addIdsToProcessEnv({ owner: 'redwoodjs', name: 'redwood' })

  const doneProjectItems = await getMainProjectDoneItems()
  const doneProjectItemIds = doneProjectItems.map(
    (projectItem) => projectItem.id
  )

  for (const itemId of doneProjectItemIds) {
    process.stdout.write('.')
    await updateMainProjectItemStatusFieldToArchived(itemId)
  }
}
