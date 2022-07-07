import {
  getProjectFieldAndValueNamesToIds,
  getProjectItems,
} from 'api/src/services/projects/projects'
import { hasntBeenUpdatedInAWeek } from 'api/src/services/validate/validate'

export default async ({ args: _args }) => {
  process.env.OWNER = 'redwoodjs'

  await getProjectFieldAndValueNamesToIds()

  const triageItems = await getProjectItems('Triage')

  if (!triageItems.length) {
    console.log("There aren't any issues or PRs")
    return
  }

  const triageItemsByAssignee = triageItems
    // Hasn't been updated in a week
    .filter((triageItem) => {
      return hasntBeenUpdatedInAWeek(new Date(triageItem.content.updatedAt))
    })
    // Is assigned to someone
    .filter((triageItem) => {
      return triageItem.content.assignees.nodes.length
    })
    // Isn't assigned to jtoar
    .filter((triageItem) => {
      const [{ login }] = triageItem.content.assignees.nodes

      return login !== 'jtoar'
    })
    // Group by assignee
    .reduce((obj, triageItem) => {
      const [{ login }] = triageItem.content.assignees.nodes

      obj[login] =
        login in obj
          ? [...obj[login], triageItem.content.url]
          : [triageItem.content.url]

      return obj
    }, {})

  // Print
  for (const [key, triageItems] of Object.entries(triageItemsByAssignee)) {
    console.log(key)
    console.log('')
    for (const triageItem of triageItems) {
      console.log(`- ${triageItem}`)
    }
    console.log('')
  }
}
