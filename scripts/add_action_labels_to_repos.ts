import { getRedwoodJSRepositoryId } from 'api/src/services/github'
import { createActionLabelsInRedwoodJSRepository } from 'api/src/services/labels'

export default async () => {
  const idPromises = await Promise.allSettled([
    getRedwoodJSRepositoryId('redwood'),
    getRedwoodJSRepositoryId('redwoodjs.com'),
  ])
  const ids = idPromises.map((res) => res.value)
  console.log({ ids })

  const labelPromises = await Promise.allSettled(
    ids.map(createActionLabelsInRedwoodJSRepository)
  )
  const labels = labelPromises.map((res) => res.value)
  console.log({ labels: JSON.stringify(labels, null, 2) })
}
